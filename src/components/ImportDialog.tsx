import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle } from 'lucide-react';
import {
  isFullBackup,
  importFullBackup,
  BookmarkImportMode,
  PinnedSitesImportMode,
  TabGroupsImportMode,
  SpacesImportMode,
  FullBackup,
  ImportOptions,
  ImportResult,
} from '../utils/backupRestore';
import { PinnedSite } from '../hooks/usePinnedSites';
import { Space } from '../hooks/useSpaces';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  replacePinnedSites: (sites: PinnedSite[]) => void;
  appendPinnedSites: (sites: PinnedSite[]) => void;
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;
  existingSpaces: Space[];
}

type DialogState = 'selecting' | 'preview' | 'importing' | 'success';

interface ParsedData {
  backup: FullBackup;
  hasPinnedSites: boolean;
  hasBookmarks: boolean;
  hasTabGroups: boolean;
  hasSpaces: boolean;
  dataTypeCount: number;
}

export function ImportDialog({
  isOpen,
  onClose,
  replacePinnedSites,
  appendPinnedSites,
  replaceSpaces,
  appendSpaces,
  existingSpaces,
}: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const [dialogState, setDialogState] = useState<DialogState>('selecting');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [importPinnedSitesFlag, setImportPinnedSitesFlag] = useState(true);
  const [pinnedSitesMode, setPinnedSitesMode] = useState<PinnedSitesImportMode>('replace');
  const [importBookmarksFlag, setImportBookmarksFlag] = useState(true);
  const [bookmarkMode, setBookmarkMode] = useState<BookmarkImportMode>('folder');
  const [importTabGroups, setImportTabGroups] = useState(true);
  const [tabGroupsMode, setTabGroupsMode] = useState<TabGroupsImportMode>('append');
  const [importSpacesFlag, setImportSpacesFlag] = useState(true);
  const [spacesMode, setSpacesMode] = useState<SpacesImportMode>('append');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track mount state for async operations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Trigger file picker when dialog opens
  useEffect(() => {
    if (isOpen && dialogState === 'selecting') {
      fileInputRef.current?.click();
    }
  }, [isOpen, dialogState]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setParsedData(null);
    setImportResult(null);
    setError(null);
    setDialogState('selecting');
    onClose();
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Skip if component unmounted during file read
      if (!isMountedRef.current) return;

      try {
        const data = JSON.parse(e.target?.result as string);
        let backup: FullBackup;

        if (isFullBackup(data)) {
          backup = data;
        } else if (Array.isArray(data)) {
          // Pinned sites only array - convert to FullBackup format
          backup = {
            version: 1,
            exportedAt: new Date().toISOString(),
            pinnedSites: data as PinnedSite[],
            bookmarks: [],
            tabGroups: [],
          };
        } else {
          setError('Invalid backup file format');
          setDialogState('preview');
          return;
        }

        const hasPinnedSites = (backup.pinnedSites?.length || 0) > 0;
        const hasBookmarks = (backup.bookmarks?.length || 0) > 0;
        const hasTabGroups = (backup.tabGroups?.length || 0) > 0;
        const hasSpaces = (backup.spaces?.length || 0) > 0;
        const dataTypeCount = [hasPinnedSites, hasBookmarks, hasTabGroups, hasSpaces].filter(Boolean).length;

        if (dataTypeCount === 0) {
          setError('Backup file contains no data');
          setDialogState('preview');
          return;
        }

        setParsedData({
          backup,
          hasPinnedSites,
          hasBookmarks,
          hasTabGroups,
          hasSpaces,
          dataTypeCount,
        });

        // Reset flags based on what's available
        setImportPinnedSitesFlag(hasPinnedSites);
        setPinnedSitesMode('replace');
        setImportBookmarksFlag(hasBookmarks);
        setBookmarkMode('folder');
        setImportTabGroups(hasTabGroups);
        setTabGroupsMode('append');
        setImportSpacesFlag(hasSpaces);
        setSpacesMode('append');
        setDialogState('preview');
      } catch {
        setError('Failed to parse backup file');
        setDialogState('preview');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!parsedData) return;

    setDialogState('importing');
    try {
      const options: ImportOptions = {
        importPinnedSites: importPinnedSitesFlag,
        pinnedSitesMode,
        importBookmarks: importBookmarksFlag,
        bookmarkMode,
        importTabGroups,
        tabGroupsMode,
        importSpaces: importSpacesFlag,
        spacesMode,
      };
      const result = await importFullBackup(
        parsedData.backup,
        options,
        replacePinnedSites,
        appendPinnedSites,
        replaceSpaces,
        appendSpaces,
        existingSpaces.map(s => s.name)
      );
      setImportResult(result);
      setDialogState('success');
    } catch (err) {
      console.error('Import failed:', err);
      setError('Import failed. Please try again.');
      setDialogState('preview');
    }
  };

  const nothingSelected = !importPinnedSitesFlag && !importBookmarksFlag && !importTabGroups && !importSpacesFlag;

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
            e.target.value = '';
          } else {
            // User cancelled file picker
            onClose();
          }
        }}
      />

      {/* Dialog - shown after file is selected */}
      {dialogState !== 'selecting' && (
        <div className="absolute inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-64 border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-2rem)] flex flex-col my-auto">
            <div className="flex justify-between items-center p-3 pb-0 flex-shrink-0">
              <h2 className="font-bold">
                {dialogState === 'success' ? 'Import Complete' : 'Import Backup'}
              </h2>
              <button
                onClick={handleClose}
                className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-3 space-y-3">
              {/* Error state */}
              {error && (
                <>
                  <p className="text-red-500">{error}</p>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end">
                    <button
                      onClick={handleClose}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}

              {/* Success state */}
              {dialogState === 'success' && importResult && (
                <>
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle size={20} />
                    <span>Successfully imported:</span>
                  </div>
                  <ul className="text-gray-600 dark:text-gray-400 ml-7 space-y-1">
                    {importResult.pinnedSitesCount > 0 && (
                      <li>{importResult.pinnedSitesCount} pinned sites</li>
                    )}
                    {importResult.bookmarksCount > 0 && (
                      <li>{importResult.bookmarksCount} bookmarks</li>
                    )}
                    {importResult.tabGroupsCount > 0 && (
                      <li>{importResult.tabGroupsCount} tabs and groups</li>
                    )}
                    {importResult.spacesCount > 0 && (
                      <li>{importResult.spacesCount} spaces</li>
                    )}
                  </ul>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end">
                    <button
                      onClick={handleClose}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}

              {/* Preview/Options state */}
              {(dialogState === 'preview' || dialogState === 'importing') && parsedData && !error && (
                <>
                  {/* Backup info */}
                  <p className="text-gray-600 dark:text-gray-400">
                    Exported: {new Date(parsedData.backup.exportedAt).toLocaleDateString()}
                  </p>

                  {/* Single data type - Pinned sites only */}
                  {parsedData.dataTypeCount === 1 && parsedData.hasPinnedSites && (
                    <div className="space-y-2">
                      <p className="text-gray-700 dark:text-gray-300">
                        {parsedData.backup.pinnedSites?.length} pinned sites
                      </p>
                      <div className="ml-2 space-y-1">
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="pinnedSitesModeSingle"
                            checked={pinnedSitesMode === 'replace'}
                            onChange={() => setPinnedSitesMode('replace')}
                            disabled={dialogState === 'importing'}
                          />
                          Replace existing pinned sites
                        </label>
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="pinnedSitesModeSingle"
                            checked={pinnedSitesMode === 'append'}
                            onChange={() => setPinnedSitesMode('append')}
                            disabled={dialogState === 'importing'}
                          />
                          Append to existing
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Single data type - Tabs/groups only */}
                  {parsedData.dataTypeCount === 1 && parsedData.hasTabGroups && (
                    <div className="space-y-2">
                      <p className="text-gray-700 dark:text-gray-300">
                        {parsedData.backup.tabGroups?.length} tabs and groups
                      </p>
                      <div className="ml-2 space-y-1">
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="tabGroupsModeSingle"
                            checked={tabGroupsMode === 'replace'}
                            onChange={() => setTabGroupsMode('replace')}
                            disabled={dialogState === 'importing'}
                          />
                          Replace all tabs
                        </label>
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="tabGroupsModeSingle"
                            checked={tabGroupsMode === 'append'}
                            onChange={() => setTabGroupsMode('append')}
                            disabled={dialogState === 'importing'}
                          />
                          Append to existing
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Bookmarks only - show mode selection */}
                  {parsedData.dataTypeCount === 1 && parsedData.hasBookmarks && (
                    <div className="space-y-2">
                      <p className="text-gray-700 dark:text-gray-300">Bookmarks</p>
                      <div className="ml-2 space-y-2">
                        <div>
                          <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                            <input
                              type="radio"
                              name="bookmarkModeSingle"
                              checked={bookmarkMode === 'folder'}
                              onChange={() => setBookmarkMode('folder')}
                              disabled={dialogState === 'importing'}
                            />
                            Import to Other Bookmarks
                          </label>
                          <p className="text-gray-500 dark:text-gray-500 ml-5 text-xs">
                            Creates a subfolder with imported bookmarks
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="bookmarkModeSingle"
                            checked={bookmarkMode === 'replace'}
                            onChange={() => setBookmarkMode('replace')}
                            disabled={dialogState === 'importing'}
                          />
                          Replace all bookmarks
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Single data type - Spaces only */}
                  {parsedData.dataTypeCount === 1 && parsedData.hasSpaces && (
                    <div className="space-y-2">
                      <p className="text-gray-700 dark:text-gray-300">
                        {parsedData.backup.spaces?.length} spaces
                      </p>
                      <div className="ml-2 space-y-1">
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="spacesModeSingle"
                            checked={spacesMode === 'replace'}
                            onChange={() => setSpacesMode('replace')}
                            disabled={dialogState === 'importing'}
                          />
                          Replace all spaces
                        </label>
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="spacesModeSingle"
                            checked={spacesMode === 'append'}
                            onChange={() => setSpacesMode('append')}
                            disabled={dialogState === 'importing'}
                          />
                          Append to existing
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Multiple data types - show checkboxes */}
                  {parsedData.dataTypeCount > 1 && (
                    <>
                      <p className="text-gray-500 dark:text-gray-400">
                        Select data to import:
                      </p>

                      {/* Pinned sites import */}
                      {parsedData.hasPinnedSites && (
                        <div>
                          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importPinnedSitesFlag}
                              onChange={(e) => setImportPinnedSitesFlag(e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600"
                              disabled={dialogState === 'importing'}
                            />
                            Pinned sites ({parsedData.backup.pinnedSites?.length})
                          </label>
                          {importPinnedSitesFlag && (
                            <div className="ml-5 mt-1 space-y-1">
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="pinnedSitesMode"
                                  checked={pinnedSitesMode === 'replace'}
                                  onChange={() => setPinnedSitesMode('replace')}
                                  disabled={dialogState === 'importing'}
                                />
                                Replace existing
                              </label>
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="pinnedSitesMode"
                                  checked={pinnedSitesMode === 'append'}
                                  onChange={() => setPinnedSitesMode('append')}
                                  disabled={dialogState === 'importing'}
                                />
                                Append to existing
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bookmarks import */}
                      {parsedData.hasBookmarks && (
                        <div>
                          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importBookmarksFlag}
                              onChange={(e) => setImportBookmarksFlag(e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600"
                              disabled={dialogState === 'importing'}
                            />
                            Bookmarks
                          </label>
                          {importBookmarksFlag && (
                            <div className="ml-5 mt-1 space-y-2">
                              <div>
                                <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="bookmarkMode"
                                    checked={bookmarkMode === 'folder'}
                                    onChange={() => setBookmarkMode('folder')}
                                    disabled={dialogState === 'importing'}
                                  />
                                  Import to Other Bookmarks
                                </label>
                                <p className="text-gray-500 dark:text-gray-500 ml-5 text-xs">
                                  Creates a subfolder with imported bookmarks
                                </p>
                              </div>
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="bookmarkMode"
                                  checked={bookmarkMode === 'replace'}
                                  onChange={() => setBookmarkMode('replace')}
                                  disabled={dialogState === 'importing'}
                                />
                                Replace all bookmarks
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tabs and groups import */}
                      {parsedData.hasTabGroups && (
                        <div>
                          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importTabGroups}
                              onChange={(e) => setImportTabGroups(e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600"
                              disabled={dialogState === 'importing'}
                            />
                            Tabs and groups ({parsedData.backup.tabGroups?.length})
                          </label>
                          {importTabGroups && (
                            <div className="ml-5 mt-1 space-y-1">
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="tabGroupsMode"
                                  checked={tabGroupsMode === 'replace'}
                                  onChange={() => setTabGroupsMode('replace')}
                                  disabled={dialogState === 'importing'}
                                />
                                Replace all tabs
                              </label>
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="tabGroupsMode"
                                  checked={tabGroupsMode === 'append'}
                                  onChange={() => setTabGroupsMode('append')}
                                  disabled={dialogState === 'importing'}
                                />
                                Append to existing
                              </label>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Spaces import */}
                      {parsedData.hasSpaces && (
                        <div>
                          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importSpacesFlag}
                              onChange={(e) => setImportSpacesFlag(e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600"
                              disabled={dialogState === 'importing'}
                            />
                            Spaces ({parsedData.backup.spaces?.length})
                          </label>
                          {importSpacesFlag && (
                            <div className="ml-5 mt-1 space-y-1">
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="spacesMode"
                                  checked={spacesMode === 'replace'}
                                  onChange={() => setSpacesMode('replace')}
                                  disabled={dialogState === 'importing'}
                                />
                                Replace all spaces
                              </label>
                              <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                                <input
                                  type="radio"
                                  name="spacesMode"
                                  checked={spacesMode === 'append'}
                                  onChange={() => setSpacesMode('append')}
                                  disabled={dialogState === 'importing'}
                                />
                                Append to existing
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Import / Cancel buttons */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end gap-2">
                    <button
                      onClick={handleClose}
                      disabled={dialogState === 'importing'}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmImport}
                      disabled={dialogState === 'importing' || nothingSelected}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {dialogState === 'importing' ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
