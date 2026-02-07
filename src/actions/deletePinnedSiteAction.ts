import { UndoableAction } from './types';
import { PinnedSite } from '../hooks/usePinnedSites';

interface PinnedSnapshot
{
  pin: PinnedSite;
  index: number;
  tabId?: number;
}

const STORAGE_KEY = 'pinnedSites';

/**
 * Undoable action for deleting one or more pinned sites.
 * Snapshots pin data and position before deletion so they can be restored on undo.
 * Closes associated tabs on do(). Undo restores pin data only (no tab reopening).
 */
export class DeletePinnedSiteAction implements UndoableAction
{
  description = '';
  private pinnedIds: string[];
  private snapshots: PinnedSnapshot[] = [];
  private getCurrentPins: () => PinnedSite[];
  private getTabIdForPinned?: (pinnedId: string) => number | undefined;

  constructor(
    pinnedIds: string[],
    getCurrentPins: () => PinnedSite[],
    getTabIdForPinned?: (pinnedId: string) => number | undefined
  )
  {
    this.pinnedIds = pinnedIds;
    this.getCurrentPins = getCurrentPins;
    this.getTabIdForPinned = getTabIdForPinned;
  }

  async do(): Promise<void>
  {
    const currentPins = this.getCurrentPins();
    const idSet = new Set(this.pinnedIds);

    // Snapshot each target pin with its index and tab association
    this.snapshots = [];
    for (let i = 0; i < currentPins.length; i++)
    {
      const pin = currentPins[i];
      if (idSet.has(pin.id))
      {
        const snapshot: PinnedSnapshot = {
          pin: { ...pin },
          index: i,
        };

        if (this.getTabIdForPinned)
        {
          const tabId = this.getTabIdForPinned(pin.id);
          if (tabId !== undefined)
          {
            snapshot.tabId = tabId;
          }
        }

        this.snapshots.push(snapshot);
      }
    }

    // Build description
    if (this.snapshots.length === 1)
    {
      const name = this.snapshots[0].pin.title || this.snapshots[0].pin.url;
      this.description = `Unpinned "${name}"`;
    }
    else
    {
      this.description = `Unpinned ${this.snapshots.length} sites`;
    }

    if (import.meta.env.DEV)
    {
      console.log(`[DeletePinnedSiteAction] do: removing ${this.snapshots.length} pins:`,
        this.snapshots.map(s => `"${s.pin.title}" (id=${s.pin.id}, idx=${s.index}, tabId=${s.tabId ?? 'none'})`));
    }

    // Close associated tabs
    const tabIds = this.snapshots
      .map(s => s.tabId)
      .filter((id): id is number => id !== undefined);
    if (tabIds.length > 0)
    {
      try { await chrome.tabs.remove(tabIds); }
      catch { /* tabs may already be closed */ }
    }

    // Remove pins from storage
    const remaining = currentPins.filter(p => !idSet.has(p.id));
    await chrome.storage.local.set({ [STORAGE_KEY]: remaining });
  }

  async undo(): Promise<void>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[DeletePinnedSiteAction] undo: restoring ${this.snapshots.length} pins`);
    }

    // Read current pins from storage
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const currentPins: PinnedSite[] = result[STORAGE_KEY] || [];

    // Insert snapshots back at their original indices (sort ascending so splice works correctly)
    const sorted = [...this.snapshots].sort((a, b) => a.index - b.index);
    for (const snapshot of sorted)
    {
      const insertAt = Math.min(snapshot.index, currentPins.length);
      currentPins.splice(insertAt, 0, snapshot.pin);
    }

    // Write back to storage
    await chrome.storage.local.set({ [STORAGE_KEY]: currentPins });

    if (import.meta.env.DEV)
    {
      console.log('[DeletePinnedSiteAction] undo: complete');
    }
  }
}
