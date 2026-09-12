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

  /**
   * Populate bookmarkFolderSegments for any space that only has
   * bookmarkFolderPath, by walking the current bookmark tree. Pure - returns
   * the resolved list plus whether anything actually changed, and leaves
   * persisting/broadcasting to the two callers below, which need different
   * things to happen next.
   *
   * This is also the self-heal for Arc import and any backup that predates
   * bookmarkFolderSegments: both hand updateSpaces() a space shaped exactly
   * like this (path set, no segments) - see the "Case" writeup in
   * docs/decisions/2026-07-30-shared-storage-multiple-writers.md.
   */
  private async resolveMissingSegments(spaces: Space[]): Promise<{ spaces: Space[]; changed: boolean }>
  {
    const needsResolution = spaces.some(s => s.bookmarkFolderPath && !s.bookmarkFolderSegments);
    if (!needsResolution) return { spaces, changed: false };

    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];

    const resolved = spaces.map(space =>
    {
      if (!space.bookmarkFolderPath || space.bookmarkFolderSegments) return space;
      const segments = findFolderSegmentsByPath(roots, space.bookmarkFolderPath);
      return segments ? { ...space, bookmarkFolderSegments: segments } : space;
    });

    // Per-item comparison, not just "resolved !== spaces" - map() always
    // returns a new array even when every element comes back unchanged (e.g.
    // a bookmarkFolderPath that no longer matches any folder), and callers
    // need to know whether anything actually changed, not just whether a new
    // array was allocated.
    const changed = resolved.some((s, i) => s !== spaces[i]);

    // DEV-only: confirms exactly what the self-heal did for each space that
    // needed it - whether a matching folder was actually found, and what
    // segments it resolved to. This is the thing to check in DevTools after
    // an Arc import or a backup import to confirm segments came back right.
    if (import.meta.env.DEV)
    {
      for (let i = 0; i < spaces.length; i++)
      {
        const before = spaces[i];
        if (!before.bookmarkFolderPath || before.bookmarkFolderSegments) continue;
        const after = resolved[i];
        console.log(
          after.bookmarkFolderSegments
            ? `[SpaceManager] resolved segments for "${before.name}": ${JSON.stringify(after.bookmarkFolderSegments)}`
            : `[SpaceManager] could NOT resolve segments for "${before.name}" (path "${before.bookmarkFolderPath}") - no matching folder found`
        );
      }
    }

    return { spaces: resolved, changed };
  }

  // Startup-only migration: resolve segments and persist immediately if
  // anything changed. Runs inside load(), before stateReady resolves, so it
  // must NOT broadcast - no sidebar has asked for anything yet.
  private async migrate(spaces: Space[]): Promise<Space[]>
  {
    const { spaces: resolved, changed } = await this.resolveMissingSegments(spaces);
    if (changed)
    {
      await chrome.storage.local.set({ [SPACES_STORAGE_KEY]: resolved });
    }
    return resolved;
  }

  getSpaces(): Space[]
  {
    return this.spaces;
  }

  /**
   * originId identifies the context that asked for this change, so the
   * broadcast below can be recognised as an echo by whoever sent it. Absent
   * for background-internal callers, whose broadcasts are news to everyone.
   *
   * Resolves any missing bookmarkFolderSegments before storing (see
   * resolveMissingSegments above), so the value actually stored/broadcast can
   * differ from what the caller sent. The broadcast's `migrated` flag tells
   * the ORIGINATING proxy to apply it despite the matching senderId (which
   * would normally mean "my own echo, skip it") - safe only because the one
   * caller that can actually hit this (spaces import) awaits the write before
   * the UI allows another space edit in the same window, so there is no
   * newer optimistic write here for this to clobber. See the shared-storage
   * decision doc, section 4, for the general hazard this sidesteps.
   */
  async updateSpaces(spaces: Space[], originId?: string): Promise<Space[]>
  {
    const { spaces: resolved, changed: migrated } = await this.resolveMissingSegments(spaces);

    this.spaces = resolved;
    chrome.storage.local.set({ [SPACES_STORAGE_KEY]: resolved });

    // DEV-only: confirms background actually applied this update to its own
    // in-memory list, at the moment it happens - for manually verifying the
    // Case 3 fix (docs/test/tab-space-association-test-cases.md D.3) without
    // a sendMessage round trip, which can't reach background from its own
    // console (a context's runtime.sendMessage doesn't loop back to itself).
    if (import.meta.env.DEV)
    {
      console.log('[SpaceManager] updateSpaces applied:', resolved.map(s => `${s.name} (${s.id})`));
    }

    // Notify sidebar of the change. senderId is echoed back so the context
    // that requested the change can ignore its own echo - see CONTEXT_ID in
    // proxies/messageRouting.ts. migrated overrides that: it tells the
    // originating proxy this is NOT a plain echo of what it sent, apply it.
    chrome.runtime.sendMessage({
      action: SPACES_CHANGED,
      spaces: resolved,
      senderId: originId,
      migrated,
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return resolved;
  }
}
