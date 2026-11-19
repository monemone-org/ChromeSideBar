// SpaceManager - owns Space definitions (load, migrate, save).
//
// Background-side implementation of shared/spaceManagerApi.ts. The sidebar
// reaches it through proxies/spaceManagerProxy.ts; the routing vocabulary is
// in proxies/messageRouting.ts.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import {
  SpaceEdit,
  SpaceFolderPathUpdate,
  SpaceManagerApi,
  SPACES_CHANGED,
  applyAddSpace,
  applyAddSpaces,
  applyMoveSpace,
  applyRemoveSpace,
  applyUpdateSpace,
  applyUpdateSpaceFolderPaths,
} from '../shared/spaceManagerApi';
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
    // originId is the calling context's CONTEXT_ID, stamped by callManager. It
    // rides along on the broadcast each mutation sends, as a label saying a
    // sidebar caused the change. Pulled out once here rather than in every
    // case below.
    const originId = message.senderId as string | undefined;

    switch (method)
    {
      case 'getSpaces':
        return this.getSpaces();

      case 'addSpace':
        return this.addSpace(message.space as Space, message.atIndex as number | undefined, originId);

      case 'addSpaces':
        return this.addSpaces(message.spaces as Space[], originId);

      case 'updateSpace':
        return this.updateSpace(message.id as string, message.edit as SpaceEdit, originId);

      case 'updateSpaceFolderPaths':
        return this.updateSpaceFolderPaths(message.updates as SpaceFolderPathUpdate[], originId);

      case 'removeSpace':
        return this.removeSpace(message.id as string, originId);

      case 'moveSpace':
        return this.moveSpace(message.activeId as string, message.overId as string, originId);

      case 'replaceAll':
        return this.replaceAll(message.spaces as Space[], originId);

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
   * persisting/broadcasting to its callers (migrate, addSpaces, replaceAll),
   * which need different things to happen next.
   *
   * This is also the self-heal for Arc import and any backup that predates
   * bookmarkFolderSegments: both hand addSpaces() or replaceAll() a space
   * shaped exactly like this (path set, no segments) - see the "Case" writeup
   * in docs/decisions/2026-07-30-shared-storage-multiple-writers.md.
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

  addSpace(space: Space, atIndex?: number, originId?: string): Space[]
  {
    return this.#commit(applyAddSpace(this.spaces, space, atIndex), 'addSpace', originId);
  }

  /**
   * Appends imported Spaces, resolving any missing bookmarkFolderSegments on
   * them first (see resolveMissingSegments above), so what gets stored and
   * broadcast can differ from what the caller sent. The originating proxy's
   * mirror picks that difference up from the broadcast like any other.
   */
  async addSpaces(spaces: Space[], originId?: string): Promise<Space[]>
  {
    const { spaces: resolved } = await this.resolveMissingSegments(spaces);

    // Read this.spaces only after the await, so a mutation that landed while
    // the bookmark tree walk was in flight is kept rather than overwritten.
    return this.#commit(applyAddSpaces(this.spaces, resolved), 'addSpaces', originId);
  }

  updateSpace(id: string, edit: SpaceEdit, originId?: string): Space[]
  {
    return this.#commit(applyUpdateSpace(this.spaces, id, edit), 'updateSpace', originId);
  }

  updateSpaceFolderPaths(updates: SpaceFolderPathUpdate[], originId?: string): Space[]
  {
    return this.#commit(applyUpdateSpaceFolderPaths(this.spaces, updates), 'updateSpaceFolderPaths', originId);
  }

  removeSpace(id: string, originId?: string): Space[]
  {
    return this.#commit(applyRemoveSpace(this.spaces, id), 'removeSpace', originId);
  }

  moveSpace(activeId: string, overId: string, originId?: string): Space[]
  {
    return this.#commit(applyMoveSpace(this.spaces, activeId, overId), 'moveSpace', originId);
  }

  /**
   * Replaces the whole list from an import, resolving any missing
   * bookmarkFolderSegments first - same as addSpaces above.
   */
  async replaceAll(spaces: Space[], originId?: string): Promise<Space[]>
  {
    const { spaces: resolved } = await this.resolveMissingSegments(spaces);
    return this.#commit(resolved, 'replaceAll', originId);
  }

  /**
   * Stores one already-computed list: in memory, then to storage, then out to
   * every listening context. Every mutation above ends here, so persisting
   * and broadcasting have exactly one implementation.
   *
   * originId identifies the context that asked for this change, and rides
   * along on the broadcast as senderId - a label saying a sidebar caused it.
   * Absent for background-internal callers. See CONTEXT_ID in
   * proxies/messageRouting.ts.
   *
   * `method` is only used in the DEV log, so the log names which operation
   * produced the list.
   */
  #commit(spaces: Space[], method: string, originId?: string): Space[]
  {
    this.spaces = spaces;
    chrome.storage.local.set({ [SPACES_STORAGE_KEY]: spaces });

    // DEV-only: confirms background actually applied this update to its own
    // in-memory list, at the moment it happens - for manually verifying the
    // Case 3 fix (docs/test/tab-space-association-test-cases.md D.3) without
    // a sendMessage round trip, which can't reach background from its own
    // console (a context's runtime.sendMessage doesn't loop back to itself).
    if (import.meta.env.DEV)
    {
      console.log(`[SpaceManager] ${method} applied:`, spaces.map(s => `${s.name} (${s.id})`));
    }

    // Notify every sidebar of the change. senderId is the provenance label
    // described above; every proxy applies the broadcast regardless of it.
    chrome.runtime.sendMessage({
      action: SPACES_CHANGED,
      spaces,
      senderId: originId,
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return spaces;
  }
}
