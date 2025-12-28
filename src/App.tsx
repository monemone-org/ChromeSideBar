import { useState } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { usePinnedSites } from './hooks/usePinnedSites';
import { FontSizeContext } from './contexts/FontSizeContext';
import { X, Settings } from 'lucide-react';

function App() {
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('sidebar-font-size-px');
    return saved ? parseInt(saved, 10) : 14;
  });
  const [hideOtherBookmarks, setHideOtherBookmarks] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-hide-other-bookmarks') === 'true';
  });
  const [openPinnedInNewTab, setOpenPinnedInNewTab] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-open-pinned-new-tab') === 'true';
  });
  const [openBookmarkInNewTab, setOpenBookmarkInNewTab] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-open-bookmark-new-tab') === 'true';
  });
  const [sortGroupsFirst, setSortGroupsFirst] = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebar-sort-groups-first');
    return saved === null ? true : saved === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const { pinnedSites, addPin, removePin, updatePin, resetFavicon, movePin, exportPinnedSites, importPinnedSites } = usePinnedSites();

  // Temporary state for settings dialog
  const [tempFontSize, setTempFontSize] = useState(fontSize);
  const [tempHideOtherBookmarks, setTempHideOtherBookmarks] = useState(hideOtherBookmarks);
  const [tempOpenPinnedInNewTab, setTempOpenPinnedInNewTab] = useState(openPinnedInNewTab);
  const [tempOpenBookmarkInNewTab, setTempOpenBookmarkInNewTab] = useState(openBookmarkInNewTab);
  const [tempSortGroupsFirst, setTempSortGroupsFirst] = useState(sortGroupsFirst);

  const openSettings = () => {
    // Copy current values to temp state
    setTempFontSize(fontSize);
    setTempHideOtherBookmarks(hideOtherBookmarks);
    setTempOpenPinnedInNewTab(openPinnedInNewTab);
    setTempOpenBookmarkInNewTab(openBookmarkInNewTab);
    setTempSortGroupsFirst(sortGroupsFirst);
    setShowSettings(true);
  };

  const handleCancel = () => {
    setShowSettings(false);
  };

  const handleApply = () => {
    // Apply temp values to real state and localStorage
    setFontSize(tempFontSize);
    localStorage.setItem('sidebar-font-size-px', tempFontSize.toString());

    setHideOtherBookmarks(tempHideOtherBookmarks);
    localStorage.setItem('sidebar-hide-other-bookmarks', tempHideOtherBookmarks.toString());

    setOpenPinnedInNewTab(tempOpenPinnedInNewTab);
    localStorage.setItem('sidebar-open-pinned-new-tab', tempOpenPinnedInNewTab.toString());

    setOpenBookmarkInNewTab(tempOpenBookmarkInNewTab);
    localStorage.setItem('sidebar-open-bookmark-new-tab', tempOpenBookmarkInNewTab.toString());

    setSortGroupsFirst(tempSortGroupsFirst);
    localStorage.setItem('sidebar-sort-groups-first', tempSortGroupsFirst.toString());

    setShowSettings(false);
  };

  const handleTempFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (!isNaN(newSize) && newSize > 4 && newSize < 72) {
      setTempFontSize(newSize);
    }
  };

  return (
    <FontSizeContext.Provider value={fontSize}>
      <div
        className="relative flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden"
        style={{ fontSize: `${fontSize}px` }}
      >
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-56 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">Settings</h2>
              <button onClick={handleCancel} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Font Size */}
              <div>
                <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  min="6"
                  max="36"
                  value={tempFontSize}
                  onChange={handleTempFontSizeChange}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  Default: 14px
                </p>
              </div>

              {/* Behaviour group */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Behaviour
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tempHideOtherBookmarks}
                      onChange={(e) => setTempHideOtherBookmarks(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Hide "Other Bookmarks"
                  </label>

                  <div>
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOpenPinnedInNewTab}
                        onChange={(e) => setTempOpenPinnedInNewTab(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      Open pinned sites in new tab
                    </label>
                    <p className="mt-1 text-gray-500 dark:text-gray-400 ml-5">
                      Cmd+click opens in current tab
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOpenBookmarkInNewTab}
                        onChange={(e) => setTempOpenBookmarkInNewTab(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      Open bookmarks in new tab
                    </label>
                    <p className="mt-1 text-gray-500 dark:text-gray-400 ml-5">
                      Cmd+click opens in current tab
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tempSortGroupsFirst}
                      onChange={(e) => setTempSortGroupsFirst(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    Sort tab groups first
                  </label>
                </div>
              </div>

              {/* Pinned Sites Backup */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Pinned Sites Backup
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={exportPinnedSites}
                    className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Export
                  </button>
                  <label className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer">
                    Import
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          importPinnedSites(e.target.files[0]);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Apply / Cancel buttons */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pinned Sites */}
      <PinnedBar
        pinnedSites={pinnedSites}
        removePin={removePin}
        updatePin={updatePin}
        resetFavicon={resetFavicon}
        movePin={movePin}
        openInNewTab={openPinnedInNewTab}
      />

      {/* Settings button - bottom-left corner of panel */}
      <button
        onClick={openSettings}
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
