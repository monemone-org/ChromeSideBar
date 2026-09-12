// SpaceManager - owns Space definitions (load, migrate, save).
//
// Background-side implementation of shared/spaceManagerApi.ts. The sidebar
// reaches it through proxies/spaceManagerProxy.ts; the routing vocabulary is
// in proxies/messageRouting.ts.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { SpaceManagerApi, SPACES_CHANGED } from '../shared/spaceManagerApi';
import { SPACES_STORAGE_KEY, Space } from '../../utils/spaceMessages';

// Walk bookmark tree matching path string as a prefix chain to build segment array.
// Returns the title segments (one per folder level) or null if not found.
// Handles folder names containing '/' by treating each node title as an atomic segment.
function findFolderSegmentsByPath(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  path: string,
  isRoot: boolean = true
): string[] | null
{
  for (const node of nodes)
  {
    if (node.url) continue;

    // Root-level folders matched case-insensitively for platform differences
    const matches = isRoot
      ? path.toLowerCase().startsWith(node.title.toLowerCase())
      : path.startsWith(node.title);
    if (!matches) continue;

    const after = path.slice(node.title.length);
    // Ensure match is a complete segment boundary, not a partial name match
    if (after !== '' && !after.startsWith('/')) continue;

    if (after === '') return [node.title];

    const childSegments = findFolderSegmentsByPath(node.children || [], after.slice(1), false);
    if (childSegments) return [node.title, ...childSegments];
  }
  return null;
}

export class SpaceManager implements RoutedManager, SpaceManagerApi
{
  readonly managerId = ManagerId.SPACES;

  private spaces: Space[] = [];

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    switch (method)
    {
      case 'getSpaces':
        return this.getSpaces();

      case 'updateSpaces':
        return this.updateSpaces(message.spaces as Space[], message.senderId as string | undefined);

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.local.get([SPACES_STORAGE_KEY]);
    let spaces: Space[] = result[SPACES_STORAGE_KEY] || [];
    spaces = await this.migrate(spaces);
    this.spaces = spaces;
  }

  // Populate bookmarkFolderSegments for spaces that only have bookmarkFolderPath
  private async migrate(spaces: Space[]): Promise<Space[]>
  {
    const needsMigration = spaces.some(s => s.bookmarkFolderPath && !s.bookmarkFolderSegments);
    if (!needsMigration) return spaces;

    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];

    const migrated = spaces.map(space =>
    {
      if (!space.bookmarkFolderPath || space.bookmarkFolderSegments) return space;
      const segments = findFolderSegmentsByPath(roots, space.bookmarkFolderPath);
      return segments ? { ...space, bookmarkFolderSegments: segments } : space;
    });

    // Only write back if anything changed
    const hasChanges = migrated.some((s, i) => s !== spaces[i]);
    if (hasChanges)
    {
      // Startup write only - runs inside load() before stateReady resolves,
      // so no sidebar has asked for anything yet. Must NOT broadcast.
      await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: migrated });
    }

    return migrated;
  }

  getSpaces(): Space[]
  {
    return this.spaces;
  }

  // originId identifies the context that asked for this change, so the
  // broadcast below can be recognised as an echo by whoever sent it. Absent
  // for background-internal callers, whose broadcasts are news to everyone.
  updateSpaces(spaces: Space[], originId?: string): Space[]
  {
    this.spaces = spaces;
    chrome.storage.local.set({ [SPACES_STORAGE_KEY]: spaces });

    // Notify sidebar of the change. senderId is echoed back so the context
    // that requested the change can ignore its own echo - see CONTEXT_ID in
    // proxies/messageRouting.ts.
    chrome.runtime.sendMessage({
      action: SPACES_CHANGED,
      spaces,
      senderId: originId
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return this.spaces;
  }
}
