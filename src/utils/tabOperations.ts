/**
 * Shared tab operations for drag-and-drop and other tab management.
 */

import { Space } from '../contexts/SpacesContext';
import { toChromeColor } from './groupColors';

// Keyed by "windowId:spaceName" - deduplicates concurrent getOrCreateSpaceGroup
// calls for a group that doesn't exist yet (see resolveGroupId). Cleared once
// resolved, so it only matters for calls that genuinely overlap in time, not
// a long-lived cache of every group ever created.
const pendingGroupCreation = new Map<string, Promise<number>>();

/**
 * Resolves (creating if needed) the Chrome group id for a space, coalescing
 * concurrent callers racing to create the SAME not-yet-existing group into
 * one creation instead of each seeing "no group" and creating their own.
 * The check-then-claim below has no `await` between reading and writing
 * pendingGroupCreation, so it's atomic with respect to other JS execution -
 * JS is single-threaded, so nothing else can run in that gap.
 */
async function resolveGroupId(space: Space, windowId: number, seedTabId: number): Promise<number>
{
  const key = `${windowId}:${space.name}`;

  let promise = pendingGroupCreation.get(key);
  if (!promise)
  {
    promise = (async () =>
    {
      const groups = await chrome.tabGroups.query({ windowId, title: space.name });
      if (groups.length > 0) return groups[0].id;

      // Chrome has no "create an empty group" call - creating a group and
      // adding its first tab happen together, so whichever call wins this
      // race seeds the new group with its own tab.
      const newGroupId = await chrome.tabs.group({
        tabIds: [seedTabId],
        createProperties: { windowId },
      });
      await chrome.tabGroups.update(newGroupId, {
        title: space.name,
        color: toChromeColor(space.color),
      });
      return newGroupId;
    })();
    pendingGroupCreation.set(key, promise);
    promise.finally(() => pendingGroupCreation.delete(key));
  }

  return promise;
}

/**
 * Add a tab to a space's Chrome tab group, finding the existing group by
 * name or creating a new one (titled and colored to match the space) if
 * none exists yet in this window.
 */
export async function getOrCreateSpaceGroup(tabId: number, space: Space, windowId: number): Promise<void>
{
  const groupId = await resolveGroupId(space, windowId, tabId);
  await chrome.tabs.group({ tabIds: [tabId], groupId });
}

/**
 * Move a tab to a space's Chrome tab group.
 *
 * - If spaceId is 'all', ungroups the tab
 * - If a Chrome group with the space's name exists, adds tab to it
 * - Otherwise, creates a new Chrome group with the space's name and color
 *
 * @param tabId - The Chrome tab ID to move
 * @param spaceId - The space ID to move to ('all' to ungroup)
 * @param spaces - Array of available spaces (excluding 'all')
 * @param windowId - The window ID for tab group queries
 * @returns Object with success status and optional error/toast message
 */
export async function moveTabToSpace(
  tabId: number,
  spaceId: string,
  spaces: Space[],
  windowId: number
): Promise<{ success: boolean; message?: string; error?: string }>
{
  try
  {
    // Special case: "All" space - ungroup the tab
    if (spaceId === 'all')
    {
      await chrome.tabs.ungroup(tabId);
      return { success: true, message: 'Removed from group' };
    }

    const space = spaces.find(s => s.id === spaceId);
    if (!space)
    {
      return { success: false, error: 'Space not found' };
    }

    await getOrCreateSpaceGroup(tabId, space, windowId);

    return { success: true, message: `Moved to ${space.name}` };
  }
  catch (error)
  {
    if (import.meta.env.DEV)
    {
      console.error('[moveTabToSpace] Failed:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Re-group a bookmark's associated live tab (if any) to match its new
 * folder's Space - keeps "a bookmark tab always lives in its bookmark's
 * Space" true regardless of how the bookmark got there (created, dragged
 * in, or moved afterward). No-op if the bookmark has no live tab, or if the
 * destination folder isn't under any Space.
 *
 * @param bookmarkId - The bookmark whose live tab (if any) should follow
 * @param targetFolderId - The folder the bookmark just moved into
 * @param getTabIdForBookmark - From useBookmarkTabsContext()
 * @param windowId - From useSpacesContext()
 * @param findSpaceForFolder - From useFindSpaceForFolder()
 */
export async function regroupAssociatedTab(
  bookmarkId: string,
  targetFolderId: string,
  getTabIdForBookmark: (bookmarkId: string) => number | undefined,
  windowId: number | null,
  findSpaceForFolder: (folderId: string) => Promise<Space | undefined>
): Promise<void>
{
  const tabId = getTabIdForBookmark(bookmarkId);
  if (tabId === undefined || !windowId) return;

  const targetSpace = await findSpaceForFolder(targetFolderId);
  if (!targetSpace) return;

  chrome.runtime.sendMessage({ action: 'register-tab-space', windowId, tabId, spaceId: targetSpace.id });
  chrome.runtime.sendMessage({ action: 'queue-tab-for-grouping', tabId, windowId, spaceId: targetSpace.id });
}

/**
 * Create a new tab from a URL, optionally adding it to a group.
 *
 * @param url - The URL to open
 * @param windowId - The window to create the tab in
 * @param groupId - Optional group ID to add the tab to
 * @returns The created tab or null on failure
 */
export async function createTabFromUrl(
  url: string,
  windowId?: number,
  groupId?: number
): Promise<chrome.tabs.Tab | null>
{
  try
  {
    const tab = await chrome.tabs.create({
      url,
      active: false,
      windowId
    });

    if (tab.id && groupId)
    {
      await chrome.tabs.group({ tabIds: [tab.id], groupId });
    }

    return tab;
  }
  catch (error)
  {
    if (import.meta.env.DEV)
    {
      console.error('[createTabFromUrl] Failed:', error);
    }
    return null;
  }
}

/**
 * Create a new tab in a specific space.
 * Creates or finds the space's Chrome group and adds the new tab to it.
 *
 * @param url - The URL to open
 * @param spaceId - The space to create the tab in
 * @param spaces - Array of available spaces
 * @param windowId - The window to create the tab in
 * @returns Object with success status and the created tab
 */
export async function createTabInSpace(
  url: string,
  spaceId: string,
  spaces: Space[],
  windowId: number
): Promise<{ success: boolean; tab?: chrome.tabs.Tab; error?: string }>
{
  try
  {
    // Create the tab first
    const tab = await chrome.tabs.create({
      url,
      active: false,
      windowId
    });

    if (!tab.id)
    {
      return { success: false, error: 'Failed to create tab' };
    }

    // If "all" space, just create without grouping
    if (spaceId === 'all')
    {
      return { success: true, tab };
    }

    // Move to space's group
    const result = await moveTabToSpace(tab.id, spaceId, spaces, windowId);
    if (!result.success)
    {
      return { success: false, tab, error: result.error };
    }

    return { success: true, tab };
  }
  catch (error)
  {
    if (import.meta.env.DEV)
    {
      console.error('[createTabInSpace] Failed:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
