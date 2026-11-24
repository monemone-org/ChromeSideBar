// The wire contract for SpaceTabManager, owned by neither side.
//
// impl/spaceTabManager.ts implements SpaceTabManagerApi;
// proxies/spaceTabManagerProxy.ts implements Remote<SpaceTabManagerApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.
//
// SpaceTabManager owns background's grouping queue, the one place that puts
// a new tab into a Chrome group. See
// docs/decisions/2026-11-23-new-tab-grouping-two-writers.md for why a tab the
// sidebar creates has to be placed there too, rather than by the sidebar.

/** One tab for createTabs to open. */
export interface NewTab
{
  url: string;
  index?: number;
  // Defaults to false, so a new tab does not steal focus unless asked to
  active?: boolean;
  pinned?: boolean;
}

/**
 * Where createTabs puts the tabs it opens. Every tab of one call gets the
 * same placement and ends up in the same group.
 */
export type TabPlacement =
  // The space's Chrome group, found by title or created if the space has
  // none. 'all' means no group.
  | { kind: 'space'; spaceId: string }
  // A particular group: groupId if that group still exists, otherwise a new
  // group made from newGroup, and with neither, no group.
  | { kind: 'group'; groupId?: number; newGroup?: { title: string; color: chrome.tabGroups.ColorEnum } }
  // No group, and background must not group the tabs later either.
  | { kind: 'none' };

/** What createTabs reports back: the new tabs, in order, and the group they ended up in. */
export interface CreatedTabs
{
  tabIds: number[];
  groupId?: number;
}

/**
 * The subset of SpaceTabManager the sidebar can call.
 */
export interface SpaceTabManagerApi
{
  /**
   * Opens tabs and places them, as one job in the grouping queue. Background's
   * own request for each new tab (from chrome.tabs.onCreated) is queued
   * behind the job, so it finds the tab already placed and leaves it alone.
   */
  createTabs(windowId: number, tabs: NewTab[], placement: TabPlacement): Promise<CreatedTabs>;

  /** Moves an existing tab into a space's group, even when it is already in another group. */
  assignTabToSpace(windowId: number, tabId: number, spaceId: string): void;

  /**
   * Groups a tab into the window's active space, but only if the tab still
   * has no group by the time the queue reaches it.
   */
  requestGrouping(windowId: number, tabId: number): void;
}
