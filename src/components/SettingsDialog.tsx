import { useState, useEffect, useRef } from 'react';
import { X, FlaskConical } from 'lucide-react';
import { runSearchParserTests } from '../utils/searchParser.test';

export type BookmarkOpenMode = 'arc' | 'newTab' | 'activeTab';

export interface SettingsValues {
  fontSize: number;
  hideOtherBookmarks: boolean;
  sortGroupsFirst: boolean;
  pinnedIconSize: number;
  bookmarkOpenMode: BookmarkOpenMode;
  useSpaces: boolean;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsValues;
  onApply: (settings: SettingsValues) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onApply,
}: SettingsDialogProps) {
  // Temporary state for the dialog
  const [tempFontSize, setTempFontSize] = useState(settings.fontSize);
  const [tempHideOtherBookmarks, setTempHideOtherBookmarks] = useState(settings.hideOtherBookmarks);
  const [tempSortGroupsFirst, setTempSortGroupsFirst] = useState(settings.sortGroupsFirst);
  const [tempPinnedIconSize, setTempPinnedIconSize] = useState(settings.pinnedIconSize);
  const [tempBookmarkOpenMode, setTempBookmarkOpenMode] = useState(settings.bookmarkOpenMode);
  const [tempUseSpaces, setTempUseSpaces] = useState(settings.useSpaces);

  // Test results state (dev mode only)
  const [testResults, setTestResults] = useState<{ passed: number; failed: number; results: Array<{ name: string; passed: boolean; error?: string }> } | null>(null);

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
      const storedSortGroupsFirst = localStorage.getItem('sidebar-sort-groups-first');

      setTempFontSize(storedFontSize ? parseInt(storedFontSize, 10) : settings.fontSize);
      setTempPinnedIconSize(storedPinnedIconSize ? parseInt(storedPinnedIconSize, 10) : settings.pinnedIconSize);
      setTempSortGroupsFirst(storedSortGroupsFirst ? storedSortGroupsFirst === 'true' : settings.sortGroupsFirst);

      // These don't need fresh read - not shown in dialog or use chrome.storage.local
      setTempHideOtherBookmarks(settings.hideOtherBookmarks);
      setTempBookmarkOpenMode(settings.bookmarkOpenMode);
      setTempUseSpaces(settings.useSpaces);
    }
    wasOpen.current = isOpen;
  }, [isOpen, settings]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleApply = () => {
    onApply({
      fontSize: tempFontSize,
      hideOtherBookmarks: tempHideOtherBookmarks,
      sortGroupsFirst: tempSortGroupsFirst,
      pinnedIconSize: tempPinnedIconSize,
      bookmarkOpenMode: tempBookmarkOpenMode,
      useSpaces: tempUseSpaces,
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-56 border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-2rem)] flex flex-col my-auto">
        <div className="flex justify-between items-center p-3 pb-0 flex-shrink-0">
          <h2 className="font-bold">
            Settings
          </h2>
          <button onClick={onClose} aria-label="Close settings" className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-3">
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

          {/* Behaviour group */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Behaviour
            </label>
            <div className="space-y-2">
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
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tempUseSpaces}
                  onChange={(e) => setTempUseSpaces(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Use Spaces
              </label>
              <p className="text-gray-500 dark:text-gray-400 ml-5">
                Organize tabs and bookmarks into focused workspaces
              </p>
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

          {/* Dev mode: Unit tests */}
          {import.meta.env.DEV && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <FlaskConical size={14} />
                  Unit Tests
                </label>
                <button
                  onClick={() => setTestResults(runSearchParserTests())}
                  className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                >
                  Run Tests
                </button>
              </div>
              {testResults && (
                <div className="text-xs">
                  <div className={`font-medium ${testResults.failed === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {testResults.passed} passed, {testResults.failed} failed
                  </div>
                  {testResults.failed > 0 && (
                    <div className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
                      {testResults.results.filter(r => !r.passed).map((r, i) => (
                        <div key={i} className="text-red-600 dark:text-red-400">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-red-500 dark:text-red-500 pl-2">{r.error}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
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
            </div>
          )}

        </div>

        {/* Apply / Cancel buttons - fixed at bottom */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
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
  );
}
