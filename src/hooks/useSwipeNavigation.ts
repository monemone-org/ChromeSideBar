import { useEffect, useRef } from 'react';

interface UseSwipeNavigationOptions
{
  onSwipe: (direction: 'left' | 'right') => void;
  enabled?: boolean;
  threshold?: number;  // Accumulated deltaX to trigger (default: 50)
}

// Shared cooldown timestamp across all instances
let globalCooldownUntil = 0;

/**
 * Detects 2-finger horizontal swipe gestures on trackpad.
 * Calls onSwipe with direction when threshold is exceeded.
 */
export const useSwipeNavigation = <T extends HTMLElement>(
  ref: React.RefObject<T>,
  options: UseSwipeNavigationOptions
) =>
{
  const { onSwipe, enabled = true, threshold = 50 } = options;

  const accumulatedRef = useRef(0);
  const lastTimeRef = useRef(0);
  // Use ref for callback to avoid re-attaching listener when callback changes
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  useEffect(() =>
  {
    if (!enabled) return;

    const element = ref.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) =>
    {
      const now = Date.now();

      // Ignore during cooldown
      if (now < globalCooldownUntil) return;

      // Ignore vertical scrolling
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.5) return;
      if (Math.abs(e.deltaX) < 3) return;

      // New gesture if 200ms gap
      if (now - lastTimeRef.current > 200)
      {
        accumulatedRef.current = 0;
      }
      lastTimeRef.current = now;

      accumulatedRef.current += e.deltaX;

      // Trigger when threshold exceeded
      if (accumulatedRef.current > threshold)
      {
        accumulatedRef.current = 0;
        globalCooldownUntil = now + 500;  // 500ms cooldown
        onSwipeRef.current('left');
      }
      else if (accumulatedRef.current < -threshold)
      {
        accumulatedRef.current = 0;
        globalCooldownUntil = now + 500;  // 500ms cooldown
        onSwipeRef.current('right');
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: true });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [ref, enabled, threshold]);  // Removed onSwipe from deps - using ref instead
};
