import { useState } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { usePinnedSites } from './hooks/usePinnedSites';
import { X } from 'lucide-react';

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
  const [showSettings, setShowSettings] = useState(false);
  const { pinnedSites, addPin, removePin, updatePin, resetFavicon, movePin } = usePinnedSites();

  const handleHideOtherBookmarksChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    setHideOtherBookmarks(value);
    localStorage.setItem('sidebar-hide-other-bookmarks', value.toString());
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (!isNaN(newSize) && newSize > 4 && newSize < 72) {
      setFontSize(newSize);
      localStorage.setItem('sidebar-font-size-px', newSize.toString());
    }
  };

  const handleOpenPinnedInNewTabChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    setOpenPinnedInNewTab(value);
    localStorage.setItem('sidebar-open-pinned-new-tab', value.toString());
  };

  const handleOpenBookmarkInNewTabChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    setOpenBookmarkInNewTab(value);
    localStorage.setItem('sidebar-open-bookmark-new-tab', value.toString());
  };

  return (
    <div
      className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 text-sm">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-56 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  min="6"
                  max="36"
                  value={fontSize}
                  onChange={handleFontSizeChange}
                  className="w-full px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Default: 14px
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideOtherBookmarks}
                    onChange={handleHideOtherBookmarksChange}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Hide "Other Bookmarks"
                </label>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openPinnedInNewTab}
                    onChange={handleOpenPinnedInNewTabChange}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Open pinned sites in new tab
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-5">
                  Cmd+click opens in current tab
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openBookmarkInNewTab}
                    onChange={handleOpenBookmarkInNewTabChange}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Open bookmarks in new tab
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-5">
                  Cmd+click opens in current tab
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pinned Sites (includes settings button) */}
      <PinnedBar
        pinnedSites={pinnedSites}
        removePin={removePin}
        updatePin={updatePin}
        resetFavicon={resetFavicon}
        movePin={movePin}
        openInNewTab={openPinnedInNewTab}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Single scrollable content */}
      <div className="flex-1 overflow-y-auto p-2">
        <BookmarkTree onPin={addPin} hideOtherBookmarks={hideOtherBookmarks} openInNewTab={openBookmarkInNewTab} />
        <TabList onPin={addPin} />
      </div>
    </div>
  );
}

export default App;
