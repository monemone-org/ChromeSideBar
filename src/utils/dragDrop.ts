export type DropPosition = 'before' | 'after' | 'into' | 'intoFirst' | null;

/**
 * Calculate drop position based on pointer position relative to element.
 * - Vertical (default): Uses Y coordinate
 * - Horizontal (isHorizontal=true): Uses X coordinate (for PinnedBar, SpaceBar)
 *
 * Containers (folders/groups): 25% before, 50% into, 25% after
 * Items (bookmarks/tabs): 50% before, 50% after
 *
 * For expanded containers, the bottom 25% returns 'intoFirst' instead of 'after',
 * since dropping after an expanded group should insert at the start of the group.
 */
export const calculateDropPosition = (
  element: HTMLElement,
  pointerX: number,
  pointerY: number,
  isContainer: boolean,
  isHorizontal: boolean = false,
  isExpanded: boolean = false
): DropPosition =>
{
  const rect = element.getBoundingClientRect();

  if (isHorizontal)
  {
    const width = rect.width;
    if (width <= 0) return null;

    const relativeX = pointerX - rect.left;

    if (isContainer)
    {
      if (relativeX < width * 0.25) return 'before';
      if (relativeX > width * 0.75)
      {
        // For expanded containers, 'after' becomes 'intoFirst' (insert at start)
        return isExpanded ? 'intoFirst' : 'after';
      }
      return 'into';
    }
    else
    {
      return relativeX < width * 0.5 ? 'before' : 'after';
    }
  }
  else
  {
    const height = rect.height;
    if (height <= 0) return null;

    const relativeY = pointerY - rect.top;

    if (isContainer)
    {
      if (relativeY < height * 0.25) return 'before';
      if (relativeY > height * 0.75)
      {
        // For expanded containers, 'after' becomes 'intoFirst' (insert at start)
        return isExpanded ? 'intoFirst' : 'after';
      }
      return 'into';
    }
    else
    {
      return relativeY < height * 0.5 ? 'before' : 'after';
    }
  }
};
