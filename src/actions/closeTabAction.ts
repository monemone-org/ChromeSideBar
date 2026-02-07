import { UndoableAction } from './types';

interface TabSnapshot
{
  tabId: number;
  url: string;
  title: string;
  index: number;
  groupId: number;           // -1 = ungrouped
  groupTitle?: string;       // For group recreation on undo
  groupColor?: chrome.tabGroups.ColorEnum;
  itemKey?: string;          // "bookmark-{id}" or "pinned-{id}"
}

/**
 * Undoable action for closing one or more browser tabs.
 * Snapshots tab info (URL, index, group, associations) before closing
 * so they can be restored on undo.
 */
export class CloseTabAction implements UndoableAction
{
  description = '';
  private tabIds: number[];
  private windowId: number;
  private snapshots: TabSnapshot[] = [];
  private getItemKeyForTab?: (tabId: number) => string | null;
  private restoreAssociation?: (tabId: number, itemKey: string) => Promise<void>;

  constructor(
    tabIds: number[],
    windowId: number,
    getItemKeyForTab?: (tabId: number) => string | null,
    restoreAssociation?: (tabId: number, itemKey: string) => Promise<void>
  )
  {
    this.tabIds = tabIds;
    this.windowId = windowId;
    this.getItemKeyForTab = getItemKeyForTab;
    this.restoreAssociation = restoreAssociation;
  }

  async do(): Promise<void>
  {
    // Snapshot each tab before closing
    this.snapshots = [];
    const groupCache = new Map<number, { title: string; color: chrome.tabGroups.ColorEnum }>();

    for (const tabId of this.tabIds)
    {
      try
      {
        const tab = await chrome.tabs.get(tabId);
        const snapshot: TabSnapshot = {
          tabId,
          url: tab.url || 'chrome://newtab',
          title: tab.title || '',
          index: tab.index,
          groupId: tab.groupId ?? -1,
        };

        // Capture group info (cached per groupId)
        if (snapshot.groupId !== -1)
        {
          if (!groupCache.has(snapshot.groupId))
          {
            try
            {
              const group = await chrome.tabGroups.get(snapshot.groupId);
              groupCache.set(snapshot.groupId, {
                title: group.title || '',
                color: group.color,
              });
            }
            catch { /* group may not exist */ }
          }
          const groupInfo = groupCache.get(snapshot.groupId);
          if (groupInfo)
          {
            snapshot.groupTitle = groupInfo.title;
            snapshot.groupColor = groupInfo.color;
          }
        }

        // Capture bookmark/pinned association
        if (this.getItemKeyForTab)
        {
          const itemKey = this.getItemKeyForTab(tabId);
          if (itemKey)
          {
            snapshot.itemKey = itemKey;
          }
        }

        this.snapshots.push(snapshot);
      }
      catch
      {
        // Tab may already be gone — skip
      }
    }

    // Build description
    if (this.snapshots.length === 1)
    {
      const name = this.snapshots[0].title || this.snapshots[0].url;
      this.description = `Closed "${name}"`;
    }
    else
    {
      this.description = `Closed ${this.snapshots.length} tabs`;
    }

    if (import.meta.env.DEV)
    {
      console.log(`[CloseTabAction] do: closing ${this.snapshots.length} tabs:`,
        this.snapshots.map(s => `"${s.title}" (tabId=${s.tabId}, idx=${s.index}, group=${s.groupTitle ?? 'none'})`));
    }

    // Close all tabs in a single API call
    const idsToClose = this.snapshots.map(s => s.tabId);
    if (idsToClose.length > 0)
    {
      await chrome.tabs.remove(idsToClose);
    }
  }

  async undo(): Promise<void>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[CloseTabAction] undo: restoring ${this.snapshots.length} tabs`);
    }

    // Sort by index ascending so tabs are recreated in correct positional order
    const sorted = [...this.snapshots].sort((a, b) => a.index - b.index);

    // Track group title+color -> new groupId mapping (for groups that need recreation)
    const groupMap = new Map<string, number>();

    for (const snapshot of sorted)
    {
      try
      {
        // Recreate the tab
        const newTab = await chrome.tabs.create({
          url: snapshot.url,
          active: false,
          windowId: this.windowId,
          index: snapshot.index,
        });

        if (!newTab.id) continue;

        if (import.meta.env.DEV)
        {
          console.log(`[CloseTabAction] undo: created tab "${snapshot.title}" → id=${newTab.id} `
            + `(idx=${snapshot.index}, group=${snapshot.groupTitle ?? 'none'})`);
        }

        // Restore group membership
        if (snapshot.groupId !== -1 && snapshot.groupTitle !== undefined)
        {
          const groupKey = `${snapshot.groupTitle}|${snapshot.groupColor}`;

          if (groupMap.has(groupKey))
          {
            // Group already recreated in this undo batch — add tab to it
            await chrome.tabs.group({ tabIds: [newTab.id], groupId: groupMap.get(groupKey)! });
          }
          else
          {
            // Try original groupId first (still exists if not all its tabs were closed)
            let targetGroupId: number | null = null;

            try
            {
              const orig = await chrome.tabGroups.get(snapshot.groupId);
              if (orig) targetGroupId = snapshot.groupId;
            }
            catch { /* original group gone */ }

            if (targetGroupId)
            {
              await chrome.tabs.group({ tabIds: [newTab.id], groupId: targetGroupId });
              groupMap.set(groupKey, targetGroupId);
            }
            else
            {
              // Original group gone — create new group
              const newGroupId = await chrome.tabs.group({
                tabIds: [newTab.id],
                createProperties: { windowId: this.windowId },
              });
              await chrome.tabGroups.update(newGroupId, {
                title: snapshot.groupTitle,
                color: snapshot.groupColor,
              });
              groupMap.set(groupKey, newGroupId);
            }
          }
        }

        // Restore bookmark/pinned association
        if (snapshot.itemKey && this.restoreAssociation)
        {
          try
          {
            await this.restoreAssociation(newTab.id, snapshot.itemKey);
          }
          catch (err)
          {
            console.error(`[CloseTabAction] undo: failed to restore association for tab ${newTab.id}:`, err);
          }
        }
      }
      catch (err)
      {
        console.error(`[CloseTabAction] undo: failed to restore tab "${snapshot.title}":`, err);
      }
    }

    if (import.meta.env.DEV)
    {
      console.log('[CloseTabAction] undo: complete');
    }
  }
}
