// Sidebar-side client for background.ts's TabSpaceRegistry.
//
// Only register() is here. getSpace/unregister/removeWindow/load are
// background-internal - nothing in the sidebar reads the registry, so there's
// no mirror store or broadcast listener in this module yet. The first manager
// that the sidebar actually reads (SpaceWindowStateManager) is what introduces
// those; see the decision doc's migration order.

import { ManagerId, makeManagerActionId, Remote } from './messageRouting';

/**
 * The subset of TabSpaceRegistry the sidebar can call. The manager implements
 * this interface directly; this proxy implements Remote<TabSpaceRegistryApi>,
 * so the two signatures cannot drift apart silently.
 */
export interface TabSpaceRegistryApi
{
  /** Record which space a tab belongs to, so background can regroup it later. */
  register(windowId: number, tabId: number, spaceId: string): void;
}

export const tabSpaceRegistryProxy: Remote<TabSpaceRegistryApi> = {
  async register(windowId: number, tabId: number, spaceId: string): Promise<void>
  {
    await chrome.runtime.sendMessage({
      action: makeManagerActionId(ManagerId.TAB_SPACE_REGISTRY, 'register'),
      windowId,
      tabId,
      spaceId,
    });
  },
};
