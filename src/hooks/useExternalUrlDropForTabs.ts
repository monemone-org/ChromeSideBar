import { useEffect, useRef, useCallback, RefObject } from 'react';
import { DropPosition, calculateDropPosition } from '../utils/dragDrop';

// Drop target info for external URL drops on tabs
export interface TabDropTarget
{
  targetId: string;  // Tab ID (number as string) or group ID ("group-123")
  position: DropPosition;
  isGroup: boolean;
  groupId?: number;  // Chrome tab group ID if targeting a group
}

interface UseExternalUrlDropForTabsOptions
{
  containerRef: RefObject<HTMLElement | null>;
  onDropTargetChange: (target: TabDropTarget | null) => void;
  onDrop: (url: string, title: string, target: TabDropTarget | null) => void;
  expandedGroups: Record<string, boolean>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

/**
 * Hook to handle external URL drops (from web pages) into the tab list.
 * Creates new tabs when URLs are dropped.
 * Uses native HTML5 drag events for direct control over preventDefault().
 */
export const useExternalUrlDropForTabs = ({
  containerRef,
  onDropTargetChange,
  onDrop,
  expandedGroups,
  setExpandedGroups,
}: UseExternalUrlDropForTabsOptions): void =>
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

  // Set auto-expand timer for a group
  const setAutoExpandTimer = useCallback(
    (groupId: string) =>
    {
      if (lastHoveredIdRef.current === groupId) return;

      clearAutoExpandTimer();
      lastHoveredIdRef.current = groupId;
      autoExpandTimerRef.current = setTimeout(() =>
      {
        setExpandedGroups(prev => prev[groupId] ? prev : { ...prev, [groupId]: true });
      }, 1000);
    },
    [clearAutoExpandTimer, setExpandedGroups]
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

  // Resolve drop target for tabs
  const resolveTabDropTarget = useCallback((
    x: number,
    y: number
  ): TabDropTarget | null =>
  {
    // First check for group headers
    const elements = document.elementsFromPoint(x, y);

    // Check for group header first
    const groupElement = elements.find(el =>
      el.hasAttribute('data-group-header-id')
    ) as HTMLElement | undefined;

    if (groupElement)
    {
      const groupId = groupElement.getAttribute('data-group-header-id');
      if (groupId)
      {
        const numericGroupId = parseInt(groupId, 10);
        const position = calculateDropPosition(groupElement, y, true);
        const isExpandedGroup = !!expandedGroups[numericGroupId];

        // For expanded groups, 'after' becomes 'intoFirst'
        let effectivePosition = position;
        if (isExpandedGroup && position === 'after')
        {
          effectivePosition = 'intoFirst';
        }

        // Handle auto-expand for collapsed groups
        if (position === 'into' && !expandedGroups[numericGroupId])
        {
          setAutoExpandTimer(String(numericGroupId));
        }
        else
        {
          clearAutoExpandTimer();
        }

        return {
          targetId: `group-${groupId}`,
          position: effectivePosition!,
          isGroup: true,
          groupId: numericGroupId,
        };
      }
    }

    // Check for tab elements
    const tabElement = elements.find(el =>
      el.hasAttribute('data-tab-id')
    ) as HTMLElement | undefined;

    if (tabElement)
    {
      const tabId = tabElement.getAttribute('data-tab-id');
      const groupId = tabElement.getAttribute('data-group-id');

      if (tabId)
      {
        clearAutoExpandTimer();
        const position = calculateDropPosition(tabElement, y, false);
        return {
          targetId: tabId,
          position: position!,
          isGroup: false,
          groupId: groupId && groupId !== '-1' ? parseInt(groupId, 10) : undefined,
        };
      }
    }

    clearAutoExpandTimer();
    return null;
  }, [expandedGroups, setAutoExpandTimer, clearAutoExpandTimer]);

  useEffect(() =>
  {
    const container = containerRef.current;
    if (!container) return;

    // if (import.meta.env.DEV)
    // {
    //   console.log('[useExternalUrlDropForTabs] Setting up native drag event listeners');
    // }

    const handleDragOver = (e: DragEvent) =>
    {
      // Only handle external URL drags
      if (!isExternalUrlDrag(e)) return;

      // CRITICAL: Prevent browser from navigating to the dropped URL
      e.preventDefault();
      e.stopPropagation();

      // Resolve drop target based on cursor position
      const target = resolveTabDropTarget(e.clientX, e.clientY);

      if (import.meta.env.DEV)
      {
        console.log('[useExternalUrlDropForTabs] dragover:', { x: e.clientX, y: e.clientY, target });
      }

      onDropTargetChange(target);
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
        console.log('[useExternalUrlDropForTabs] drop event:', e.dataTransfer?.types);
      }

      const target = resolveTabDropTarget(e.clientX, e.clientY);
      onDropTargetChange(null);
      clearAutoExpandTimer();

      if (!e.dataTransfer) return;

      // Extract URL from the drop data
      let url: string | null = null;
      let title: string | null = null;

      const uriList = e.dataTransfer.getData('text/uri-list');
      const plainText = e.dataTransfer.getData('text/plain');

      if (import.meta.env.DEV)
      {
        console.log('[useExternalUrlDropForTabs] Drop data:', { uriList, plainText });
      }

      // text/uri-list may contain multiple URLs separated by newlines
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
          console.log('[useExternalUrlDropForTabs] No valid URL found in drop data');
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
        console.log('[useExternalUrlDropForTabs] Extracted:', { url, title, target });
      }

      onDrop(url, title, target);
    };

    const handleDragLeave = (e: DragEvent) =>
    {
      // Only clear if leaving the container entirely
      if (!container.contains(e.relatedTarget as Node))
      {
        if (import.meta.env.DEV)
        {
          console.log('[useExternalUrlDropForTabs] dragleave - left container');
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
    onDropTargetChange,
    onDrop,
    isExternalUrlDrag,
    resolveTabDropTarget,
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
