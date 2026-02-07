import { UndoableAction } from './types';
import { truncateTitle } from '../utils/truncateTitle';
import { Space } from '../contexts/SpacesContext';

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

const SPACES_STORAGE_KEY = 'spaces';

/**
 * Undoable action for deleting a space.
 * Snapshots the space definition and its grouped tabs before deletion,
 * so the space and tabs can be restored on undo.
 */
export class DeleteSpaceAction implements UndoableAction
{
  description = '';
  private spaceId: string;
  private getSpaces: () => Space[];
  private windowId: number;
  private snapshot: SpaceSnapshot | null = null;
  private getItemKeyForTab?: (tabId: number) => string | null;
  private restoreAssociation?: (tabId: number, itemKey: string) => Promise<void>;

  constructor(
    spaceId: string,
    getSpaces: () => Space[],
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

    // Remove space from storage
    const remaining = currentSpaces.filter(s => s.id !== this.spaceId);
    await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: remaining });

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

    // Restore space in storage at original index
    const result = await chrome.storage.local.get([SPACES_STORAGE_KEY]);
    const currentSpaces: Space[] = result[SPACES_STORAGE_KEY] || [];
    const insertAt = Math.min(this.snapshot.index, currentSpaces.length);
    currentSpaces.splice(insertAt, 0, this.snapshot.space);
    await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: currentSpaces });

    // Recreate tabs sorted by index ascending
    if (this.snapshot.tabs.length > 0)
    {
      const sorted = [...this.snapshot.tabs].sort((a, b) => a.index - b.index);
      const newTabIds: number[] = [];

      for (const tabSnapshot of sorted)
      {
        try
        {
          const newTab = await chrome.tabs.create({
            url: tabSnapshot.url,
            active: false,
            windowId: this.windowId,
            index: tabSnapshot.index,
          });

          if (!newTab.id) continue;
          newTabIds.push(newTab.id);

          if (import.meta.env.DEV)
          {
            console.log(`[DeleteSpaceAction] undo: created tab "${tabSnapshot.title}" → id=${newTab.id} (idx=${tabSnapshot.index})`);
          }

          // Restore association
          if (tabSnapshot.itemKey && this.restoreAssociation)
          {
            try
            {
              await this.restoreAssociation(newTab.id, tabSnapshot.itemKey);
            }
            catch (err)
            {
              console.error(`[DeleteSpaceAction] undo: failed to restore association for tab ${newTab.id}:`, err);
            }
          }
        }
        catch (err)
        {
          console.error(`[DeleteSpaceAction] undo: failed to create tab "${tabSnapshot.title}":`, err);
        }
      }

      // Re-create tab group with space name and color
      if (newTabIds.length > 0)
      {
        try
        {
          const groupId = await chrome.tabs.group({
            tabIds: newTabIds,
            createProperties: { windowId: this.windowId },
          });
          await chrome.tabGroups.update(groupId, {
            title: this.snapshot.space.name,
            color: this.snapshot.space.color,
          });

          if (import.meta.env.DEV)
          {
            console.log(`[DeleteSpaceAction] undo: created group "${this.snapshot.space.name}" (id=${groupId})`);
          }
        }
        catch (err)
        {
          console.error('[DeleteSpaceAction] undo: failed to create tab group:', err);
        }
      }
    }

    if (import.meta.env.DEV)
    {
      console.log('[DeleteSpaceAction] undo: complete');
    }
  }
}
