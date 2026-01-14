import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList, ExternalDropTarget, ResolveBookmarkDropTarget } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { Toolbar } from './components/Toolbar';
import { SpaceBar } from './components/SpaceBar';
import { SettingsDialog, SettingsValues, BookmarkOpenMode } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { Toast } from './components/Toast';
import { usePinnedSites } from './hooks/usePinnedSites';
import { useBookmarks } from './hooks/useBookmarks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { FontSizeContext } from './contexts/FontSizeContext';
import { BookmarkTabsProvider } from './contexts/BookmarkTabsContext';
import { SpacesProvider, Space, useSpacesContext } from './contexts/SpacesContext';
import { SpaceDialogs } from './components/SpaceDialogs';
import { Settings, Info, Upload, Download, RefreshCw } from 'lucide-react';

// Inner component that uses SpacesContext (must be inside SpacesProvider)
interface SidebarContentProps
{
  onPin: (url: string, title: string, faviconUrl?: string) => void;
  hideOtherBookmarks: boolean;
  externalDropTarget: ExternalDropTarget | null;
  bookmarkOpenMode: BookmarkOpenMode;
  onResolverReady: (fn: ResolveBookmarkDropTarget) => void;
  filterLiveTabs: boolean;
  filterAudible: boolean;
  filterText: string;
  sortGroupsFirst: boolean;
  onExternalDropTargetChange: (target: ExternalDropTarget | null) => void;
  resolveBookmarkDropTarget: () => ResolveBookmarkDropTarget | null;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  onPin,
  hideOtherBookmarks,
  externalDropTarget,
  bookmarkOpenMode,
  onResolverReady,
  filterLiveTabs,
  filterAudible,
  filterText,
  sortGroupsFirst,
  onExternalDropTargetChange,
  resolveBookmarkDropTarget,
}) =>
{
  const { activeSpace } = useSpacesContext();

  return (
    <>
      <BookmarkTree
        onPin={onPin}
        hideOtherBookmarks={hideOtherBookmarks}
        externalDropTarget={externalDropTarget}
        bookmarkOpenMode={bookmarkOpenMode}
        onResolverReady={onResolverReady}
        filterLiveTabs={filterLiveTabs}
        filterAudible={filterAudible}
        filterText={filterText}
        activeSpace={activeSpace}
      />
      <TabList
        onPin={onPin}
        sortGroupsFirst={sortGroupsFirst}
        onExternalDropTargetChange={onExternalDropTargetChange}
        resolveBookmarkDropTarget={resolveBookmarkDropTarget}
        arcStyleEnabled={bookmarkOpenMode === 'arc'}
        filterAudible={filterAudible}
        filterText={filterText}
      />
    </>
  );
};

