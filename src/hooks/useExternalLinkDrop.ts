import { useEffect, useRef, useCallback, RefObject } from 'react';
import { ExternalDropTarget, ResolveBookmarkDropTarget } from '../components/TabList';

interface UseExternalLinkDropOptions
{
  containerRef: RefObject<HTMLElement | null>;
  resolveBookmarkDropTarget: ResolveBookmarkDropTarget;
  onDropTargetChange: (target: ExternalDropTarget | null) => void;
  getBookmark: (id: string) => Promise<chrome.bookmarks.BookmarkTreeNode | null>;
  expandedState: Record<string, boolean>;
  setExpandedState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

/**
 * Hook to handle external link drops (from web pages) into the bookmark tree.
 * Uses native HTML5 drag events for direct control over preventDefault().
 */
export const useExternalLinkDrop = ({
  containerRef,
  resolveBookmarkDropTarget,
  onDropTargetChange,
  getBookmark,
  expandedState,
  setExpandedState,
}: UseExternalLinkDropOptions): void =>
{
  // Auto-expand timer ref
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIdRef = useRef<string | null>(null);

  // Clear auto-expand timer
  const clearAutoExpandTimer = useCallback(() =>
  {
    if (autoExpandTimerRef.current)
    {
      clearTimeout(autoExpandTimerRef.current);
      autoExpandTimerRef.current = null;
    }
    lastHoveredIdRef.current = null;
  }, []);

  // Set auto-expand timer for a folder
  const setAutoExpandTimer = useCallback(
    (folderId: string) =>
    {
      if (lastHoveredIdRef.current === folderId) return;

      clearAutoExpandTimer();
      lastHoveredIdRef.current = folderId;
      autoExpandTimerRef.current = setTimeout(() =>
      {
        setExpandedState(prev => prev[folderId] ? prev : { ...prev, [folderId]: true });
      }, 1000);
    },
    [clearAutoExpandTimer, setExpandedState]
  );

  // Check if drag event contains external URL data (not internal @dnd-kit drag)
  const isExternalUrlDrag = useCallback((e: DragEvent): boolean =>
  {
    if (!e.dataTransfer) return false;

    const types = e.dataTransfer.types;
    // External links typically have text/uri-list and/or text/plain
    // @dnd-kit uses its own internal format, not these standard types
    return types.includes('text/uri-list') || types.includes('text/plain');
  }, []);

  // Create bookmark at the resolved target
  const createBookmarkAtTarget = useCallback(async (
    url: string,
    title: string,
    target: ExternalDropTarget
  ) =>
  {
    const targetBookmark = await getBookmark(target.bookmarkId);
    if (!targetBookmark) return;

    let parentId: string;
    let insertIndex: number | undefined;

    switch (target.position)
    {
      case 'into':
        // Drop into folder - append at end
        parentId = target.bookmarkId;
        insertIndex = undefined;
        break;

      case 'intoFirst':
        // Drop into folder at first position
        parentId = target.bookmarkId;
        insertIndex = 0;
        break;

      case 'before':
        // Insert before target
        parentId = targetBookmark.parentId!;
        insertIndex = targetBookmark.index;
        break;

      case 'after':
        // Insert after target
        parentId = targetBookmark.parentId!;
        insertIndex = (targetBookmark.index ?? 0) + 1;
        break;

      default:
        return;
    }

    try
    {
      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] Creating bookmark:', { title, url, parentId, insertIndex });
      }

      await chrome.bookmarks.create({
        parentId,
        title,
        url,
        index: insertIndex,
      });

      // Auto-expand parent folder if it was collapsed
      if (!expandedState[parentId])
      {
        setExpandedState(prev => ({ ...prev, [parentId]: true }));
      }

      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] Bookmark created successfully');
      }
    }
    catch (err)
    {
      console.error('[useExternalLinkDrop] Failed to create bookmark:', err);
    }
  }, [getBookmark, expandedState, setExpandedState]);

  useEffect(() =>
  {
    const container = containerRef.current;
    if (!container) return;

    if (import.meta.env.DEV)
    {
      console.log('[useExternalLinkDrop] Setting up native drag event listeners on:', container);
    }

    const handleDragOver = (e: DragEvent) =>
    {
      // Only handle external URL drags
      if (!isExternalUrlDrag(e)) return;

      // CRITICAL: Prevent browser from navigating to the dropped URL
      e.preventDefault();
      e.stopPropagation();

      // Resolve drop target based on cursor position
      const target = resolveBookmarkDropTarget(e.clientX, e.clientY);

      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] dragover:', { x: e.clientX, y: e.clientY, target });
      }

      if (target)
      {
        onDropTargetChange(target);

        // Handle auto-expand for folders
        if (target.isFolder && target.position === 'into')
        {
          setAutoExpandTimer(target.bookmarkId);
        }
        else
        {
          clearAutoExpandTimer();
        }
      }
      else
      {
        onDropTargetChange(null);
        clearAutoExpandTimer();
      }
    };

    const handleDrop = async (e: DragEvent) =>
    {
      // Only handle external URL drags
      if (!isExternalUrlDrag(e)) return;

      // CRITICAL: Prevent browser from navigating to the dropped URL
      e.preventDefault();
      e.stopPropagation();

      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] drop event:', e.dataTransfer?.types);
      }

      onDropTargetChange(null);
      clearAutoExpandTimer();

      if (!e.dataTransfer) return;

      const target = resolveBookmarkDropTarget(e.clientX, e.clientY);
      if (!target) return;

      // Extract URL from the drop data
      // Priority: text/uri-list first, then text/plain
      let url: string | null = null;
      let title: string | null = null;

      const uriList = e.dataTransfer.getData('text/uri-list');
      const plainText = e.dataTransfer.getData('text/plain');

      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] Drop data:', { uriList, plainText });
      }

      // text/uri-list may contain multiple URLs separated by newlines
      // (lines starting with # are comments)
      if (uriList)
      {
        const urls = uriList.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        if (urls.length > 0)
        {
          url = urls[0];
        }
      }

      // Try plain text as URL if no uri-list
      if (!url && plainText && isValidUrl(plainText))
      {
        url = plainText;
      }

      // Use plain text as title if it's different from URL
      if (plainText && plainText !== url)
      {
        title = plainText;
      }

      if (!url)
      {
        if (import.meta.env.DEV)
        {
          console.log('[useExternalLinkDrop] No valid URL found in drop data');
        }
        return;
      }

      // Use URL as title if no title provided
      if (!title)
      {
        title = url;
      }

      if (import.meta.env.DEV)
      {
        console.log('[useExternalLinkDrop] Extracted:', { url, title, target });
      }

      await createBookmarkAtTarget(url, title, target);
    };

    const handleDragLeave = (e: DragEvent) =>
    {
      // Only clear if leaving the container entirely
      // relatedTarget is the element we're entering
      if (!container.contains(e.relatedTarget as Node))
      {
        if (import.meta.env.DEV)
        {
          console.log('[useExternalLinkDrop] dragleave - left container');
        }
        onDropTargetChange(null);
        clearAutoExpandTimer();
      }
    };

    // Attach native event listeners
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragleave', handleDragLeave);

    return () =>
    {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('dragleave', handleDragLeave);
      clearAutoExpandTimer();
    };
  }, [
    containerRef,
    resolveBookmarkDropTarget,
    onDropTargetChange,
    isExternalUrlDrag,
    createBookmarkAtTarget,
    setAutoExpandTimer,
    clearAutoExpandTimer,
  ]);
};

/**
 * Check if a string is a valid URL
 */
function isValidUrl(text: string): boolean
{
  try
  {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  catch
  {
    return false;
  }
}
