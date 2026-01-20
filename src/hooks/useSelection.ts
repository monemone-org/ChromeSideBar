import { useCallback } from 'react';
import { useSelectionContext, SelectionItem, SelectionSection } from '../contexts/SelectionContext';

export interface UseSelectionOptions
{
  section: SelectionSection;
  getItemsInRange: (startIndex: number, endIndex: number) => SelectionItem[];
}

export interface UseSelectionResult
{
  isSelected: (id: string) => boolean;
  handleClick: (item: SelectionItem, e: React.MouseEvent) => void;
  handleContextMenu: (item: SelectionItem) => void;
  selectionCount: number;
  getSelectedItems: () => SelectionItem[];
  clearSelection: () => void;
}

export const useSelection = ({ section, getItemsInRange }: UseSelectionOptions): UseSelectionResult =>
{
  const {
    tabSelection,
    setTabSelection,
    clearTabSelection,
    tabAnchor,
    setTabAnchor,
    bookmarkSelection,
    setBookmarkSelection,
    clearBookmarkSelection,
    bookmarkAnchor,
    setBookmarkAnchor,
    isTabSelected,
    isBookmarkSelected,
    clearOtherSection,
  } = useSelectionContext();

  // Get the appropriate selection and anchor based on section
  const selection = section === 'tabs' ? tabSelection : bookmarkSelection;
  const setSelection = section === 'tabs' ? setTabSelection : setBookmarkSelection;
  const anchor = section === 'tabs' ? tabAnchor : bookmarkAnchor;
  const setAnchor = section === 'tabs' ? setTabAnchor : setBookmarkAnchor;
  const isSelected = section === 'tabs' ? isTabSelected : isBookmarkSelected;
  const clearSelection = section === 'tabs' ? clearTabSelection : clearBookmarkSelection;

  /**
   * Handle click on an item:
   * - Plain click: Select only this item, set anchor
   * - Cmd/Ctrl+click: Toggle item in selection, update anchor
   * - Shift+click: Expand selection from anchor to clicked item (additive)
   * - Always: Clear the OTHER section first
   */
  const handleClick = useCallback((item: SelectionItem, e: React.MouseEvent) =>
  {
    // Always clear the other section first
    clearOtherSection(section);

    const isCtrlOrCmd = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    if (isShift && anchor)
    {
      // Expand selection from anchor (last selected) to clicked item, adding to existing selection
      const startIndex = Math.min(anchor.index, item.index);
      const endIndex = Math.max(anchor.index, item.index);
      const itemsInRange = getItemsInRange(startIndex, endIndex);

      // Add to existing selection
      const newSelection = new Map(selection);
      for (const rangeItem of itemsInRange)
      {
        newSelection.set(rangeItem.id, rangeItem);
      }
      setSelection(newSelection);
      // Update anchor to clicked item for next shift-click
      setAnchor(item);
    }
    else if (isCtrlOrCmd)
    {
      // Toggle item in selection
      const newSelection = new Map(selection);
      if (newSelection.has(item.id))
      {
        newSelection.delete(item.id);
      }
      else
      {
        newSelection.set(item.id, item);
      }
      setSelection(newSelection);
      // Update anchor to clicked item
      setAnchor(item);
    }
    else
    {
      // Plain click - select only this item
      const newSelection = new Map<string, SelectionItem>();
      newSelection.set(item.id, item);
      setSelection(newSelection);
      setAnchor(item);
    }
  }, [section, selection, anchor, setSelection, setAnchor, clearOtherSection, getItemsInRange]);

  /**
   * Handle context menu on an item:
   * - If right-clicked item NOT in selection → select only that item
   * - Otherwise preserve selection
   */
  const handleContextMenu = useCallback((item: SelectionItem) =>
  {
    // Always clear the other section first
    clearOtherSection(section);

    if (!selection.has(item.id))
    {
      // Right-clicked item not in selection → select only that item
      const newSelection = new Map<string, SelectionItem>();
      newSelection.set(item.id, item);
      setSelection(newSelection);
      setAnchor(item);
    }
    // If item is already selected, preserve current selection
  }, [section, selection, setSelection, setAnchor, clearOtherSection]);

  const getSelectedItems = useCallback((): SelectionItem[] =>
  {
    return Array.from(selection.values());
  }, [selection]);

  return {
    isSelected,
    handleClick,
    handleContextMenu,
    selectionCount: selection.size,
    getSelectedItems,
    clearSelection,
  };
};
