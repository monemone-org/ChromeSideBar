import { useState, useEffect } from 'react';
import { PinnedSite } from '../hooks/usePinnedSites';
import { Space } from '../contexts/SpacesContext';
import { Dialog } from './Dialog';

export interface ExportOptions {
  exportPinnedSites: boolean;
  exportBookmarks: boolean;
  exportTabGroups: boolean;
  exportSpaces: boolean;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pinnedSites: PinnedSite[];
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
  spaces: Space[];
}

interface TabGroupBackup {
  title: string;
  color: chrome.tabGroups.ColorEnum;
  tabs: {
    url: string;
    title: string;
    pinned: boolean;
  }[];
}

interface FullBackup {
  version: 1;
  exportedAt: string;
  pinnedSites?: PinnedSite[];
  bookmarks?: chrome.bookmarks.BookmarkTreeNode[];
  tabGroups?: TabGroupBackup[];
  spaces?: Space[];
}

export function ExportDialog({
  isOpen,
  onClose,
  pinnedSites,
  bookmarks,
  spaces,
}: ExportDialogProps) {
  const [exportPinnedSites, setExportPinnedSites] = useState(true);
  const [exportBookmarks, setExportBookmarks] = useState(true);
  const [exportTabGroups, setExportTabGroups] = useState(true);
  const [exportSpaces, setExportSpaces] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset options when dialog opens
  useEffect(() => {
    if (isOpen) {
      setExportPinnedSites(true);
      setExportBookmarks(true);
      setExportTabGroups(true);
      setExportSpaces(true);
      setError(null);
    }
  }, [isOpen]);

  const handleExport = async () => {
    if (!exportPinnedSites && !exportBookmarks && !exportTabGroups && !exportSpaces) {
      return; // Nothing to export
    }

    setIsExporting(true);
    try {
      const backup: FullBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
      };

      // Add pinned sites if selected
      if (exportPinnedSites && pinnedSites.length > 0) {
        backup.pinnedSites = pinnedSites;
      }

      // Add bookmarks if selected
      if (exportBookmarks && bookmarks.length > 0) {
        backup.bookmarks = bookmarks;
      }

      // Add tab groups if selected
      if (exportTabGroups) {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

        const tabGroups: TabGroupBackup[] = groups.map(group => ({
          title: group.title || '',
          color: group.color,
          tabs: tabs
            .filter(tab => tab.groupId === group.id)
            .map(tab => ({
              url: tab.url || '',
              title: tab.title || '',
              pinned: tab.pinned || false,
            })),
        }));

        if (tabGroups.length > 0) {
          backup.tabGroups = tabGroups;
        }
      }

      // Add spaces if selected
      if (exportSpaces && spaces.length > 0) {
        backup.spaces = spaces;
      }

      // Download the file
      const data = JSON.stringify(backup, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sidebar-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const nothingSelected = !exportPinnedSites && !exportBookmarks && !exportTabGroups && !exportSpaces;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Export" maxWidth="max-w-xs" zIndex={60}>
      <div className="p-3 space-y-3">
        {/* Pinned sites export */}
        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={exportPinnedSites}
            onChange={(e) => setExportPinnedSites(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Pinned sites ({pinnedSites.length})
        </label>

        {/* Bookmarks export */}
        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={exportBookmarks}
            onChange={(e) => setExportBookmarks(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Bookmarks
        </label>

        {/* Tabs and groups export */}
        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={exportTabGroups}
            onChange={(e) => setExportTabGroups(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Tabs and groups
        </label>

        {/* Spaces export */}
        <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={exportSpaces}
            onChange={(e) => setExportSpaces(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Spaces ({spaces.length})
        </label>

        {/* Error message */}
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        {/* Export / Cancel buttons */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || nothingSelected}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
