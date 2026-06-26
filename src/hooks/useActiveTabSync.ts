import { useEffect } from 'react';
import { useSpacesContext } from '../contexts/SpacesContext';
import { scrollToTab } from '../utils/scrollHelpers';

// When enabled, listens for tab activation events and scrolls the sidebar
// to bring the activated tab into view.
// Space switching on tab activation is handled separately in background.ts.
export function useActiveTabSync(enabled: boolean): void
{
  const { windowId } = useSpacesContext();

  useEffect(() =>
  {
    if (!enabled || !windowId) return;

    const handleActivated = (info: chrome.tabs.TabActiveInfo) =>
    {
      if (info.windowId !== windowId) return;
      scrollToTab(info.tabId);
    };

    chrome.tabs.onActivated.addListener(handleActivated);
    return () => chrome.tabs.onActivated.removeListener(handleActivated);
  }, [enabled, windowId]);
}
