import { UndoableAction } from './types';
import { truncateTitle } from '../utils/truncateTitle';
import { Space } from '../contexts/SpacesContext';
import { toChromeColor } from '../utils/groupColors';
import { spaceManagerProxy } from '../managers/proxies/spaceManagerProxy';
import { spaceTabManagerProxy } from '../managers/proxies/spaceTabManagerProxy';

interface TabSnapshot
{
  tabId: number;
  url: string;
  title: string;
  index: number;
  itemKey?: string;
}

interface SpaceSnapshot
{
  space: Space;
  index: number;
  tabs: TabSnapshot[];
}

/**
 * Undoable action for deleting a space.
 * Snapshots the space definition and its grouped tabs before deletion,
 * so the space and tabs can be restored on undo.
 */
export class DeleteSpaceAction implements UndoableAction
{
  description = '';
  private spaceId: string;
  private getSpaces: () => readonly Space[];
  private windowId: number;
  private snapshot: SpaceSnapshot | null = null;
  private getItemKeyForTab?: (tabId: number) => string | null;
  private restoreAssociation?: (tabId: number, itemKey: string) => Promise<void>;

  constructor(
    spaceId: string,
    getSpaces: () => readonly Space[],
    windowId: number,
    getItemKeyForTab?: (tabId: number) => string | null,
    restoreAssociation?: (tabId: number, itemKey: string) => Promise<void>
  )
  {
    this.spaceId = spaceId;
    this.getSpaces = getSpaces;
    this.windowId = windowId;
    this.getItemKeyForTab = getItemKeyForTab;
    this.restoreAssociation = restoreAssociation;
  }

  async do(): Promise<void>
  {
    const currentSpaces = this.getSpaces();
    const spaceIndex = currentSpaces.findIndex(s => s.id === this.spaceId);
    if (spaceIndex === -1)
    {
      throw new Error(`Space "${this.spaceId}" not found`);
    }

    const space = currentSpaces[spaceIndex];

    // Snapshot the space
    this.snapshot = {
      space: { ...space },
      index: spaceIndex,
      tabs: [],
    };

    // Find Chrome tab group matching the space name
    try
    {
      const groups = await chrome.tabGroups.query({ windowId: this.windowId, title: space.name });
      if (groups.length > 0)
      {
        const tabs = await chrome.tabs.query({ groupId: groups[0].id });

        // Snapshot each tab
        for (const tab of tabs)
        {
          if (tab.id === undefined) continue;

          const tabSnapshot: TabSnapshot = {
            tabId: tab.id,
            url: tab.url || 'chrome://newtab',
            title: tab.title || '',
            index: tab.index,
          };

          // Capture association
          if (this.getItemKeyForTab)
          {
            const itemKey = this.getItemKeyForTab(tab.id);
            if (itemKey)
            {
              tabSnapshot.itemKey = itemKey;
            }
          }

          this.snapshot.tabs.push(tabSnapshot);
        }

        // Close all tabs in the group
        const tabIds = this.snapshot.tabs.map(t => t.tabId);
        if (tabIds.length > 0)
        {
          await chrome.tabs.remove(tabIds);
        }
      }
    }
    catch (err)
    {
      if (import.meta.env.DEV)
      {
        console.error('[DeleteSpaceAction] do: failed to close group tabs:', err);
      }
    }

    // Remove space from storage, routed through SpaceManager so its
    // in-memory cache stays in sync (Case 3 - see the shared-storage
    // decision doc). Awaited so an undo straight afterwards can't reach
    // background before the removal does.
    await spaceManagerProxy.removeSpace(this.spaceId);

    // Build description
    this.description = `Deleted space "${truncateTitle(space.name)}"`;


    if (import.meta.env.DEV)
    {
      console.log(`[DeleteSpaceAction] do: deleted space "${space.name}" `
        + `(idx=${spaceIndex}, tabs=${this.snapshot.tabs.length})`);
    }
  }

  async undo(): Promise<void>
  {
    if (!this.snapshot)
    {
      throw new Error('[DeleteSpaceAction] undo: no snapshot available');
    }

    if (import.meta.env.DEV)
    {
      console.log(`[DeleteSpaceAction] undo: restoring space "${this.snapshot.space.name}" `
        + `with ${this.snapshot.tabs.length} tabs`);
    }

    // Restore space in storage at its original index, or at the end if the
    // list has since shrunk below it. SpaceManager does the insert against
    // its own list, so nothing here has to read the current list first.
    await spaceManagerProxy.addSpace(this.snapshot.space, this.snapshot.index);

    // Recreate tabs sorted by index ascending
    if (this.snapshot.tabs.length > 0)
    {
      const sorted = [...this.snapshot.tabs].sort((a, b) => a.index - b.index);

      // Every tab goes back into one group with the space's name and color.
      // SpaceTabManager creates each tab and puts it in that group as one
      // job, so background's own grouping of the new tab cannot move it in
      // between - see docs/decisions/2026-11-23-new-tab-grouping-two-writers.md.
      // The first tab creates the group; the rest join it by id, and would
      // recreate it if it had somehow gone in the meantime.
      const newGroup = { title: this.snapshot.space.name, color: toChromeColor(this.snapshot.space.color) };
      let spaceGroupId: number | undefined;

      // One tab at a time, in index order, so each lands where it was
      for (const tabSnapshot of sorted)
      {
        try
        {
          const { tabIds, groupId } = await spaceTabManagerProxy.createTabs(
            this.windowId,
            [{ url: tabSnapshot.url, index: tabSnapshot.index }],
            { kind: 'group', groupId: spaceGroupId, newGroup }
          );
          spaceGroupId = groupId ?? spaceGroupId;

          const newTabId = tabIds[0];
          if (newTabId === undefined) continue;

          if (import.meta.env.DEV)
          {
            console.log(`[DeleteSpaceAction] undo: created tab "${tabSnapshot.title}" → id=${newTabId} (idx=${tabSnapshot.index}, group=${groupId})`);
          }

          // Restore association
          if (tabSnapshot.itemKey && this.restoreAssociation)
          {
            try
            {
              await this.restoreAssociation(newTabId, tabSnapshot.itemKey);
            }
            catch (err)
            {
              console.error(`[DeleteSpaceAction] undo: failed to restore association for tab ${newTabId}:`, err);
            }
          }
        }
        catch (err)
        {
          console.error(`[DeleteSpaceAction] undo: failed to create tab "${tabSnapshot.title}":`, err);
        }
      }
    }

    if (import.meta.env.DEV)
    {
      console.log('[DeleteSpaceAction] undo: complete');
    }
  }
}
