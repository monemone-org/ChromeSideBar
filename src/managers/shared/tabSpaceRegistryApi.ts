// The wire contract for TabSpaceRegistry, owned by neither side.
//
// impl/tabSpaceRegistry.ts implements TabSpaceRegistryApi;
// proxies/tabSpaceRegistryProxy.ts implements Remote<TabSpaceRegistryApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.

/**
 * The subset of TabSpaceRegistry the sidebar can call.
 *
 * Only register() is here. getSpace/unregister/removeWindow/load are
 * background-internal - nothing in the sidebar reads the registry, so there
 * is no mirror store or broadcast for this manager. See the decision doc's
 * migration order.
 */
export interface TabSpaceRegistryApi
{
  /** Record which space a tab belongs to, so background can regroup it later. */
  register(windowId: number, tabId: number, spaceId: string): void;
}
