import { useCallback, useEffect, useRef } from 'react';
import { useSpacesContext } from '../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../contexts/BookmarkTabsContext';
import { SpaceMessageAction } from '../utils/spaceMessages';
import { FollowActiveTabMode } from '../utils/followActiveTab';
import { scrollToBookmark, scrollToTab } from '../utils/scrollHelpers';

// Shape of the TAB_ACTIVATED message broadcast by background.ts on tab
// activation (see spaceMessages.ts). `explicit` marks activations the user
// asked for directly, which always scroll.
interface TabActivatedMessage
{
  action?: string;
  windowId?: number;
  tabId?: number;
  spaceSwitched?: boolean;
  explicit?: boolean;
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

// Returns a function that scrolls the sidebar to the window's currently active
// tab without changing the space. Used for the one-time scroll on sidebar open,
// where switching space would override the space the user last chose.
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

// Returns a function that switches the sidebar to the active tab's space and
// scrolls the tab into view. Used by the "show active tab" toolbar button, so it
// works from any space and in any follow mode.
//
// Sends the same background message the audio quick-jump and history navigation
// use; the scroll then arrives as an explicit TAB_ACTIVATED broadcast, so this
// does not scroll by hand.
export function useShowActiveTab(): () => void
{
  const { windowId } = useSpacesContext();

  return useCallback(() =>
  {
    if (!windowId) return;
    chrome.tabs.query({ active: true, windowId }, (tabs) =>
    {
      const tabId = tabs[0]?.id;
      if (tabId === undefined) return;

      chrome.runtime.sendMessage({ action: 'set-active-tab-and-space', tabId }).catch(() =>
      {
        // Background may be restarting - nothing useful to do
      });
    });
  }, [windowId]);
}

// Implements the "Follow active tab" setting, and owns all auto-scrolling.
// background.ts announces tab activations with a TAB_ACTIVATED message saying
// whether the activation switched the sidebar's space, and whether the user
// asked for it directly.
//
// Explicit activations (history navigation and its keyboard shortcuts, audio
// quick-jump, "show active tab" button) always scroll. For passive ones, where
// Chrome switched tabs on its own, the mode decides:
// - 'space-and-scroll': scroll on every activation
// - 'space': scroll only when the activation switched the space
// - 'off': never scroll
// Space switching itself is handled by background.ts.
export function useFollowActiveTab(mode: FollowActiveTabMode): void
{
  const { windowId } = useSpacesContext();
  const { isInitialized } = useBookmarkTabsContext();
  const scrollToTabItem = useScrollToTabItem();
  const scrollToActiveTab = useScrollToActiveTab();

  // Scroll on tab activation. Registered in every mode, including 'off',
  // because explicit activations must still scroll.
  useEffect(() =>
  {
    if (!windowId) return;

    const handleMessage = (message: TabActivatedMessage) =>
    {
      if (message.action !== SpaceMessageAction.TAB_ACTIVATED) return;
      if (message.windowId !== windowId || message.tabId === undefined) return;

      // The mode governs passive activations only; anything the user asked for
      // directly (history navigation, audio jump, toolbar button) always scrolls
      const shouldScroll = message.explicit
        || mode === 'space-and-scroll'
        || (mode === 'space' && message.spaceSwitched);

      if (shouldScroll)
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