function App() {
  const [fontSize, setFontSize] = useLocalStorage('sidebar-font-size-px', 14, {
    parse: (v) => parseInt(v, 10),
    serialize: (v) => v.toString()
  });
  const [hideOtherBookmarks, setHideOtherBookmarks] = useLocalStorage(
    'sidebar-hide-other-bookmarks',
    false,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [sortGroupsFirst, setSortGroupsFirst] = useLocalStorage(
    'sidebar-sort-groups-first',
    true,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [pinnedIconSize, setPinnedIconSize] = useLocalStorage(
    'sidebar-pinned-icon-size-px',
    22,
    { parse: (v) => parseInt(v, 10), serialize: (v) => v.toString() }
  );
  const [bookmarkOpenMode, setBookmarkOpenMode] = useLocalStorage<BookmarkOpenMode>(
    'sidebar-bookmark-open-mode',
    'arc',
    {
      parse: (v) => {
        // Migration from old boolean setting
        if (v === 'true') return 'arc';
        if (v === 'false') return 'newTab';
        return v as BookmarkOpenMode;
      },
      serialize: (v) => v
    }
  );
  const [showFilterArea, setShowFilterArea] = useLocalStorage(
    'sidebar-show-filter-area',
    false,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [filterLiveTabs, setFilterLiveTabs] = useState(false);
  const [filterAudible, setFilterAudible] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [savedFilters, setSavedFilters] = useLocalStorage<string[]>(
    'sidebar-saved-filters',
    [],
    { parse: (v) => JSON.parse(v), serialize: (v) => JSON.stringify(v) }
  );
  const [recentFilters, setRecentFilters] = useLocalStorage<string[]>(
    'sidebar-recent-filters',
    [],
    { parse: (v) => JSON.parse(v), serialize: (v) => JSON.stringify(v) }
  );
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [externalDropTarget, setExternalDropTarget] = useState<ExternalDropTarget | null>(null);
  const [spaceToEdit, setSpaceToEdit] = useState<Space | null>(null);
  const [showSpaceEditDialog, setShowSpaceEditDialog] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null);
  const [showSpaceDeleteDialog, setShowSpaceDeleteDialog] = useState(false);
  const bookmarkDropResolverRef = useRef<ResolveBookmarkDropTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null!);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    pinnedSites,
    addPin,
    removePin,
    updatePin,
    resetFavicon,
    movePin,
    duplicatePin,
    replacePinnedSites,
    appendPinnedSites,
  } = usePinnedSites();
  const { bookmarks } = useBookmarks();

  const handleApplySettings = (newSettings: SettingsValues) => {
    setFontSize(newSettings.fontSize);
    setHideOtherBookmarks(newSettings.hideOtherBookmarks);
    setSortGroupsFirst(newSettings.sortGroupsFirst);
    setPinnedIconSize(newSettings.pinnedIconSize);
    setBookmarkOpenMode(newSettings.bookmarkOpenMode);
    setShowSettings(false);
  };

  // Filter handlers
  const handleFilterTextChange = (text: string) => {
    // Reset audible filter only when starting a new search (empty → non-empty)
    // This shows all matched tabs, not just audible ones
    // If user manually re-enables audible filter after, that choice is respected
    if (filterText.trim() === '' && text.trim() !== '') {
      setFilterAudible(false);
    }
    setFilterText(text);
  };

  const handleSaveFilter = (text: string) => {
    if (text.trim() && !savedFilters.includes(text.trim())) {
      setSavedFilters([text.trim(), ...savedFilters]);
    }
  };

  const handleDeleteSavedFilter = (text: string) => {
    setSavedFilters(savedFilters.filter((f) => f !== text));
  };

  const handleApplyFilter = (text: string) => {
    // Reset audible filter when applying a filter from empty state
    if (filterText.trim() === '' && text.trim() !== '') {
      setFilterAudible(false);
    }
    setFilterText(text);
    // Add to recent filters (avoid duplicates, max 5)
    const trimmed = text.trim();
    if (trimmed) {
      const newRecent = [trimmed, ...recentFilters.filter((f) => f !== trimmed)].slice(0, 5);
      setRecentFilters(newRecent);
    }
  };

  // Update recent filter (called on blur/Enter from toolbar)
  // If existingEntry is provided, replace it; otherwise add new
  const handleUpdateRecent = useCallback((text: string, existingEntry?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Remove existing entry if provided (we're updating it)
    // Also remove duplicates of the new text
    const filtered = recentFilters.filter((f) => f !== trimmed && f !== existingEntry);
    // Add new text at the top, max 5
    setRecentFilters([trimmed, ...filtered].slice(0, 5));
  }, [recentFilters]);

  // Toast helpers
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // Reset all filters
  const handleResetFilters = useCallback(() => {
    setFilterText('');
    setFilterLiveTabs(false);
    setFilterAudible(false);
  }, []);

  // Space handlers
  const handleCreateSpace = useCallback(() => {
    setSpaceToEdit(null);
    setShowSpaceEditDialog(true);
  }, []);

  const handleEditSpace = useCallback((space: Space) => {
    setSpaceToEdit(space);
    setShowSpaceEditDialog(true);
  }, []);

  const handleDeleteSpace = useCallback((space: Space) => {
    setSpaceToDelete(space);
    setShowSpaceDeleteDialog(true);
  }, []);

  // Close menu when clicking outside
  useEffect(() =>
  {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) =>
    {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      )
      {
        setShowMenu(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () =>
    {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showMenu]);

  // Enable tab history debug logging in DEV builds
  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      chrome.runtime.sendMessage({ action: 'set-debug-tab-history', enabled: true });
    }
  }, []);

  return (
    <FontSizeContext.Provider value={fontSize}>
      <BookmarkTabsProvider>
      <SpacesProvider>
      <div
        className="relative flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden"
        style={{ fontSize: `${fontSize}px` }}
      >
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={{
          fontSize,
          hideOtherBookmarks,
          sortGroupsFirst,
          pinnedIconSize,
          bookmarkOpenMode,
        }}
        onApply={handleApplySettings}
      />

      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
      />

      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        pinnedSites={pinnedSites}
        bookmarks={bookmarks}
      />

      <ImportDialog
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        replacePinnedSites={replacePinnedSites}
        appendPinnedSites={appendPinnedSites}
      />

      {/* Toolbar */}
      <div ref={toolbarRef} className="relative">
        <Toolbar
          filterLiveTabsActive={filterLiveTabs}
          onFilterLiveTabsToggle={() => setFilterLiveTabs(!filterLiveTabs)}
          filterAudibleActive={filterAudible}
          onFilterAudibleToggle={() => setFilterAudible(!filterAudible)}
          onMenuToggle={() => setShowMenu(!showMenu)}
          menuButtonRef={buttonRef}
          filterText={filterText}
          onFilterTextChange={handleFilterTextChange}
          savedFilters={savedFilters}
          recentFilters={recentFilters}
          onSaveFilter={handleSaveFilter}
          onDeleteSavedFilter={handleDeleteSavedFilter}
          onApplyFilter={handleApplyFilter}
          onUpdateRecent={handleUpdateRecent}
          onShowToast={showToast}
          onResetFilters={handleResetFilters}
          showFilterArea={showFilterArea}
          onToggleFilterArea={() => setShowFilterArea(!showFilterArea)}
        />

        {/* Popup menu - positioned below settings button */}
        {showMenu && buttonRef.current && (
          <div
            ref={menuRef}
            className="absolute right-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-32 z-50"
            style={{
              top: buttonRef.current.offsetTop + buttonRef.current.offsetHeight + 4,
            }}
          >
            <button
              onClick={() =>
              {
                setShowMenu(false);
                setShowSettings(true);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
            >
              <Settings size={14} />
              Settings
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={() =>
              {
                setShowMenu(false);
                setShowExport(true);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
            >
              <Upload size={14} />
              Export...
            </button>
            <button
              onClick={() =>
              {
                setShowMenu(false);
                // Toggle off first to ensure state resets, then on
                setShowImport(false);
                setTimeout(() => setShowImport(true), 0);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
            >
              <Download size={14} />
              Import...
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={() =>
              {
                setShowMenu(false);
                setShowAbout(true);
              }}
              className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
            >
              <Info size={14} />
              About
            </button>
            {import.meta.env.DEV && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => chrome.runtime.reload()}
                  className="w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
                >
                  <RefreshCw size={14} />
                  Reload Extension
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pinned Sites */}
      <PinnedBar
        pinnedSites={pinnedSites}
        removePin={removePin}
        updatePin={updatePin}
        resetFavicon={resetFavicon}
        movePin={movePin}
        duplicatePin={duplicatePin}
        iconSize={pinnedIconSize}
        bookmarkOpenMode={bookmarkOpenMode}
        filterLiveTabs={filterLiveTabs}
        filterAudible={filterAudible}
        filterText={filterText}
      />

      {/* Single scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <SidebarContent
          onPin={addPin}
          hideOtherBookmarks={hideOtherBookmarks}
          externalDropTarget={externalDropTarget}
          bookmarkOpenMode={bookmarkOpenMode}
          onResolverReady={(fn) => { bookmarkDropResolverRef.current = fn; }}
          filterLiveTabs={filterLiveTabs}
          filterAudible={filterAudible}
          filterText={filterText}
          sortGroupsFirst={sortGroupsFirst}
          onExternalDropTargetChange={setExternalDropTarget}
          resolveBookmarkDropTarget={() => bookmarkDropResolverRef.current}
        />
      </div>

      {/* Space Dialogs */}
      <SpaceDialogs
        showEditDialog={showSpaceEditDialog}
        spaceToEdit={spaceToEdit}
        onCloseEditDialog={() => setShowSpaceEditDialog(false)}
        showDeleteDialog={showSpaceDeleteDialog}
        spaceToDelete={spaceToDelete}
        onCloseDeleteDialog={() => setShowSpaceDeleteDialog(false)}
      />

      {/* Space Bar */}
      <SpaceBar
        onCreateSpace={handleCreateSpace}
        onEditSpace={handleEditSpace}
        onDeleteSpace={handleDeleteSpace}
      />

      <Toast
        message={toastMessage}
        isVisible={toastVisible}
        onDismiss={hideToast}
      />
      </div>
      </SpacesProvider>
      </BookmarkTabsProvider>
    </FontSizeContext.Provider>
  );
}

export default App;
