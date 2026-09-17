// Sidebar-side client for background.ts's TabHistoryManager.
//
// No mirror store and no broadcast listener here, unlike spaceManagerProxy:
// the sidebar reads this manager only on an explicit user gesture
// (press-and-hold on a toolbar history button), never during render, so there
// is nothing for a mirror to keep warm - and nothing writes the history from
// the sidebar, so there is nothing to sync back either. Same plain-object
// shape as tabSpaceRegistryProxy.
//
// windowId is always passed in by the caller. Background no longer guesses it
// with chrome.tabs.query({ currentWindow: true }), which in a service worker
// means "last focused window" and so drove the wrong window's history from a
// non-focused sidebar.

import { ManagerId, callManager, Remote } from './messageRouting';
import { TabHistoryDetails, TabHistoryManagerApi } from '../shared/tabHistoryManagerApi';

export const tabHistoryManagerProxy: Remote<TabHistoryManagerApi> = {
  /**
   * direction is -1 for previous, +1 for next. The promise resolves once the
   * target tab is actually active - callers that don't care (both toolbar
   * buttons) can ignore it.
   */
  async navigate(windowId: number, direction: number): Promise<void>
  {
    await callManager<void>(ManagerId.TAB_HISTORY, 'navigate', { windowId, direction });
  },

  async navigateToIndex(windowId: number, index: number): Promise<void>
  {
    await callManager<void>(ManagerId.TAB_HISTORY, 'navigateToIndex', { windowId, index });
  },

  async getHistoryDetails(windowId: number): Promise<TabHistoryDetails>
  {
    return await callManager<TabHistoryDetails>(ManagerId.TAB_HISTORY, 'getHistoryDetails', { windowId });
  },
};
