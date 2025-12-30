import { useState } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { SettingsDialog, SettingsValues } from './components/SettingsDialog';
import { usePinnedSites } from './hooks/usePinnedSites';
import { useBookmarks } from './hooks/useBookmarks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { FontSizeContext } from './contexts/FontSizeContext';
import { Settings } from 'lucide-react';

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

      {/* Settings button - bottom-left corner of panel */}
      <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        className="absolute left-2 bottom-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-700 dark:text-gray-200 z-10"
      >
        <Settings size={16} />
      </button>

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
