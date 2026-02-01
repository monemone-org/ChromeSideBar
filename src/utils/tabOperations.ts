/**
 * Shared tab operations for drag-and-drop and other tab management.
 */

import { Space } from '../contexts/SpacesContext';

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

    // Find existing Chrome group with Space's name in this window
    const groups = await chrome.tabGroups.query({ windowId, title: space.name });

    if (groups.length > 0)
    {
      // Add to existing group
      await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
    }
    else
    {
      // Create new group with this tab
      const tab = await chrome.tabs.get(tabId);
      const newGroupId = await chrome.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId: tab.windowId }
      });
      await chrome.tabGroups.update(newGroupId, {
        title: space.name,
        color: space.color,
      });
    }

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
