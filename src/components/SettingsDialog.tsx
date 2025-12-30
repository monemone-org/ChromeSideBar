import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  isFullBackup,
  exportFullBackup,
  importFullBackup,
  BookmarkImportMode,
  FullBackup,
} from '../utils/backupRestore';
import { PinnedSite } from '../hooks/usePinnedSites';

export interface SettingsValues {
  fontSize: number;
  hideOtherBookmarks: boolean;
  openBookmarkInNewTab: boolean;
  sortGroupsFirst: boolean;
  pinnedIconSize: number;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsValues;
  onApply: (settings: SettingsValues) => void;
  exportPinnedSites: () => void;
  importPinnedSites: (file: File) => void;
  pinnedSites: PinnedSite[];
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
  savePinnedSites: (sites: PinnedSite[]) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onApply,
  exportPinnedSites,
  importPinnedSites,
  pinnedSites,
  bookmarks,
  savePinnedSites,
}: SettingsDialogProps) {
  // Temporary state for the dialog
  const [tempFontSize, setTempFontSize] = useState(settings.fontSize);
  const [tempHideOtherBookmarks, setTempHideOtherBookmarks] = useState(settings.hideOtherBookmarks);
  const [tempOpenBookmarkInNewTab, setTempOpenBookmarkInNewTab] = useState(settings.openBookmarkInNewTab);
  const [tempSortGroupsFirst, setTempSortGroupsFirst] = useState(settings.sortGroupsFirst);
  const [tempPinnedIconSize, setTempPinnedIconSize] = useState(settings.pinnedIconSize);

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<FullBackup | null>(null);
  const [bookmarkMode, setBookmarkMode] = useState<BookmarkImportMode>('folder');
  const [importTabGroups, setImportTabGroups] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Sync temp state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTempFontSize(settings.fontSize);
      setTempHideOtherBookmarks(settings.hideOtherBookmarks);
      setTempOpenBookmarkInNewTab(settings.openBookmarkInNewTab);
      setTempSortGroupsFirst(settings.sortGroupsFirst);
      setTempPinnedIconSize(settings.pinnedIconSize);
    }
  }, [isOpen, settings]);

  const handleApply = () => {
    onApply({
      fontSize: tempFontSize,
      hideOtherBookmarks: tempHideOtherBookmarks,
      openBookmarkInNewTab: tempOpenBookmarkInNewTab,
      sortGroupsFirst: tempSortGroupsFirst,
      pinnedIconSize: tempPinnedIconSize,
    });
  };

  // Handle export - Cmd+Click exports all data
  const handleExport = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Full backup: bookmarks, tabs+groups, pinned sites
      exportFullBackup(pinnedSites, bookmarks);
    } else {
      // Normal export: pinned sites only
      exportPinnedSites();
    }
  };

  // Handle import file selection
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (isFullBackup(data)) {
          // Full backup - show import options dialog
          setPendingBackup(data);
          setShowImportDialog(true);
        } else {
          // Pinned sites only - import directly
          importPinnedSites(file);
        }
      } catch {
        // Invalid JSON - try as pinned sites anyway
        importPinnedSites(file);
      }
    };
    reader.readAsText(file);
  };

  // Execute full backup import
  const handleConfirmImport = async () => {
    if (!pendingBackup) return;

    setIsImporting(true);
    try {
      await importFullBackup(
        pendingBackup,
        bookmarkMode,
        importTabGroups,
        savePinnedSites
      );
      setShowImportDialog(false);
      setPendingBackup(null);
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancelImport = () => {
    setShowImportDialog(false);
    setPendingBackup(null);
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

  if (!isOpen && !showImportDialog) {
    return null;
  }

  return (
    <>
    {/* Import Options Dialog */}
    {showImportDialog && pendingBackup && (
      <div className="absolute inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-64 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold">Import Backup</h2>
            <button
              onClick={handleCancelImport}
              className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Backup info */}
            <div className="text-gray-600 dark:text-gray-400">
              <p>Exported: {new Date(pendingBackup.exportedAt).toLocaleDateString()}</p>
              <p>{pendingBackup.pinnedSites?.length || 0} pinned sites</p>
              <p>{pendingBackup.tabGroups?.length || 0} tab groups</p>
            </div>

            {/* Bookmark import mode */}
            <div>
              <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
                Bookmarks
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="bookmarkMode"
                    checked={bookmarkMode === 'folder'}
                    onChange={() => setBookmarkMode('folder')}
                  />
                  Import to folder
                </label>
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="bookmarkMode"
                    checked={bookmarkMode === 'replace'}
                    onChange={() => setBookmarkMode('replace')}
                  />
                  Replace existing
                </label>
              </div>
            </div>

            {/* Tab groups import */}
            <div>
              <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importTabGroups}
                  onChange={(e) => setImportTabGroups(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Import tab groups
              </label>
              <p className="mt-1 text-gray-500 dark:text-gray-400 ml-5">
                Creates tabs and groups
              </p>
            </div>

            {/* Import / Cancel buttons */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end gap-2">
              <button
                onClick={handleCancelImport}
                disabled={isImporting}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Main Settings Dialog */}
    {isOpen && (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-56 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">Settings</h2>
          <button onClick={onClose} className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
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

          {/* Backup */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
              Backup Pinned Sites
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                title="Cmd+Click to export all (bookmarks, tabs, groups)"
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
                      handleImportFile(e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Cmd+Click to include bookmarks, tabs, groups
            </p>
          </div>

          {/* Apply / Cancel buttons */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end gap-2">
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
    </div>
    )}
    </>
  );
}
