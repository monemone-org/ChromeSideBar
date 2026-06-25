import { useState, useEffect, useRef } from 'react';
import { Dialog } from './Dialog';

export type BookmarkOpenMode = 'arc' | 'newTab' | 'activeTab';
export type TabGroupDisplayOrder = 'groupsFirst' | 'groupsLast' | 'chromeOrder';

export interface SettingsValues {
  fontSize: number;
  hideOtherBookmarks: boolean;
  tabGroupDisplayOrder: TabGroupDisplayOrder;
  pinnedIconSize: number;
  bookmarkOpenMode: BookmarkOpenMode;
  useSpaces: boolean;
  arcSingleClickOpensTab: boolean;
  audioQuickJump: boolean;
  useSpaceColor: boolean;
  spaceColorAlpha: number;  // 1-100 percent
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsValues;
  onApply: (settings: SettingsValues) => void;
}

type SettingsTab = 'appearance' | 'behaviour' | 'debug';

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onApply,
}: SettingsDialogProps) {
  // Temporary state for the dialog
  const [tempFontSize, setTempFontSize] = useState(settings.fontSize);
  const [tempHideOtherBookmarks, setTempHideOtherBookmarks] = useState(settings.hideOtherBookmarks);
  const [tempTabGroupDisplayOrder, setTempTabGroupDisplayOrder] = useState(settings.tabGroupDisplayOrder);
  const [tempPinnedIconSize, setTempPinnedIconSize] = useState(settings.pinnedIconSize);
  const [tempBookmarkOpenMode, setTempBookmarkOpenMode] = useState(settings.bookmarkOpenMode);
  const [tempUseSpaces, setTempUseSpaces] = useState(settings.useSpaces);
  const [tempArcSingleClickOpensTab, setTempArcSingleClickOpensTab] = useState(settings.arcSingleClickOpensTab);
  const [tempAudioQuickJump, setTempAudioQuickJump] = useState(settings.audioQuickJump);
  const [tempUseSpaceColor, setTempUseSpaceColor] = useState(settings.useSpaceColor);
  const [tempSpaceColorAlpha, setTempSpaceColorAlpha] = useState(settings.spaceColorAlpha);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Track previous isOpen to detect when dialog opens
  const wasOpen = useRef(false);

  // Sync temp state when dialog opens (not on every settings change)
  // Read fresh values from localStorage for visual preferences (may be stale in parent state
  // if changed in another window). Chrome storage settings are always up-to-date via listener.
  useEffect(() => {
    // Only run when dialog opens, not when settings change while open
    if (isOpen && !wasOpen.current) {
      // Read fresh from localStorage for visual preferences
      const storedFontSize = localStorage.getItem('sidebar-font-size-px');
      const storedPinnedIconSize = localStorage.getItem('sidebar-pinned-icon-size-px');
      setTempFontSize(storedFontSize ? parseInt(storedFontSize, 10) : settings.fontSize);
      setTempPinnedIconSize(storedPinnedIconSize ? parseInt(storedPinnedIconSize, 10) : settings.pinnedIconSize);
      const storedTabGroupDisplayOrder = localStorage.getItem('sidebar-tab-group-display-order');
      setTempTabGroupDisplayOrder((storedTabGroupDisplayOrder as TabGroupDisplayOrder) || settings.tabGroupDisplayOrder);

      // These don't need fresh read - not shown in dialog or use chrome.storage.local
      setTempHideOtherBookmarks(settings.hideOtherBookmarks);
      setTempBookmarkOpenMode(settings.bookmarkOpenMode);
      setTempUseSpaces(settings.useSpaces);
      setTempArcSingleClickOpensTab(settings.arcSingleClickOpensTab);
      setTempAudioQuickJump(settings.audioQuickJump);
      setTempUseSpaceColor(settings.useSpaceColor);
      setTempSpaceColorAlpha(settings.spaceColorAlpha);
      setActiveTab('appearance');
    }
    wasOpen.current = isOpen;
  }, [isOpen, settings]);

  const handleApply = () => {
    onApply({
      fontSize: tempFontSize,
      hideOtherBookmarks: tempHideOtherBookmarks,
      tabGroupDisplayOrder: tempTabGroupDisplayOrder,
      pinnedIconSize: tempPinnedIconSize,
      bookmarkOpenMode: tempBookmarkOpenMode,
      useSpaces: tempUseSpaces,
      arcSingleClickOpensTab: tempArcSingleClickOpensTab,
      audioQuickJump: tempAudioQuickJump,
      useSpaceColor: tempUseSpaceColor,
      spaceColorAlpha: tempSpaceColorAlpha,
    });
  };

  const handleTempFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (!isNaN(newSize) && newSize > 4 && newSize < 72) {
      setTempFontSize(newSize);
    }
  };

  const handleTempPinnedIconSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (!isNaN(newSize) && newSize >= 12 && newSize <= 48) {
      setTempPinnedIconSize(newSize);
    }
  };

  const tabClass = (tab: SettingsTab) =>
    `flex-1 px-3 py-2 text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`;

  const footerButtons = (
    <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
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
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Settings" maxWidth="max-w-xs" footer={footerButtons}>
      {/* Tab bar - sticky so it doesn't scroll away */}
      <div className="sticky top-0 bg-white dark:bg-gray-800 flex border-b border-gray-200 dark:border-gray-700 z-10">
        <button onClick={() => setActiveTab('appearance')} className={tabClass('appearance')}>
          Appearance
        </button>
        <button onClick={() => setActiveTab('behaviour')} className={tabClass('behaviour')}>
          Behaviour
        </button>
        {import.meta.env.DEV && (
          <button onClick={() => setActiveTab('debug')} className={tabClass('debug')}>
            Debug
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {activeTab === 'appearance' && (
          <>
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

            {/* Pinned Icon Size */}
            <div>
              <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
                Pinned Icon Size (px)
              </label>
              <input
                type="number"
                min="12"
                max="48"
                value={tempPinnedIconSize}
                onChange={handleTempPinnedIconSizeChange}
                className="w-full px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                Default: 22px
              </p>
            </div>

            {/* Use space colour as sidebar background */}
            <div>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tempUseSpaceColor}
                  onChange={(e) => setTempUseSpaceColor(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Use space colour as sidebar background
              </label>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400 ml-5">
                {tempUseSpaceColor
                  ? "Tints the sidebar with the active space's colour"
                  : "Sidebar uses the default background colour"}
              </p>
              {tempUseSpaceColor && (
                <div className="ml-5 mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-gray-700 dark:text-gray-300">
                      Intensity
                    </label>
                    <span className="text-gray-500 dark:text-gray-400">
                      {tempSpaceColorAlpha}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={tempSpaceColorAlpha}
                    onChange={(e) => setTempSpaceColorAlpha(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'behaviour' && (
          <>
            {/* Open bookmark mode */}
            <div>
              <label className="block text-gray-700 dark:text-gray-300 mb-1">
                Open bookmark
              </label>
              <select
                value={tempBookmarkOpenMode}
                onChange={(e) => setTempBookmarkOpenMode(e.target.value as BookmarkOpenMode)}
                className="w-full px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="arc">Arc style</option>
                <option value="newTab">In new tab</option>
                <option value="activeTab">In active tab</option>
              </select>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                {tempBookmarkOpenMode === 'arc' && 'Bookmarks act as persistent tabs in a group'}
                {tempBookmarkOpenMode === 'newTab' && 'Opens bookmark in a new background tab'}
                {tempBookmarkOpenMode === 'activeTab' && 'Replaces the current tab with the bookmark'}
              </p>
            </div>

            {/* Single click (Arc mode only) */}
            {tempBookmarkOpenMode === 'arc' && (
              <div>
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tempArcSingleClickOpensTab}
                    onChange={(e) => setTempArcSingleClickOpensTab(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  Single click opens live tab
                </label>
                <p className="mt-0.5 text-gray-500 dark:text-gray-400 ml-5">
                  {tempArcSingleClickOpensTab
                    ? "Single click opens the bookmark as a live tab"
                    : "Single click selects; use the hover open button to load"}
                </p>
              </div>
            )}

            {/* Show Spaces */}
            <div>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tempUseSpaces}
                  onChange={(e) => setTempUseSpaces(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Show Spaces
              </label>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400 ml-5">
                {tempUseSpaces
                  ? "Organize tabs and bookmarks into focused workspaces"
                  : "All tabs, tab groups, and bookmarks shown in one list"}
              </p>
            </div>

            {/* Audio button */}
            <div>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tempAudioQuickJump}
                  onChange={(e) => setTempAudioQuickJump(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Audio button: click to jump, hold to show list
              </label>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400 ml-5">
                {tempAudioQuickJump
                  ? "Click jumps to the latest playing tab; hold opens the audio tabs list"
                  : "Click opens the audio tabs list"}
              </p>
            </div>

            {/* Tab group display order */}
            <div>
              <label className="block text-gray-700 dark:text-gray-300 mb-1">
                Tab group display order
              </label>
              <select
                value={tempTabGroupDisplayOrder}
                onChange={(e) => setTempTabGroupDisplayOrder(e.target.value as TabGroupDisplayOrder)}
                className="w-full px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="groupsFirst">Groups before ungrouped tabs</option>
                <option value="groupsLast">Groups after ungrouped tabs</option>
                <option value="chromeOrder">Chrome's native order</option>
              </select>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400 ml-5">
                Only applies in the All view
              </p>
            </div>
          </>
        )}

        {import.meta.env.DEV && activeTab === 'debug' && (
          <>
            {/* Reset Welcome */}
            <div className="flex items-center justify-between">
              <label className="text-gray-700 dark:text-gray-300">
                Reset Welcome
              </label>
              <button
                onClick={() =>
                {
                  localStorage.removeItem('sidebar-has-seen-welcome');
                  alert('Welcome dialog reset. Reload extension to see it.');
                }}
                className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
              >
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
