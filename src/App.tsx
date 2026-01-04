import { useState, useEffect, useRef } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList, ExternalDropTarget, ResolveBookmarkDropTarget } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { SettingsDialog, SettingsValues, BookmarkOpenMode } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { usePinnedSites } from './hooks/usePinnedSites';
import { useBookmarks } from './hooks/useBookmarks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { FontSizeContext } from './contexts/FontSizeContext';
import { BookmarkTabsProvider } from './contexts/BookmarkTabsContext';
import { SIDEBAR_TAB_GROUP_NAME } from './constants';
import { Settings, Info, Upload, Download } from 'lucide-react';

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
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [externalDropTarget, setExternalDropTarget] = useState<ExternalDropTarget | null>(null);
  const bookmarkDropResolverRef = useRef<ResolveBookmarkDropTarget | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
    // If switching from Arc-style to other mode, ungroup managed tabs
    if (bookmarkOpenMode === 'arc' && newSettings.bookmarkOpenMode !== 'arc') {
      chrome.windows.getCurrent((window) => {
        chrome.tabGroups.query({ windowId: window.id, title: SIDEBAR_TAB_GROUP_NAME }, (groups) => {
          if (groups.length > 0) {
            const groupId = groups[0].id;
            chrome.tabs.query({ windowId: window.id, groupId }, (tabs) => {
              const tabIds = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
              if (tabIds.length > 0) {
                chrome.tabs.ungroup(tabIds);
              }
            });
          }
        });
      });
    }

    setFontSize(newSettings.fontSize);
    setHideOtherBookmarks(newSettings.hideOtherBookmarks);
    setSortGroupsFirst(newSettings.sortGroupsFirst);
    setPinnedIconSize(newSettings.pinnedIconSize);
    setBookmarkOpenMode(newSettings.bookmarkOpenMode);
    setShowSettings(false);
  };

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

  return (
    <FontSizeContext.Provider value={fontSize}>
      <BookmarkTabsProvider>
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
      />

      {/* Settings button with popup menu - bottom-left corner of panel */}
      <div className="absolute left-2 bottom-2 z-20">
        <button
          ref={buttonRef}
          onClick={() => setShowMenu(!showMenu)}
          title="Menu"
          className="p-1.5 rounded bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-110 transition-all duration-150"
        >
          <Settings size={16} />
        </button>

        {/* Popup menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute left-0 bottom-full mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-32"
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
          </div>
        )}
      </div>

      {/* Single scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <BookmarkTree onPin={addPin} hideOtherBookmarks={hideOtherBookmarks} externalDropTarget={externalDropTarget} bookmarkOpenMode={bookmarkOpenMode} onResolverReady={(fn) => { bookmarkDropResolverRef.current = fn; }} />
        <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
        <TabList onPin={addPin} sortGroupsFirst={sortGroupsFirst} onExternalDropTargetChange={setExternalDropTarget} resolveBookmarkDropTarget={() => bookmarkDropResolverRef.current} />
      </div>
      </div>
      </BookmarkTabsProvider>
    </FontSizeContext.Provider>
  );
}

export default App;
