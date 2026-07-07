// "Follow active tab" setting: how the sidebar reacts when Chrome activates a tab.
// - 'off': sidebar stays put (no space switch, no scroll)
// - 'space': switch to the tab's space; scroll only when the space actually switched
// - 'space-and-scroll': switch space and always scroll the active tab into view
export type FollowActiveTabMode = 'off' | 'space' | 'space-and-scroll';

// chrome.storage.local key. Read by background.ts (space switching) and
// App.tsx via useChromeLocalStorage (scrolling + settings UI).
export const FOLLOW_ACTIVE_TAB_KEY = 'sidebar-follow-active-tab';

// Default preserves the pre-setting behaviour: switch space and always scroll.
export const DEFAULT_FOLLOW_ACTIVE_TAB_MODE: FollowActiveTabMode = 'space-and-scroll';

// Parse a stored value, falling back to the default for absent/unknown values.
export function parseFollowActiveTabMode(value: unknown): FollowActiveTabMode
{
  if (value === 'off' || value === 'space' || value === 'space-and-scroll')
  {
    return value;
  }
  return DEFAULT_FOLLOW_ACTIVE_TAB_MODE;
}
