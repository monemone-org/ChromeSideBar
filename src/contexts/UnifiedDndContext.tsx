/**
 * UnifiedDndContext - Single DndContext for cross-component drag-and-drop
 *
 * This context consolidates all drag-and-drop functionality, enabling items
 * to be dragged between PinnedBar, SpaceBar, TabList, and BookmarkTree.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragStartEvent,
  DragMoveEvent,
  DragEndEvent,
  DragCancelEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  closestCenter,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  DragData,
  DragItem,
  DragFormat,
  DropData,
  DropZone,
  DropPosition,
  calculateDropPosition,
  getAllFormats,
} from '../types/dragDrop';

// Context state for drag operations
interface UnifiedDndState
{
  // Current drag state
  activeDragData: DragData | null;
  sourceZone: DropZone | null;
  activeId: string | number | null;
  activeDragWidth: number | null;  // Width of dragged element for overlay sizing

  // Current drop target state
  overId: string | null;
  overZone: DropZone | null;
  overData: DropData | null;
  dropPosition: DropPosition;
  acceptedFormat: DragFormat | null;  // The format accepted by the current drop target

  // Multi-selection state
  isMultiDrag: boolean;
  multiDragCount: number;

  // Pointer tracking
  pointerPosition: { x: number; y: number };

  // Animation state
  wasValidDrop: boolean;
}

// Context actions
interface UnifiedDndActions
{
  // Externally provided drop handlers - registered by components
  registerDropHandler: (zone: DropZone, handler: DropHandler) => void;
  unregisterDropHandler: (zone: DropZone) => void;

  // Drag items providers - registered by components to build multi-item DragData
  registerDragItemsProvider: (zone: DropZone, provider: DragItemsProvider) => void;
  unregisterDragItemsProvider: (zone: DropZone) => void;

  // Auto-expand timer management
  setAutoExpandTimer: (targetId: string, onExpand: () => void) => void;
  clearAutoExpandTimer: () => void;

  // Set multi-drag info from components
  setMultiDragInfo: (count: number) => void;

  // Get pointer position ref for accurate tracking during scroll
  getPointerPositionRef: () => { x: number; y: number };

  // Set valid drop flag (for animation)
  setWasValidDrop: (valid: boolean) => void;
}

// Drop handler type - called when a drop completes in a zone
export type DropHandler = (
  dragData: DragData,
  dropData: DropData,
  dropPosition: DropPosition,
  acceptedFormat: DragFormat
) => Promise<void> | void;

// Drag items provider type - called at drag start to get all selected items
// Returns DragItem[] for multi-selection, or empty array to use single-item fallback
export type DragItemsProvider = (draggedItemId: string | number) => DragItem[];

interface UnifiedDndContextValue extends UnifiedDndState, UnifiedDndActions {}

const UnifiedDndContext = createContext<UnifiedDndContextValue | null>(null);

// Hook to access the unified DnD context
export const useUnifiedDnd = (): UnifiedDndContextValue =>
{
  const context = useContext(UnifiedDndContext);
  if (!context)
  {
    throw new Error('useUnifiedDnd must be used within UnifiedDndProvider');
  }
  return context;
};

// Optional hook that returns null outside provider (for gradual migration)
export const useUnifiedDndOptional = (): UnifiedDndContextValue | null =>
{
  return useContext(UnifiedDndContext);
};

interface UnifiedDndProviderProps
{
  children: React.ReactNode;
}

/**
 * Custom collision detection: prioritizes pointer position, falls back to closest center.
 * - First tries pointerWithin (accurate when cursor is inside a droppable)
 * - Falls back to closestCenter (works for gaps between elements)
 */
const pointerWithinThenClosest: CollisionDetection = (args) =>
{
  // First, check if pointer is inside any droppable
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0)
  {
    return pointerCollisions;
  }

  // Fall back to closest center for gaps
  return closestCenter(args);
};

