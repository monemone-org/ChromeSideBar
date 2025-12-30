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
  pinnedSites: PinnedSite[];
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
  tabGroups: TabGroupBackup[];
}

// Type guard to check if a file is a full backup vs pinned-only
export function isFullBackup(data: unknown): data is FullBackup {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    'bookmarks' in data &&
    'tabGroups' in data
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

// Import bookmarks recursively
async function importBookmarkNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId: string
): Promise<void> {
  if (node.url) {
    // It's a bookmark
    await chrome.bookmarks.create({
      parentId,
      title: node.title,
      url: node.url,
    });
  } else if (node.children) {
    // It's a folder
    const folder = await chrome.bookmarks.create({
      parentId,
      title: node.title,
    });
    for (const child of node.children) {
      await importBookmarkNode(child, folder.id);
    }
  }
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
  bookmarksImported: boolean;
  tabGroupsCount: number;
}

// Import full backup
export async function importFullBackup(
  backup: FullBackup,
  bookmarkMode: BookmarkImportMode,
  importTabGroupsFlag: boolean,
  savePinnedSites: (sites: PinnedSite[]) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    pinnedSitesCount: 0,
    bookmarksImported: false,
    tabGroupsCount: 0,
  };

  // Import pinned sites (savePinnedSites will regenerate IDs)
  if (backup.pinnedSites && backup.pinnedSites.length > 0) {
    savePinnedSites(backup.pinnedSites);
    result.pinnedSitesCount = backup.pinnedSites.length;
  }

  // Import bookmarks
  if (backup.bookmarks && backup.bookmarks.length > 0) {
    const bookmarkBar = backup.bookmarks.find(n => n.title === 'Bookmarks Bar' || n.id === '1');
    const otherBookmarks = backup.bookmarks.find(n => n.title === 'Other Bookmarks' || n.id === '2');

    if (bookmarkMode === 'replace') {
      // Clear and replace existing bookmarks
      if (bookmarkBar?.children) {
        await clearBookmarkFolder('1');
        for (const child of bookmarkBar.children) {
          await importBookmarkNode(child, '1');
        }
      }
      if (otherBookmarks?.children) {
        await clearBookmarkFolder('2');
        for (const child of otherBookmarks.children) {
          await importBookmarkNode(child, '2');
        }
      }
    } else {
      // Create in "Imported Bookmarks {date}" folder
      const dateStr = new Date().toLocaleDateString();
      const importFolder = await chrome.bookmarks.create({
        parentId: '1',
        title: `Imported Bookmarks ${dateStr}`,
      });

      for (const topLevel of backup.bookmarks) {
        if (topLevel.children) {
          for (const child of topLevel.children) {
            await importBookmarkNode(child, importFolder.id);
          }
        }
      }
    }
    result.bookmarksImported = true;
  }

  // Import tab groups
  if (importTabGroupsFlag && backup.tabGroups && backup.tabGroups.length > 0) {
    await importTabGroups(backup.tabGroups);
    result.tabGroupsCount = backup.tabGroups.length;
  }

  return result;
}
