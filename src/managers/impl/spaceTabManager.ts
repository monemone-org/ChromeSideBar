// SpaceTabManager - puts tabs into their space's Chrome group.
//
// Background-side implementation of shared/spaceTabManagerApi.ts. The sidebar
// reaches it through proxies/spaceTabManagerProxy.ts; the routing vocabulary
// is in proxies/messageRouting.ts.
//
// It owns the grouping queue that used to live in background.ts, and is the
// one writer of a new tab's group: background's chrome.tabs.onCreated
// listener feeds it through queueNewTab, and a tab the sidebar wants
// somewhere specific is created here too, through createTabs, so the two can
// no longer race - see docs/decisions/2026-11-23-new-tab-grouping-two-writers.md.
//
// This is the first slice of the SpaceTabManager in
// docs/decisions/2026-09-22-space-tab-manager.md. The active-space state, the
// tab-space registry and the orchestration functions stay where they are for
// now; this class reads what it needs from them through SpaceTabDeps.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { CreatedTabs, NewTab, SpaceTabManagerApi, TabPlacement } from '../shared/spaceTabManagerApi';
import { TestGateName } from '../shared/backgroundTestHooksApi';
import { backgroundTestHooks } from './backgroundTestHooks';
import { Space } from '../../utils/spaceMessages';
import { toChromeColor } from '../../utils/groupColors';

// Workaround: chrome.tabGroups.update() sets title/color internally but
// chrome.tabGroups.query() returns stale data until manual collapse/expand.
// See https://github.com/brave/brave-browser/issues/52949
const ISSUE_52949_WORKAROUND = true;

/**
 * What this manager reads from the state it does not own. Passed in as
 * callbacks rather than as the other managers, so it holds no references to
 * them.
 */
export interface SpaceTabDeps
{
  // The window's active space id, 'all' when it shows every tab
  getActiveSpace(windowId: number): string | undefined;
  getSpace(spaceId: string): Space | undefined;
  isPinnedManagedTab(windowId: number, tabId: number): boolean;
}

/** One request to put an existing tab into a space's group. */
interface GroupingRequest
{
  tabId: number;
  windowId: number;
  spaceId: string;  // Target space, captured when the request is queued
  force: boolean;   // Move even if already in a different group (see assignTabToSpace)
  // Queued by chrome.tabs.onCreated for a tab that has just appeared. Such a
  // request is dropped when a createTabs job has already placed the tab.
  fromCreation: boolean;
}

/**
 * Runs background's tab-grouping work one job at a time, so tabs that open
 * quickly one after another do not interfere with each other, and so a
 * createTabs job finishes placing its tabs before the onCreated requests for
 * those same tabs run.
 */
class GroupingQueue
{
  #jobs: Array<() => Promise<void>> = [];
  #running = false;