export const UnifiedDndProvider: React.FC<UnifiedDndProviderProps> = ({ children }) =>
{
  // Drag state
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);
  const [sourceZone, setSourceZone] = useState<DropZone | null>(null);
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [activeDragWidth, setActiveDragWidth] = useState<number | null>(null);

  // Drop target state
  const [overId, setOverId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<DropZone | null>(null);
  const [overData, setOverData] = useState<DropData | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);
  const [acceptedFormat, setAcceptedFormat] = useState<DragFormat | null>(null);

  // Multi-drag state
  const [isMultiDrag, setIsMultiDrag] = useState(false);
  const [multiDragCount, setMultiDragCount] = useState(0);

  // Pointer position tracking
  const [pointerPosition, setPointerPosition] = useState({ x: 0, y: 0 });
  const pointerPositionRef = useRef({ x: 0, y: 0 });

  // Drop handlers registered by components
  const dropHandlersRef = useRef<Map<DropZone, DropHandler>>(new Map());

  // Drag items providers registered by components
  const dragItemsProvidersRef = useRef<Map<DropZone, DragItemsProvider>>(new Map());

  // Auto-expand timer refs
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIdRef = useRef<string | null>(null);

  // Valid drop flag for animation
  const wasValidDropRef = useRef(false);
  const [wasValidDrop, setWasValidDropState] = useState(false);

  // Sensors - 8px activation distance to distinguish from click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Track pointer position during drag
  useEffect(() =>
  {
    if (!activeId) return;

    const handlePointerMove = (e: PointerEvent) =>
    {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
      setPointerPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [activeId]);

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

  // Set auto-expand timer for hovering over folders/groups
  const setAutoExpandTimer = useCallback((targetId: string, onExpand: () => void) =>
  {
    if (lastHoveredIdRef.current === targetId) return;

    clearAutoExpandTimer();
    lastHoveredIdRef.current = targetId;
    autoExpandTimerRef.current = setTimeout(onExpand, 1000);
  }, [clearAutoExpandTimer]);

  // Register/unregister drop handlers
  const registerDropHandler = useCallback((zone: DropZone, handler: DropHandler) =>
  {
    dropHandlersRef.current.set(zone, handler);
  }, []);

  const unregisterDropHandler = useCallback((zone: DropZone) =>
  {
    dropHandlersRef.current.delete(zone);
  }, []);

  // Register/unregister drag items providers
  const registerDragItemsProvider = useCallback((zone: DropZone, provider: DragItemsProvider) =>
  {
    dragItemsProvidersRef.current.set(zone, provider);
  }, []);

  const unregisterDragItemsProvider = useCallback((zone: DropZone) =>
  {
    dragItemsProvidersRef.current.delete(zone);
  }, []);

  // Set multi-drag info
  const setMultiDragInfo = useCallback((count: number) =>
  {
    setIsMultiDrag(count > 1);
    setMultiDragCount(count);
  }, []);

  // Get pointer position ref (for accurate position during scroll)
  const getPointerPositionRef = useCallback(() =>
  {
    return pointerPositionRef.current;
  }, []);

  // Set valid drop flag
  const setWasValidDrop = useCallback((valid: boolean) =>
  {
    wasValidDropRef.current = valid;
    setWasValidDropState(valid);
  }, []);

  // Reset over/drop target state
  const resetOverState = useCallback(() =>
  {
    setOverId(null);
    setOverZone(null);
    setOverData(null);
    setDropPosition(null);
    setAcceptedFormat(null);
  }, []);

  // Reset all drag state
  const resetDragState = useCallback(() =>
  {
    setActiveDragData(null);
    setSourceZone(null);
    setActiveId(null);
    setActiveDragWidth(null);
    resetOverState();
    setIsMultiDrag(false);
    setMultiDragCount(0);
    clearAutoExpandTimer();
    // Note: wasValidDrop is NOT reset here - it's needed for DragOverlay animation
    // It will be reset on next drag start
  }, [clearAutoExpandTimer, resetOverState]);

  // Drag start handler
  const handleDragStart = useCallback((event: DragStartEvent) =>
  {
    const { active } = event;
    const singleItemDragData = active.data.current as DragData | undefined;

    if (!singleItemDragData)
    {
      if (import.meta.env.DEV)
      {
        console.warn('UnifiedDnd: Drag started without DragData on active element');
      }
      return;
    }

    // Extract source zone from the draggable element or its parent
    // First find the element, then walk up to find data-dnd-zone
    const element = document.querySelector(`[data-dnd-id="${active.id}"]`);
    const zoneElement = element?.closest('[data-dnd-zone]');
    const zone = zoneElement?.getAttribute('data-dnd-zone') as DropZone | null;

    // Capture element width for overlay sizing
    const width = element?.getBoundingClientRect().width ?? null;
    setActiveDragWidth(width);

    if (import.meta.env.DEV)
    {
      console.log('[UnifiedDnd] Zone detection:', {
        activeId: active.id,
        elementFound: !!element,
        zone,
        registeredProviders: Array.from(dragItemsProvidersRef.current.keys()),
      });
    }

    // Try to get multi-item drag data from the provider
    let dragData: DragData = singleItemDragData;
    if (zone)
    {
      const provider = dragItemsProvidersRef.current.get(zone);
      if (provider)
      {
        const items = provider(active.id);
        if (import.meta.env.DEV)
        {
          console.log('[UnifiedDnd] Provider returned:', { itemCount: items.length });
        }
        if (items.length > 0)
        {
          dragData = { items };
        }
      }
    }

    setActiveDragData(dragData);
    setSourceZone(zone);
    setActiveId(active.id as string | number);
    setIsMultiDrag(dragData.items.length > 1);
    setMultiDragCount(dragData.items.length);
    wasValidDropRef.current = false;
    setWasValidDropState(false);

    if (import.meta.env.DEV)
    {
      console.log('UnifiedDnd: Drag started', {
        id: active.id,
        zone,
        itemCount: dragData.items.length,
        formats: getAllFormats(dragData),
        items: dragData.items.map(item => ({
          formats: item.formats,
          tab: item.tab,
          tabGroup: item.tabGroup,
          bookmark: item.bookmark,
          pin: item.pin,
          space: item.space,
          url: item.url,
        })),
      });
    }
  }, []);

  // Drag over handler - updates drop target
  const handleDragOver = useCallback((event: DragOverEvent) =>
  {
    const { over } = event;

    if (!over || !activeDragData)
    {
      resetOverState();
      return;
    }

    const dropData = over.data.current as DropData | undefined;

    if (!dropData)
    {
      resetOverState();
      return;
    }

    // Check if drop target accepts this drag (returns the accepted format or null)
    const format = dropData.canAccept(activeDragData);
    if (!format)
    {
      resetOverState();
      return;
    }

    // Calculate drop position based on pointer and element
    const element = document.querySelector(`[data-dnd-id="${over.id}"]`);
    if (!element)
    {
      resetOverState();
      return;
    }

    const isContainer = dropData.isFolder || dropData.isGroup ||
      (dropData.isContainerForFormat?.(format) ?? false);
    const position = calculateDropPosition(
      element as HTMLElement,
      pointerPositionRef.current.x,
      pointerPositionRef.current.y,
      isContainer,
      !!dropData.isHorizontal
    );

    setOverId(over.id as string);
    setOverZone(dropData.zone);
    setOverData(dropData);
    setDropPosition(position);
    setAcceptedFormat(format);
  }, [activeDragData, resetOverState]);

  // Drag move handler - recalculate position as pointer moves within a droppable
  const handleDragMove = useCallback((_event: DragMoveEvent) =>
  {
    // Skip if not over a valid drop target
    if (!overId || !overData || !acceptedFormat) return;

    // Find the element and recalculate position
    const element = document.querySelector(`[data-dnd-id="${overId}"]`);
    if (!element) return;

    const isContainer = overData.isFolder || overData.isGroup ||
      (overData.isContainerForFormat?.(acceptedFormat) ?? false);
    const position = calculateDropPosition(
      element as HTMLElement,
      pointerPositionRef.current.x,
      pointerPositionRef.current.y,
      isContainer,
      !!overData.isHorizontal
    );

    setDropPosition(position);
  }, [overId, overData, acceptedFormat]);

  // Drag end handler
  const handleDragEnd = useCallback(async (event: DragEndEvent) =>
  {
    clearAutoExpandTimer();

    try
    {
      const { over } = event;

      if (!over || !activeDragData || !dropPosition || !acceptedFormat)
      {
        wasValidDropRef.current = false;
        setWasValidDropState(false);
        return;
      }

      const dropData = over.data.current as DropData | undefined;

      // Re-check acceptance (in case state changed during drag)
      const format = dropData?.canAccept(activeDragData);
      if (!dropData || !format)
      {
        wasValidDropRef.current = false;
        setWasValidDropState(false);
        return;
      }

      // Execute drop via registered handler
      const handler = dropHandlersRef.current.get(dropData.zone);
      if (handler)
      {
        await handler(activeDragData, dropData, dropPosition, format);
        wasValidDropRef.current = true;
        setWasValidDropState(true);

        if (import.meta.env.DEV)
        {
          console.log('UnifiedDnd: Drop completed', {
            acceptedFormat: format,
            dropZone: dropData.zone,
            dropPosition,
          });
        }
      }
      else
      {
        if (import.meta.env.DEV)
        {
          console.warn('UnifiedDnd: No drop handler registered for zone', dropData.zone);
        }
        wasValidDropRef.current = false;
        setWasValidDropState(false);
      }
    }
    catch (error)
    {
      console.error('UnifiedDnd: Drop handler error', error);
      wasValidDropRef.current = false;
      setWasValidDropState(false);
    }
    finally
    {
      resetDragState();
    }
  }, [activeDragData, dropPosition, acceptedFormat, clearAutoExpandTimer, resetDragState]);

  // Drag cancel handler
  const handleDragCancel = useCallback((_event: DragCancelEvent) =>
  {
    clearAutoExpandTimer();
    wasValidDropRef.current = false;
    setWasValidDropState(false);
    resetDragState();
  }, [clearAutoExpandTimer, resetDragState]);

  const contextValue: UnifiedDndContextValue = {
    // State
    activeDragData,
    sourceZone,
    activeId,
    activeDragWidth,
    overId,
    overZone,
    overData,
    dropPosition,
    acceptedFormat,
    isMultiDrag,
    multiDragCount,
    pointerPosition,
    wasValidDrop,

    // Actions
    registerDropHandler,
    unregisterDropHandler,
    registerDragItemsProvider,
    unregisterDragItemsProvider,
    setAutoExpandTimer,
    clearAutoExpandTimer,
    setMultiDragInfo,
    getPointerPositionRef,
    setWasValidDrop,
  };

  return (
    <UnifiedDndContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithinThenClosest}
        autoScroll={{
          threshold: { x: 0.1, y: 0.1 },
          acceleration: 7,
          interval: 10,
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
      </DndContext>
    </UnifiedDndContext.Provider>
  );
};

// Hook to get wasValidDrop for DragOverlay animation
export const useWasValidDrop = (): boolean =>
{
  const context = useContext(UnifiedDndContext);
  return context?.wasValidDrop ?? false;
};
