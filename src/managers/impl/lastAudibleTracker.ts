// LastAudibleTracker - tracks the most recently audible tabs (in memory).
//
// Background-side implementation of shared/lastAudibleTrackerApi.ts. The
// sidebar reaches getAudioTabLists through
// proxies/lastAudibleTrackerProxy.ts; setLastAudibleTabId, clearIfMatches and
// load are background-internal.
//
// Holds a TabHistoryManager, which supplies the activation order
// getAudioTabLists ranks the non-playing half by. The dependency only runs
// LastAudibleTracker -> TabHistoryManager and nothing points back, so there is
// no cycle.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { AudioTabLists, LastAudibleTrackerApi } from '../shared/lastAudibleTrackerApi';
import { TabHistoryManager } from './tabHistoryManager';

export class LastAudibleTracker implements RoutedManager, LastAudibleTrackerApi
{
  static STORAGE_KEY = 'bg_lastAudibleTabIds';
  static MAX_HISTORY_SIZE = 5;

  readonly managerId = ManagerId.LAST_AUDIBLE;

  #lastAudibleTabIds: number[] = [];

  #historyManager: TabHistoryManager;

  constructor(historyManager: TabHistoryManager)
  {
    this.#historyManager = historyManager;
  }

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    switch (method)
    {
      case 'getAudioTabLists':
        return this.getAudioTabLists(message.windowId as number);

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  /**
   * The accessor that keeps #lastAudibleTabIds private. getAudioTabLists
   * below is its only caller now, but the list stays behind a copy either
   * way.
   */
  getLastAudibleTabIds(): number[]
  {
    return [...this.#lastAudibleTabIds];
  }

  /**
   * Returns lists of playing and recently-played audio tabs.
   * - playingTabIds: currently audible tabs (ordered by play-start time)
   * - historyTabIds: recently stopped audio tabs (ordered by activation recency)
   *
   * Queries the window's tabs itself rather than being handed them, so the
   * caller only has to name the window it means.
   */
  async getAudioTabLists(windowId: number): Promise<AudioTabLists>
  {
    const allTabs = await chrome.tabs.query({ windowId });

    const audibleTabIds = new Set(
      allTabs.filter(t => t.audible && t.id !== undefined).map(t => t.id!)
    );
    const lastAudibleIds = this.getLastAudibleTabIds();

    // Playing tabs: from lastAudibleIds, filtered to currently audible (keeps play-start order)
    const playingTabIds = lastAudibleIds.filter(id => audibleTabIds.has(id));

    // Include any audible tabs not yet in history (just started playing)
    for (const tab of allTabs)
    {
      if (tab.audible && tab.id !== undefined && !playingTabIds.includes(tab.id))
      {
        playingTabIds.push(tab.id);
      }
    }

    // Non-playing tabs from history
    const historyTabIds = lastAudibleIds.filter(id => !audibleTabIds.has(id));

    // Sort historyTabIds by activation order
    const activationOrder = this.#historyManager.getActivationOrder(windowId);
    historyTabIds.sort((a, b) =>
    {
      const aIndex = activationOrder.indexOf(a);
      const bIndex = activationOrder.indexOf(b);
      // Not in history = put at end
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      // Lower index = more recently activated
      return aIndex - bIndex;
    });

    return { playingTabIds, historyTabIds };
  }

  setLastAudibleTabId(tabId: number): void
  {
    // Remove if already exists (move-to-front deduplication)
    const existingIndex = this.#lastAudibleTabIds.indexOf(tabId);
    if (existingIndex !== -1)
    {
      this.#lastAudibleTabIds.splice(existingIndex, 1);
    }

    // Add to front
    this.#lastAudibleTabIds.unshift(tabId);

    // Trim to max size
    if (this.#lastAudibleTabIds.length > LastAudibleTracker.MAX_HISTORY_SIZE)
    {
      this.#lastAudibleTabIds.length = LastAudibleTracker.MAX_HISTORY_SIZE;
    }

    this.#save();
  }

  clearIfMatches(tabId: number): void
  {
    const index = this.#lastAudibleTabIds.indexOf(tabId);
    if (index !== -1)
    {
      this.#lastAudibleTabIds.splice(index, 1);
      this.#save();
    }
  }

  #save(): void
  {
    chrome.storage.session.set({ [LastAudibleTracker.STORAGE_KEY]: this.#lastAudibleTabIds });
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([LastAudibleTracker.STORAGE_KEY]);
    this.#lastAudibleTabIds = result[LastAudibleTracker.STORAGE_KEY] ?? [];
  }
}