  /** Adds a job to the end of the queue and resolves with its result once it has run. */
  run<T>(job: () => Promise<T>): Promise<T>
  {
    return new Promise<T>((resolve, reject) =>
    {
      this.#jobs.push(async () =>
      {
        try
        {
          resolve(await job());
        }
        catch (error)
        {
          reject(error);
        }
      });
      void this.#drain();
    });
  }

  async #drain(): Promise<void>
  {
    if (this.#running) return;  // Already draining, new jobs will be picked up
    this.#running = true;

    try
    {
      // One job at a time, in the order they were added
      while (this.#jobs.length > 0)
      {
        await this.#jobs.shift()!();
      }
    }
    finally
    {
      this.#running = false;
    }
  }
}

/**
 * The tabs a createTabs job has already put where they belong, so the
 * onCreated request for each of them leaves it alone. A plain "does it have a
 * group?" check is not enough: a job can leave a tab ungrouped on purpose.
 */
class PlacedTabs
{
  #tabIds = new Set<number>();

  add(tabId: number): void
  {
    this.#tabIds.add(tabId);
  }

  /** Whether a job placed this tab. Answers once: the entry is removed. */
  take(tabId: number): boolean
  {
    return this.#tabIds.delete(tabId);
  }

  forget(tabId: number): void
  {
    this.#tabIds.delete(tabId);
  }
}

/** Finds a space's Chrome group in a window by its title. */
async function findGroupByName(windowId: number, name: string): Promise<number | undefined>
{
  const groups = await chrome.tabGroups.query({ windowId, title: name });
  return groups[0]?.id;
}

/** Whether a Chrome group still exists. Chrome deletes a group once its last tab leaves. */
async function groupExists(groupId: number): Promise<boolean>
{
  try
  {
    await chrome.tabGroups.get(groupId);
    return true;
  }
  catch
  {
    return false;
  }
}

/** Creates a group holding these tabs and gives it a title and color. */
async function createGroup(
  windowId: number,
  tabIds: number[],
  title: string,
  color: chrome.tabGroups.ColorEnum
): Promise<number>
{
  const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
  await chrome.tabGroups.update(groupId, { title, color });

  if (ISSUE_52949_WORKAROUND)
  {
    // Send correct group details directly - query() returns stale data for new groups
    chrome.runtime.sendMessage({
      type: 'TAB_GROUP_TITLE_SET',
      groupId,
      title,
      color,
      windowId,
    }).catch(() => {});
  }

  return groupId;
}

export class SpaceTabManager implements RoutedManager, SpaceTabManagerApi
{
  readonly managerId = ManagerId.SPACE_TAB;

  #deps: SpaceTabDeps;
  #queue = new GroupingQueue();
  #placedTabs = new PlacedTabs();

  constructor(deps: SpaceTabDeps)
  {
    this.#deps = deps;
  }

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    switch (method)
    {
      case 'createTabs':
        return this.createTabs(
          message.windowId as number,
          message.tabs as NewTab[],
          message.placement as TabPlacement
        );

      case 'assignTabToSpace':
        this.assignTabToSpace(message.windowId as number, message.tabId as number, message.spaceId as string);
        return undefined;

      case 'requestGrouping':
        this.requestGrouping(message.windowId as number, message.tabId as number);
        return undefined;

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  // ---------------------------------------------------------------------------
  // SpaceTabManagerApi - what the sidebar can call
  // ---------------------------------------------------------------------------

  createTabs(windowId: number, tabs: NewTab[], placement: TabPlacement): Promise<CreatedTabs>
  {
    return this.#queue.run(() => this.#createAndPlace(windowId, tabs, placement));
  }

  /**
   * A forced request: the caller knows the correct space, for example a
   * bookmark moved to another space and its tab has to follow it, so the tab
   * moves even when it is already in a different group.
   */
  assignTabToSpace(windowId: number, tabId: number, spaceId: string): void
  {
    this.#queueRequest({ tabId, windowId, spaceId, force: true, fromCreation: false });
  }

  /**
   * Uses the space that is active in the window when the request is queued,
   * not the one active later when the queue reaches it. The request is not
   * forced: it groups the tab only if the tab still has no group by then, so
   * an old request cannot replace a group the tab got in the meantime.
   */
  requestGrouping(windowId: number, tabId: number): void
  {
    this.#queueActiveSpaceRequest(windowId, tabId, false);
  }

  // ---------------------------------------------------------------------------
  // Background-only
  // ---------------------------------------------------------------------------

  /**
   * chrome.tabs.onCreated's entry point, for a new tab that has no group.
   * Same as requestGrouping, except that the request is dropped when a
   * createTabs job has already placed the tab.
   */
  queueNewTab(tab: chrome.tabs.Tab): void
  {
    if (tab.id === undefined || tab.windowId === undefined) return;
    this.#queueActiveSpaceRequest(tab.windowId, tab.id, true);
  }

  /**
   * Gives a space's group its new title and color in every window, after the
   * space was renamed or recolored. Background-only: SpaceManager's edit
   * callback calls it, so every window's group follows the space, including
   * windows whose sidebar is closed (D1).
   *
   * Runs on the grouping queue. A grouping job queued after the rename looks
   * the group up by the new name, so the rename has to happen first, or that
   * job would find nothing and create a second group.
   */
  renameSpaceGroups(oldTitle: string, newTitle: string, color: chrome.tabGroups.ColorEnum): Promise<void>
  {
    return this.#queue.run(async () =>
    {
      const groups = await chrome.tabGroups.query({ title: oldTitle });

      // Update the space's group in each window that has one
      for (const group of groups)
      {
        try
        {
          await chrome.tabGroups.update(group.id, { title: newTitle, color });
          if (ISSUE_52949_WORKAROUND)
          {
            // Same as createGroup: query() can return the stale title for a while
            chrome.runtime.sendMessage({
              type: 'TAB_GROUP_TITLE_SET',
              groupId: group.id,
              title: newTitle,
              color,
              windowId: group.windowId,
            }).catch(() => {});
          }
        }
        catch (error)
        {
          // The group may have closed since the query; the others still get renamed
          if (import.meta.env.DEV)
          {
            console.error(`[renameSpaceGroups] Failed to update group ${group.id}:`, error);
          }
        }
      }
    });
  }

  /** chrome.tabs.onRemoved's entry point: a closed tab needs no placed-tab entry. */
  forgetTab(tabId: number): void
  {
    this.#placedTabs.forget(tabId);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  #queueActiveSpaceRequest(windowId: number, tabId: number, fromCreation: boolean): void
  {
    const spaceId = this.#deps.getActiveSpace(windowId);
    if (!spaceId || spaceId === 'all') return;

    this.#queueRequest({ tabId, windowId, spaceId, force: false, fromCreation });
  }

  #queueRequest(request: GroupingRequest): void
  {
    // Fire and forget: #processGroupingRequest logs its own failures
    void this.#queue.run(() => this.#processGroupingRequest(request));
  }

  async #processGroupingRequest(request: GroupingRequest): Promise<void>
  {
    const { tabId, windowId, spaceId, force, fromCreation } = request;

    // A createTabs job opened this tab and has already put it where it
    // belongs - grouping it into the active space now would undo that
    if (fromCreation && this.#placedTabs.take(tabId)) return;

    // Check if this is a pinned-site managed tab (keep ungrouped).
    // An in-memory lookup on TabAssociationManager's map, so no yield point
    // between the check and the ungroup below.
    if (this.#deps.isPinnedManagedTab(windowId, tabId))
    {
      // Ungroup if currently in a group
      try
      {
        const tab = await chrome.tabs.get(tabId);
        if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
        {
          await chrome.tabs.ungroup(tabId);
        }
      }
      catch { /* Tab may be closed */ }
      return;
    }

    try
    {
      // Verify tab still exists. Skip only if already grouped and this isn't a
      // forced move - avoids clobbering a group assigned to a newly-created
      // tab in the gap between queueing and processing.
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && !force) return;

      if (import.meta.env.DEV)
      {
        await backgroundTestHooks.passGate(TestGateName.GROUPING_AFTER_TAB_READ);
      }

      const space = this.#deps.getSpace(spaceId);
      if (!space) return;

      // Already in the right group - nothing to do
      const existingGroupId = await findGroupByName(windowId, space.name);
      if (existingGroupId && tab.groupId === existingGroupId) return;

      await this.#groupIntoSpace(windowId, [tabId], space, existingGroupId);
    }
    catch (error)
    {
      if (import.meta.env.DEV) console.error('[processGroupingRequest] Failed:', error);
    }
  }

  /**
   * The body of a createTabs job. Each tab is recorded as placed as soon as
   * it exists, before anything can fail, so its onCreated request leaves it
   * alone even when the placement below throws.
   */
  async #createAndPlace(windowId: number, tabs: NewTab[], placement: TabPlacement): Promise<CreatedTabs>
  {
    const tabIds: number[] = [];

    // Open the tabs in the order given, so their indices come out as asked
    for (const spec of tabs)
    {
      const tab = await chrome.tabs.create({
        url: spec.url,
        index: spec.index,
        active: spec.active ?? false,
        pinned: spec.pinned,
        windowId,
      });
      if (tab.id === undefined) continue;

      this.#placedTabs.add(tab.id);
      tabIds.push(tab.id);
    }

    if (tabIds.length === 0) return { tabIds };

    const groupId = await this.#place(windowId, tabIds, placement);
    return { tabIds, groupId };
  }

  /** Puts tabs where a placement says. Returns the group they ended up in, if any. */
  async #place(windowId: number, tabIds: number[], placement: TabPlacement): Promise<number | undefined>
  {
    switch (placement.kind)
    {
      case 'none':
        return undefined;

      case 'space':
      {
        if (placement.spaceId === 'all') return undefined;

        const space = this.#deps.getSpace(placement.spaceId);
        if (!space) throw new Error(`${this.managerId}: no space "${placement.spaceId}"`);

        return this.#groupIntoSpace(windowId, tabIds, space, await findGroupByName(windowId, space.name));
      }

      case 'group':
      {
        // The group the caller named, if it still exists
        if (placement.groupId !== undefined && await groupExists(placement.groupId))
        {
          await chrome.tabs.group({ tabIds, groupId: placement.groupId });
          return placement.groupId;
        }

        if (!placement.newGroup) return undefined;
        return createGroup(windowId, tabIds, placement.newGroup.title, placement.newGroup.color);
      }
    }
  }

  /** Puts tabs into a space's group: the existing one when given, otherwise a new one. */
  async #groupIntoSpace(windowId: number, tabIds: number[], space: Space, existingGroupId: number | undefined): Promise<number>
  {
    if (existingGroupId !== undefined)
    {
      await chrome.tabs.group({ tabIds, groupId: existingGroupId });
      return existingGroupId;
    }

    return createGroup(windowId, tabIds, space.name, toChromeColor(space.color));
  }
}
