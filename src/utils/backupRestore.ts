import { PinnedSite } from '../hooks/usePinnedSites';

export interface TabGroupBackup {
  title: string;
  color: chrome.tabGroups.ColorEnum;
  tabs: {
    url: string;
    title: string;
    pinned: boolean;
  }[];
}

export interface FullBackup {
  version: 1;
  exportedAt: string;
  pinnedSites?: PinnedSite[];
  bookmarks?: chrome.bookmarks.BookmarkTreeNode[];
  tabGroups?: TabGroupBackup[];
}

// Type guard to check if a file is a backup (has version field)
export function isFullBackup(data: unknown): data is FullBackup {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    'exportedAt' in data
  );
}

// Export all data (bookmarks, tabs+groups, pinned sites)
export async function exportFullBackup(
  pinnedSites: PinnedSite[],
  bookmarks: chrome.bookmarks.BookmarkTreeNode[]
): Promise<void> {
  // Get current tabs and tab groups
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  // Build tab groups with their tabs
  const tabGroups: TabGroupBackup[] = groups.map(group => ({
    title: group.title || '',
    color: group.color,
    tabs: tabs
      .filter(tab => tab.groupId === group.id)
      .map(tab => ({
        url: tab.url || '',
        title: tab.title || '',
        pinned: tab.pinned || false,
      })),
  }));

  const backup: FullBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    pinnedSites,
    bookmarks,
    tabGroups,
  };

  const data = JSON.stringify(backup, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sidebar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export type BookmarkImportMode = 'replace' | 'folder';
export type PinnedSitesImportMode = 'replace' | 'append';
export type TabGroupsImportMode = 'replace' | 'append';

// Import bookmarks recursively, returns count of bookmarks created
async function importBookmarkNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId: string
): Promise<number> {
  let count = 0;
  if (node.url) {
    // It's a bookmark
    await chrome.bookmarks.create({
      parentId,
      title: node.title,
      url: node.url,
    });
    count = 1;
  } else if (node.children) {
    // It's a folder
    const folder = await chrome.bookmarks.create({
      parentId,
      title: node.title,
    });
    for (const child of node.children) {
      count += await importBookmarkNode(child, folder.id);
    }
  }
  return count;
}

// Clear all bookmarks in a folder
async function clearBookmarkFolder(folderId: string): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId);
  for (const child of children) {
    await chrome.bookmarks.removeTree(child.id);
  }
}

// Import tab groups by creating tabs and grouping them
async function importTabGroups(tabGroups: TabGroupBackup[]): Promise<void> {
  for (const group of tabGroups) {
    if (group.tabs.length === 0) continue;

    // Create all tabs for this group
    const createdTabIds: number[] = [];
    for (const tabInfo of group.tabs) {
      const tab = await chrome.tabs.create({
        url: tabInfo.url,
        active: false,
        pinned: tabInfo.pinned,
      });
      if (tab.id) {
        createdTabIds.push(tab.id);
      }
    }

    // Group the tabs
    if (createdTabIds.length > 0) {
      const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
      await chrome.tabGroups.update(groupId, {
        title: group.title,
        color: group.color,
      });
    }
  }
}

export interface ImportResult {
  pinnedSitesCount: number;
  bookmarksCount: number;
  tabGroupsCount: number;
}

export interface ImportOptions {
  importPinnedSites: boolean;
  pinnedSitesMode: PinnedSitesImportMode;
  importBookmarks: boolean;
  bookmarkMode: BookmarkImportMode;
  importTabGroups: boolean;
  tabGroupsMode: TabGroupsImportMode;
}

// Close all tabs in current window except one (Chrome requires at least one tab)
// Returns the ID of the blank tab created to keep the window open
async function closeAllTabs(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  if (tabs.length === 0) return undefined;

  // Create a new blank tab first (Chrome won't allow closing all tabs)
  const newTab = await chrome.tabs.create({ url: 'about:blank' });

  // Close all other tabs
  const tabIdsToClose = tabs
    .filter(tab => tab.id && tab.id !== newTab.id)
    .map(tab => tab.id as number);

  if (tabIdsToClose.length > 0) {
    await chrome.tabs.remove(tabIdsToClose);
  }

  return newTab.id;
}

// Import full backup
export async function importFullBackup(
  backup: FullBackup,
  options: ImportOptions,
  replacePinnedSites: (sites: PinnedSite[]) => void,
  appendPinnedSites: (sites: PinnedSite[]) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    pinnedSitesCount: 0,
    bookmarksCount: 0,
    tabGroupsCount: 0,
  };

  // Import pinned sites
  if (options.importPinnedSites && backup.pinnedSites && backup.pinnedSites.length > 0) {
    if (options.pinnedSitesMode === 'replace') {
      replacePinnedSites(backup.pinnedSites);
    } else {
      appendPinnedSites(backup.pinnedSites);
    }
    result.pinnedSitesCount = backup.pinnedSites.length;
  }

  // Import bookmarks
  if (options.importBookmarks && backup.bookmarks && backup.bookmarks.length > 0) {
    const bookmarkBar = backup.bookmarks.find(n => n.title === 'Bookmarks Bar' || n.id === '1');
    const otherBookmarks = backup.bookmarks.find(n => n.title === 'Other Bookmarks' || n.id === '2');

    if (options.bookmarkMode === 'replace') {
      // Clear and replace existing bookmarks
      if (bookmarkBar?.children) {
        await clearBookmarkFolder('1');
        for (const child of bookmarkBar.children) {
          result.bookmarksCount += await importBookmarkNode(child, '1');
        }
      }
      if (otherBookmarks?.children) {
        await clearBookmarkFolder('2');
        for (const child of otherBookmarks.children) {
          result.bookmarksCount += await importBookmarkNode(child, '2');
        }
      }
    } else {
      // Create in "Other Bookmarks" as a subfolder
      const dateStr = new Date().toLocaleDateString();
      const importFolder = await chrome.bookmarks.create({
        parentId: '2', // Other Bookmarks
        title: `Imported Bookmarks ${dateStr}`,
      });

      for (const topLevel of backup.bookmarks) {
        if (topLevel.children) {
          for (const child of topLevel.children) {
            result.bookmarksCount += await importBookmarkNode(child, importFolder.id);
          }
        }
      }
    }
  }

  // Import tab groups
  if (options.importTabGroups && backup.tabGroups && backup.tabGroups.length > 0) {
    let blankTabId: number | undefined;
    if (options.tabGroupsMode === 'replace') {
      blankTabId = await closeAllTabs();
    }
    await importTabGroups(backup.tabGroups);
    result.tabGroupsCount = backup.tabGroups.length;

    // Close the blank tab if other tabs exist
    if (blankTabId) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      if (tabs.length > 1) {
        await chrome.tabs.remove(blankTabId);
      }
    }
  }

  return result;
}
