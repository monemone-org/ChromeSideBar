import { useCallback, useEffect, useRef } from 'react';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { SpaceMessageAction } from '../utils/spaceMessages';
import { FollowActiveTabMode } from '../utils/followActiveTab';
import { scrollToBookmark, scrollToTab } from '../utils/scrollHelpers';

// Shape of the TAB_ACTIVATED message broadcast by background.ts on every
// tab activation (see spaceMessages.ts).
interface TabActivatedMessage
{
  action?: string;
  windowId?: number;
  tabId?: number;
  spaceSwitched?: boolean;
}

// Returns a function that scrolls the sidebar row for a tab into view,
// routing to the right list: Arc-style bookmark tabs render in BookmarkTree
// under data-bookmark-id, all other tabs render in TabList under data-tab-id.
export function useScrollToTabItem(): (tabId: number) => void
{
  const { getItemKeyForTab } = useBookmarkTabsContext();

  return useCallback((tabId: number) =>
  {
    const itemKey = getItemKeyForTab(tabId);
    if (itemKey && itemKey.startsWith('bookmark-'))
    {
      scrollToBookmark(itemKey.substring('bookmark-'.length));
    }
    else
    {
      scrollToTab(tabId);
    }
  }, [getItemKeyForTab]);
}

// Returns a function that scrolls the sidebar to the window's currently
// active tab. Used by the crosshair toolbar button.
export function useScrollToActiveTab(): () => void
{
  const { windowId } = useSpacesContext();
  const scrollToTabItem = useScrollToTabItem();

  return useCallback(() =>
  {
    if (!windowId) return;
    chrome.tabs.query({ active: true, windowId }, (tabs) =>
    {
      if (tabs[0]?.id !== undefined)
      {
        scrollToTabItem(tabs[0].id);
      }
    });
  }, [windowId, scrollToTabItem]);
}

// Implements the "Follow active tab" setting. background.ts announces every
// tab activation with a TAB_ACTIVATED message that says whether the activation
// switched the sidebar's space; this hook decides whether to scroll:
// - 'space-and-scroll': scroll on every activation
// - 'space': scroll only when the activation switched the space
// - 'off': never scroll
// Space switching itself is handled by background.ts (same setting).
export function useFollowActiveTab(mode: FollowActiveTabMode): void
{
  const { windowId } = useSpacesContext();
  const { isInitialized } = useBookmarkTabsContext();
  const scrollToTabItem = useScrollToTabItem();
  const scrollToActiveTab = useScrollToActiveTab();

  // Scroll on tab activation, per the mode
  useEffect(() =>
  {
    if (mode === 'off' || !windowId) return;

    const handleMessage = (message: TabActivatedMessage) =>
    {
      if (message.action !== SpaceMessageAction.TAB_ACTIVATED) return;
      if (message.windowId !== windowId || message.tabId === undefined) return;

      if (mode === 'space-and-scroll' || message.spaceSwitched)
      {
        scrollToTabItem(message.tabId);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [mode, windowId, scrollToTabItem]);

  // Scroll to the active tab once when the sidebar opens. Waits for the
  // bookmark-tab associations to load so the scroll routes correctly.
  const didInitialScrollRef = useRef(false);
  useEffect(() =>
  {
    if (mode === 'off' || !windowId || !isInitialized) return;
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    scrollToActiveTab();
  }, [mode, windowId, isInitialized, scrollToActiveTab]);
}
