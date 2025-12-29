import { useState } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { SettingsDialog, SettingsValues } from './components/SettingsDialog';
import { usePinnedSites } from './hooks/usePinnedSites';
import { FontSizeContext } from './contexts/FontSizeContext';
import { Settings } from 'lucide-react';

function App() {
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('sidebar-font-size-px');
    return saved ? parseInt(saved, 10) : 14;
  });
  const [hideOtherBookmarks, setHideOtherBookmarks] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-hide-other-bookmarks') === 'true';
  });
  const [openBookmarkInNewTab, setOpenBookmarkInNewTab] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-open-bookmark-new-tab') === 'true';
  });
  const [sortGroupsFirst, setSortGroupsFirst] = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebar-sort-groups-first');
    return saved === null ? true : saved === 'true';
  });
  const [pinnedIconSize, setPinnedIconSize] = useState<number>(() => {
    const saved = localStorage.getItem('sidebar-pinned-icon-size-px');
    return saved ? parseInt(saved, 10) : 22;
  });
  const [showSettings, setShowSettings] = useState(false);
  const { pinnedSites, addPin, removePin, updatePin, resetFavicon, openAsPinnedTab, movePin, exportPinnedSites, importPinnedSites } = usePinnedSites();

  const handleApplySettings = (newSettings: SettingsValues) => {
    setFontSize(newSettings.fontSize);
    localStorage.setItem('sidebar-font-size-px', newSettings.fontSize.toString());

    setHideOtherBookmarks(newSettings.hideOtherBookmarks);
    localStorage.setItem('sidebar-hide-other-bookmarks', newSettings.hideOtherBookmarks.toString());

    setOpenBookmarkInNewTab(newSettings.openBookmarkInNewTab);
    localStorage.setItem('sidebar-open-bookmark-new-tab', newSettings.openBookmarkInNewTab.toString());

    setSortGroupsFirst(newSettings.sortGroupsFirst);
    localStorage.setItem('sidebar-sort-groups-first', newSettings.sortGroupsFirst.toString());

    setPinnedIconSize(newSettings.pinnedIconSize);
    localStorage.setItem('sidebar-pinned-icon-size-px', newSettings.pinnedIconSize.toString());

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
      <div className="flex-1 overflow-y-auto p-2">
        <BookmarkTree onPin={addPin} hideOtherBookmarks={hideOtherBookmarks} openInNewTab={openBookmarkInNewTab} />
        <TabList onPin={addPin} sortGroupsFirst={sortGroupsFirst} />
      </div>
      </div>
    </FontSizeContext.Provider>
  );
}

export default App;
