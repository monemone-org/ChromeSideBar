export type DropPosition = 'before' | 'after' | 'into' | null;

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
  const relativeY = pointerY - rect.top;
  const height = rect.height;

  if (isContainer)
  {
    if (relativeY < height * 0.25) return 'before';
    if (relativeY > height * 0.75) return 'after';
    return 'into';
  }
  else
  {
    return relativeY < height * 0.5 ? 'before' : 'after';
  }
};
