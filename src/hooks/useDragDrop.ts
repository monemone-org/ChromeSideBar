import { useState, useRef, useEffect, useCallback } from 'react';
import { DropPosition } from '../utils/dragDrop';

export type { DropPosition };

export const useDragDrop = <TActiveId extends string | number>() =>
{
  // Drag state
  const [activeId, setActiveId] = useState<TActiveId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

  // Refs
  const pointerPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoveredIdRef = useRef<string | number | null>(null);
  const wasValidDropRef = useRef<boolean>(false);

  // Track pointer position only during drag (more efficient)
  useEffect(() =>
  {
    if (!activeId) return;

    const handlePointerMove = (e: PointerEvent) =>
    {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
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

  // Set auto-expand timer for a target
  const setAutoExpandTimer = useCallback(
    (targetId: string | number, onExpand: () => void) =>
    {
      if (lastHoveredIdRef.current === targetId) return; // Already timing this target

      clearAutoExpandTimer();
      lastHoveredIdRef.current = targetId;
      autoExpandTimerRef.current = setTimeout(onExpand, 1000);
    },
    [clearAutoExpandTimer]
  );

  // Reset all drag state
  const resetDragState = useCallback(() =>
  {
    setActiveId(null);
    setDropTargetId(null);
    setDropPosition(null);
    clearAutoExpandTimer();
  }, [clearAutoExpandTimer]);

  return {
    // State
    activeId,
    setActiveId,
    dropTargetId,
    setDropTargetId,
    dropPosition,
    setDropPosition,

    // Refs
    pointerPositionRef,
    wasValidDropRef,

    // Methods
    setAutoExpandTimer,
    clearAutoExpandTimer,
    resetDragState,
  };
};
