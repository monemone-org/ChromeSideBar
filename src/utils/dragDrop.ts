export type DropPosition = 'before' | 'after' | 'into' | 'intoFirst' | null;

/**
 * Calculate drop position based on pointer Y relative to element.
 * Containers (folders/groups): 25% before, 50% into, 25% after
 * Items (bookmarks/tabs): 50% before, 50% after
 */
export const calculateDropPosition = (
  element: HTMLElement,
  pointerY: number,
  isContainer: boolean
): DropPosition =>
{
  const rect = element.getBoundingClientRect();
  const height = rect.height;

  // Guard against zero height or elements that aren't visible
  if (height <= 0) return null;

  const relativeY = pointerY - rect.top;

  if (isContainer)
  {
    // Containers (folders/groups): 25% before, 50% into, 25% after
    if (relativeY < height * 0.25) return 'before';
    if (relativeY > height * 0.75) return 'after';
    return 'into';
  }
  else
  {
    // Items (bookmarks/tabs): 50% before, 50% after
    return relativeY < height * 0.5 ? 'before' : 'after';
  }
};
