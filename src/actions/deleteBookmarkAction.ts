import { UndoableAction } from './types';
import { truncateTitle } from '../utils/truncateTitle';
import { runBatchOperation } from '../hooks/useBookmarks';

type BookmarkSnapshot = chrome.bookmarks.BookmarkTreeNode;

/**
 * Undoable action for deleting one or more bookmarks/folders.
 * Snapshots full subtrees before deletion so they can be restored on undo.
 */
export class DeleteBookmarkAction implements UndoableAction
{
  description = '';
  private bookmarkIds: string[];
  private snapshots: BookmarkSnapshot[] = [];
  private getTabIdForBookmark?: (bookmarkId: string) => number | undefined;

  constructor(
    bookmarkIds: string[],
    getTabIdForBookmark?: (bookmarkId: string) => number | undefined
  )
  {
    this.bookmarkIds = bookmarkIds;
    this.getTabIdForBookmark = getTabIdForBookmark;
  }

  async do(): Promise<void>
  {
    // Deduplicate: filter out IDs whose ancestors are also in the list
    const idSet = new Set(this.bookmarkIds);
    const deduped: string[] = [];

    for (const id of this.bookmarkIds)
    {
      let dominated = false;
      // Walk up the parentId chain to see if any ancestor is in our set
      let currentId: string | undefined = id;
      try
      {
        const [node] = await chrome.bookmarks.get(currentId);
        currentId = node.parentId;
      }
      catch
      {
        // If we can't get the node, skip dedup check
        currentId = undefined;
      }

      while (currentId && currentId !== '0')
      {
        if (idSet.has(currentId))
        {
          dominated = true;
          break;
        }
        try
        {
          const [parent] = await chrome.bookmarks.get(currentId);
          currentId = parent.parentId;
        }
        catch
        {
          break;
        }
      }

      if (!dominated)
      {
        deduped.push(id);
      }
    }

    // Snapshot each remaining ID via getSubTree
    this.snapshots = [];
    for (const id of deduped)
    {
      try
      {
        const [subtree] = await chrome.bookmarks.getSubTree(id);
        this.snapshots.push(subtree);
      }
      catch
      {
        // Node may already be gone — skip
      }
    }

    // Build description
    if (this.snapshots.length === 1)
    {
      const name = this.snapshots[0].title || 'bookmark';
      this.description = `Deleted "${truncateTitle(name)}"`;

    }
    else
    {
      this.description = `Deleted ${this.snapshots.length} bookmarks`;
    }

    // Close any live tabs associated with bookmarks being deleted
    if (this.getTabIdForBookmark)
    {
      const tabIds = this.collectBookmarkIds(this.snapshots)
        .map(id => this.getTabIdForBookmark!(id))
        .filter((id): id is number => id !== undefined);
      if (tabIds.length > 0)
      {
        try { await chrome.tabs.remove(tabIds); }
        catch { /* tabs may already be closed */ }
      }
    }

    if (import.meta.env.DEV)
    {
      console.log(`[DeleteAction] do: deleting ${this.snapshots.length} items:`,
        this.snapshots.map(s => `"${s.title}" (${s.id}, parent=${s.parentId}, idx=${s.index})`));
    }

    // Delete each via removeTree (batch to prevent intermediate UI refetches)
    await runBatchOperation(async () =>
    {
      for (const snapshot of this.snapshots)
      {
        try
        {
          await chrome.bookmarks.removeTree(snapshot.id);
          if (import.meta.env.DEV)
          {
            console.log(`[DeleteAction] do: removed "${snapshot.title}" (${snapshot.id})`);
          }
        }
        catch (err)
        {
          if (import.meta.env.DEV)
          {
            console.warn(`[DeleteAction] do: removeTree failed for "${snapshot.title}" (${snapshot.id}):`, err);
          }
        }
      }
    });
  }

  async undo(): Promise<void>
  {
    if (import.meta.env.DEV)
    {
      console.log(`[DeleteAction] undo: restoring ${this.snapshots.length} items:`,
        this.snapshots.map(s => `"${s.title}" (parent=${s.parentId}, idx=${s.index})`));
    }

    // Sort snapshots by (parentId, index) so same-parent items restore in ascending
    // index order. Without this, restoring index=1 before index=0 causes "Index out of bounds".
    const sorted = [...this.snapshots].sort((a, b) =>
    {
      if (a.parentId !== b.parentId) return (a.parentId ?? '').localeCompare(b.parentId ?? '');
      return (a.index ?? 0) - (b.index ?? 0);
    });

    // Restore snapshots in batch to prevent intermediate UI refetches
    await runBatchOperation(async () =>
    {
      for (const snapshot of sorted)
      {
        await this.restoreNode(snapshot, snapshot.parentId!, snapshot.index);
      }
    });

    if (import.meta.env.DEV)
    {
      console.log('[DeleteAction] undo: complete');
    }
  }

  /** Collect all bookmark IDs from snapshots, recursing into folder children. */
  private collectBookmarkIds(nodes: BookmarkSnapshot[]): string[]
  {
    const ids: string[] = [];
    for (const node of nodes)
    {
      ids.push(node.id);
      if (node.children)
      {
        ids.push(...this.collectBookmarkIds(node.children));
      }
    }
    return ids;
  }

  /**
   * Recursively recreate a bookmark node and its children.
   * For folders: create the folder, then restore each child.
   * For bookmarks: create with the original url.
   */
  private async restoreNode(
    node: BookmarkSnapshot,
    parentId: string,
    index?: number
  ): Promise<void>
  {
    const isFolder = !node.url;

    let created: chrome.bookmarks.BookmarkTreeNode;
    try
    {
      created = await chrome.bookmarks.create({
        parentId,
        title: node.title,
        url: isFolder ? undefined : node.url,
        index,
      });
    }
    catch (err)
    {
      console.error(`[DeleteAction] restoreNode: failed to create "${node.title}" `
        + `(parentId=${parentId}, index=${index}, url=${node.url ?? 'folder'}):`, err);
      return; // Skip this node and its children, continue with remaining snapshots
    }

    if (import.meta.env.DEV)
    {
      console.log(`[DeleteAction] restoreNode: created "${node.title}" → id=${created.id} `
        + `(parentId=${parentId}, index=${index}, ${isFolder ? 'folder' : 'bookmark'})`);
    }

    // Restore children recursively (folders only)
    if (isFolder && node.children)
    {
      for (let i = 0; i < node.children.length; i++)
      {
        await this.restoreNode(node.children[i], created.id, i);
      }
    }
  }
}
