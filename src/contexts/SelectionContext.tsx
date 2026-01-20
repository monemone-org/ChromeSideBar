import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type SelectionSection = 'tabs' | 'bookmarks';

export interface SelectionItem
{
  id: string;
  type: 'tab' | 'group' | 'bookmark' | 'folder';
  index: number;  // For range selection
}

interface SelectionContextValue
{
  // Tab selection
  tabSelection: Map<string, SelectionItem>;
  setTabSelection: (items: Map<string, SelectionItem>) => void;
  clearTabSelection: () => void;
  tabAnchor: SelectionItem | null;
  setTabAnchor: (item: SelectionItem | null) => void;

  // Bookmark selection
  bookmarkSelection: Map<string, SelectionItem>;
  setBookmarkSelection: (items: Map<string, SelectionItem>) => void;
  clearBookmarkSelection: () => void;
  bookmarkAnchor: SelectionItem | null;
  setBookmarkAnchor: (item: SelectionItem | null) => void;

  // Helpers
  isTabSelected: (id: string) => boolean;
  isBookmarkSelected: (id: string) => boolean;
  clearOtherSection: (currentSection: SelectionSection) => void;
  clearAll: () => void;
  getTabSelectionCount: () => number;
  getBookmarkSelectionCount: () => number;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export const useSelectionContext = (): SelectionContextValue =>
{
  const context = useContext(SelectionContext);
  if (!context)
  {
    throw new Error('useSelectionContext must be used within SelectionProvider');
  }
  return context;
};

interface SelectionProviderProps
{
  children: ReactNode;
}

export const SelectionProvider = ({ children }: SelectionProviderProps) =>
{
  // Tab selection state
  const [tabSelection, setTabSelectionState] = useState<Map<string, SelectionItem>>(new Map());
  const [tabAnchor, setTabAnchor] = useState<SelectionItem | null>(null);

  // Bookmark selection state
  const [bookmarkSelection, setBookmarkSelectionState] = useState<Map<string, SelectionItem>>(new Map());
  const [bookmarkAnchor, setBookmarkAnchor] = useState<SelectionItem | null>(null);

  // Tab selection methods
  const setTabSelection = useCallback((items: Map<string, SelectionItem>) =>
  {
    setTabSelectionState(items);
  }, []);

  const clearTabSelection = useCallback(() =>
  {
    setTabSelectionState(new Map());
    setTabAnchor(null);
  }, []);

  // Bookmark selection methods
  const setBookmarkSelection = useCallback((items: Map<string, SelectionItem>) =>
  {
    setBookmarkSelectionState(items);
  }, []);

  const clearBookmarkSelection = useCallback(() =>
  {
    setBookmarkSelectionState(new Map());
    setBookmarkAnchor(null);
  }, []);

  // Helpers
  const isTabSelected = useCallback((id: string): boolean =>
  {
    return tabSelection.has(id);
  }, [tabSelection]);

  const isBookmarkSelected = useCallback((id: string): boolean =>
  {
    return bookmarkSelection.has(id);
  }, [bookmarkSelection]);

  const clearOtherSection = useCallback((currentSection: SelectionSection) =>
  {
    if (currentSection === 'tabs')
    {
      clearBookmarkSelection();
    }
    else
    {
      clearTabSelection();
    }
  }, [clearTabSelection, clearBookmarkSelection]);

  const clearAll = useCallback(() =>
  {
    clearTabSelection();
    clearBookmarkSelection();
  }, [clearTabSelection, clearBookmarkSelection]);

  const getTabSelectionCount = useCallback((): number =>
  {
    return tabSelection.size;
  }, [tabSelection]);

  const getBookmarkSelectionCount = useCallback((): number =>
  {
    return bookmarkSelection.size;
  }, [bookmarkSelection]);

  // Debug logging for selection state changes
  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      console.log('[Selection] tabSelection changed:', {
        count: tabSelection.size,
        ids: Array.from(tabSelection.keys()),
        items: Array.from(tabSelection.values()),
      });
    }
  }, [tabSelection]);

  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      console.log('[Selection] tabAnchor changed:', tabAnchor);
    }
  }, [tabAnchor]);

  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      console.log('[Selection] bookmarkSelection changed:', {
        count: bookmarkSelection.size,
        ids: Array.from(bookmarkSelection.keys()),
        items: Array.from(bookmarkSelection.values()),
      });
    }
  }, [bookmarkSelection]);

  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      console.log('[Selection] bookmarkAnchor changed:', bookmarkAnchor);
    }
  }, [bookmarkAnchor]);

  // Global Escape key listener to clear all selection
  useEffect(() =>
  {
    const handler = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        clearAll();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [clearAll]);

  const value: SelectionContextValue = {
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
    clearAll,
    getTabSelectionCount,
    getBookmarkSelectionCount,
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
};
