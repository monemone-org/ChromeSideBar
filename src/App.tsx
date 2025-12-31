import { useState, useEffect, useRef } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { SettingsDialog, SettingsValues } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { usePinnedSites } from './hooks/usePinnedSites';
import { useBookmarks } from './hooks/useBookmarks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { FontSizeContext } from './contexts/FontSizeContext';
import { Settings, Info } from 'lucide-react';

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
  const [openBookmarkInNewTab, setOpenBookmarkInNewTab] = useLocalStorage(
    'sidebar-open-bookmark-new-tab',
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
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {
    pinnedSites,
    addPin,
    removePin,
    updatePin,
    resetFavicon,
    openAsPinnedTab,
    movePin,
    exportPinnedSites,
    importPinnedSites,
    replacePinnedSites,
  } = usePinnedSites();
  const { bookmarks } = useBookmarks();

  const handleApplySettings = (newSettings: SettingsValues) => {
    setFontSize(newSettings.fontSize);
    setHideOtherBookmarks(newSettings.hideOtherBookmarks);
    setOpenBookmarkInNewTab(newSettings.openBookmarkInNewTab);
    setSortGroupsFirst(newSettings.sortGroupsFirst);
    setPinnedIconSize(newSettings.pinnedIconSize);
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
          openBookmarkInNewTab,
          sortGroupsFirst,
          pinnedIconSize,
        }}
        onApply={handleApplySettings}
        exportPinnedSites={exportPinnedSites}
        importPinnedSites={importPinnedSites}
        pinnedSites={pinnedSites}
        bookmarks={bookmarks}
        savePinnedSites={replacePinnedSites}
      />

      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
      />

      {/* Pinned Sites */}
      <PinnedBar
        pinnedSites={pinnedSites}
        removePin={removePin}
        updatePin={updatePin}
        resetFavicon={resetFavicon}
        openAsPinnedTab={openAsPinnedTab}
        movePin={movePin}
        iconSize={pinnedIconSize}
      />

      {/* Settings button with popup menu - bottom-left corner of panel */}
      <div className="absolute left-2 bottom-2 z-20">
        <button
          ref={buttonRef}
          onClick={() => setShowMenu(!showMenu)}
          title="Menu"
          className="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-110 transition-all duration-150"
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
        <BookmarkTree onPin={addPin} hideOtherBookmarks={hideOtherBookmarks} openInNewTab={openBookmarkInNewTab} />
        <TabList onPin={addPin} sortGroupsFirst={sortGroupsFirst} />
      </div>
      </div>
    </FontSizeContext.Provider>
  );
}

export default App;
