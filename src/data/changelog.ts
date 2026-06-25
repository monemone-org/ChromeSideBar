// Maps version numbers to lists of user-facing feature changes introduced at that version.
// Omit a version entirely if it contains only bug fixes or internal changes.
// Entries are shown in the "What's New" dialog when the user upgrades past them.
export const CHANGELOG: Record<string, string[]> = {
  '1.0.322': [
    'New: Space Navigator (Cmd+Shift+S / Ctrl+Shift+S) - type to search spaces or use 0-9 keys to jump directly',
    'New: Space colour tints the sidebar background - set it in Space settings',
    'Settings dialog now has Appearance and Behaviour tabs for easier navigation',
  ],
  '1.0.313': [
    'Bookmark folder expand/collapse state is now persisted across Chrome restarts',
  ],
  '1.0.306': [
    'Audio button quick-jump: single click jumps to the latest playing audio/video tab',
    'Hold the audio button to open the full audio tabs list',
  ],
  '1.0.303': [
    'Drag a tab from the tab list onto the bookmark tree to create a bookmark with that tab as its live tab',
  ],
  '1.0.294': [
    'Persistent tab associations: bookmark and pinned site tab links now survive browser restarts',
    'Close and Delete option in bookmark context menu',
    'Undo support for closing tabs',
    'Cleaner search toolbar: filter buttons consolidated into the search bar',
  ],
  '1.0.281': [
    'Import from Arc Browser: import pinned sites, spaces, and bookmarks from Arc',
    'Emoji icons: use any emoji as the icon for spaces and pinned sites',
    'Custom hex colors for spaces',
  ]
};

function compareVersions(a: string, b: string): number
{
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++)
  {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface ChangelogGroup
{
  version: string;
  items: string[];
}

// Returns changelog groups for versions newer than lastSeenVersion, sorted newest-first.
// Returns an empty array if nothing is new (dialog should be skipped).
export function getWhatsNewSince(lastSeenVersion: string): ChangelogGroup[]
{
  return Object.entries(CHANGELOG)
    .filter(([version]) => compareVersions(version, lastSeenVersion) > 0)
    .sort(([a], [b]) => compareVersions(b, a))
    .map(([version, items]) => ({ version, items }));
}

// Returns the most recent `versionCount` changelog groups, for manual "What's New" opens.
export function getRecentWhatsNew(versionCount: number): ChangelogGroup[]
{
  return Object.entries(CHANGELOG)
    .sort(([a], [b]) => compareVersions(b, a))
    .slice(0, versionCount)
    .map(([version, items]) => ({ version, items }));
}
