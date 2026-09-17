// The wire contract for TabHistoryManager, owned by neither side.
//
// impl/tabHistoryManager.ts implements TabHistoryManagerApi;
// proxies/tabHistoryManagerProxy.ts implements Remote<TabHistoryManagerApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.
//
// No *_CHANGED constant here: this manager broadcasts nothing. Nothing in the
// sidebar mirrors the history, so there is nobody to notify.

/** One entry as the toolbar's history dropdown renders it. */
export interface TabHistoryItem
{
  tabId: number;
  spaceId: string;
  index: number;
  title: string;
  url: string;
  favIconUrl: string;
}

/**
 * The window's history split around the current position: entries before it
 * (most recent first) and entries after it, as the Previous/Next dropdowns
 * list them.
 */
export interface TabHistoryDetails
{
  before: TabHistoryItem[];
  after: TabHistoryItem[];
  currentIndex: number;
}

/**
 * The subset of TabHistoryManager the sidebar can call.
 *
 * Every method takes windowId as its first parameter, matching the manager's
 * own signatures. The sidebar already knows which window it lives in, so the
 * window is never re-derived in background - see the step 4 plan's decision 1
 * for why chrome.tabs.query({ currentWindow: true }) was the wrong answer.
 *
 * isNavigating/setNavigating/unsetNavigating/push/remove/removeWindow/
 * getHistory/getActivationOrder/load are background-internal and stay off
 * this contract.
 */
export interface TabHistoryManagerApi
{
  /**
   * direction is -1 for previous, +1 for next. Resolves once the tab is
   * actually active, not merely once the request was accepted - the manager
   * awaits the activation before acking. Callers that don't care (both
   * toolbar buttons) ignore it.
   */
  navigate(windowId: number, direction: number): Promise<void>;
  navigateToIndex(windowId: number, index: number): Promise<void>;
  /** Async because it reads each entry's live tab and resolves its Space. */
  getHistoryDetails(windowId: number): Promise<TabHistoryDetails>;
}
