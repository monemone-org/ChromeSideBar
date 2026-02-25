import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Copy, Check } from 'lucide-react';
import { Dialog } from './Dialog';
import {
  isArcSidebar,
  parseArcSidebar,
  getImportSummary,
  importArcData,
  ArcImportData,
  ArcImportOptions,
  ArcImportResult,
  ArcImportCallbacks,
} from '../utils/arcImport';
import { PinnedSite } from '../hooks/usePinnedSites';
import { Space } from '../contexts/SpacesContext';

interface ArcImportDialogProps
{
  isOpen: boolean;
  onClose: () => void;
  replacePinnedSites: (sites: PinnedSite[]) => void;
  appendPinnedSites: (sites: PinnedSite[]) => void;
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;
  existingSpaces: Space[];
}

type DialogState = 'intro' | 'selecting' | 'preview' | 'importing' | 'success';

interface ParsedPreview
{
  data: ArcImportData;
  topAppsCount: number;
  spacesCount: number;
  pinnedItemsCount: number;
  unpinnedTabsCount: number;
  skippedCount: number;
}

const ARC_JSON_PATH = '~/Library/Application Support/Arc/StorableSidebar.json';

export function ArcImportDialog({
  isOpen,
  onClose,
  replacePinnedSites,
  appendPinnedSites,
  replaceSpaces,
  appendSpaces,
  existingSpaces,
}: ArcImportDialogProps)
{
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const [dialogState, setDialogState] = useState<DialogState>('intro');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [importResult, setImportResult] = useState<ArcImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Copy-to-clipboard state
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyPath = useCallback(() =>
  {
    navigator.clipboard.writeText(ARC_JSON_PATH);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  // Import options
  const [importTopApps, setImportTopApps] = useState(true);
  const [topAppsMode, setTopAppsMode] = useState<'append' | 'replace'>('append');
  const [importSpaces, setImportSpaces] = useState(true);
  const [spacesMode, setSpacesMode] = useState<'append' | 'replace'>('append');
  const [importUnpinnedTabs, setImportUnpinnedTabs] = useState(false);

  // Track mount state
  useEffect(() =>
  {
    isMountedRef.current = true;
    return () =>
    {
      isMountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleClose = () =>
  {
    setPreview(null);
    setImportResult(null);
    setError(null);
    setErrorDetails(null);
    setDialogState('intro');
    setImportTopApps(true);
    setTopAppsMode('append');
    setImportSpaces(true);
    setSpacesMode('append');
    setImportUnpinnedTabs(false);
    setCopied(false);
    onClose();
  };

  const handleSelectFile = () =>
  {
    setDialogState('selecting');
    // Small delay so the dialog state updates before the file picker opens
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const handleFileSelect = (file: File) =>
  {
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE)
    {
      setError('File too large (max 10MB)');
      setDialogState('preview');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) =>
    {
      if (!isMountedRef.current) return;

      try
      {
        const json = JSON.parse(e.target?.result as string);

        if (!isArcSidebar(json))
        {
          setError('Not a valid Arc StorableSidebar.json file');
          setDialogState('preview');
          return;
        }

        const data = parseArcSidebar(json);
        const summary = getImportSummary(data);

        if (summary.topAppsCount === 0 && summary.spacesCount === 0)
        {
          setError('No importable data found in file');
          setDialogState('preview');
          return;
        }

        setPreview({ data, ...summary });
        setImportTopApps(summary.topAppsCount > 0);
        setImportSpaces(summary.spacesCount > 0);
        setDialogState('preview');
      }
      catch (err)
      {
        setError('Failed to parse Arc sidebar file');
        setErrorDetails(err instanceof Error ? err.message : String(err));
        setDialogState('preview');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () =>
  {
    if (!preview) return;

    setDialogState('importing');
    try
    {
      const options: ArcImportOptions = {
        importTopApps,
        topAppsMode,
        importSpaces,
        spacesMode,
        importUnpinnedTabs,
      };
      const callbacks: ArcImportCallbacks = {
        replacePinnedSites,
        appendPinnedSites,
        replaceSpaces,
        appendSpaces,
        existingSpaces,
      };
      const result = await importArcData(preview.data, options, callbacks);
      if (isMountedRef.current)
      {
        setImportResult(result);
        setDialogState('success');
      }
    }
    catch (err)
    {
      if (isMountedRef.current)
      {
        console.error('Arc import failed:', err);
        setError('Import failed. Please try again.');
        setErrorDetails(err instanceof Error ? err.message : String(err));
        setDialogState('preview');
      }
    }
  };

  const nothingSelected = !importTopApps && !importSpaces && !importUnpinnedTabs;

  // Footer buttons
  const footerContent = (() =>
  {
    if (dialogState === 'intro')
    {
      return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSelectFile}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Select File...
          </button>
        </div>
      );
    }
    if (error)
    {
      return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end">
          <button
            onClick={handleClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Close
          </button>
        </div>
      );
    }
    if (dialogState === 'success')
    {
      return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end">
          <button
            onClick={handleClose}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Done
          </button>
        </div>
      );
    }
    if ((dialogState === 'preview' || dialogState === 'importing') && preview && !error)
    {
      return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex justify-end gap-2">
          <button
            onClick={handleClose}
            disabled={dialogState === 'importing'}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
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
      );
    }
    return null;
  })();

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) =>
        {
          if (e.target.files?.[0])
          {
            handleFileSelect(e.target.files[0]);
            e.target.value = '';
          }
          else
          {
            // User cancelled file picker — go back to intro
            setDialogState('intro');
          }
        }}
      />

      {/* Dialog */}
      <Dialog
        isOpen={isOpen && dialogState !== 'selecting'}
        onClose={handleClose}
        title={dialogState === 'success' ? 'Import Complete' : 'Import from Arc Browser'}
        maxWidth="max-w-xs"
        zIndex={60}
        footer={footerContent}
      >
        <div className="p-3 space-y-3">
          {/* Intro state */}
          {dialogState === 'intro' && (
            <>
              <p className="text-gray-700 dark:text-gray-300">
                Import your Arc Browser sidebar into Chrome, including top apps, spaces, and bookmarks.
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>Select Arc's <span className="font-mono">StorableSidebar.json</span> file from:</p>
                <div className="flex items-center gap-1">
                  <code className="bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded text-[11px] break-all">
                    {ARC_JSON_PATH}
                  </code>
                  <button
                    onClick={handleCopyPath}
                    className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                    title="Copy path"
                  >
                    {copied
                      ? <Check size={12} className="text-green-500" />
                      : <Copy size={12} />
                    }
                  </button>
                </div>
                <p className="text-gray-400 dark:text-gray-500">
                  Tip: use Cmd+Shift+G in the file picker to go to a path
                </p>
              </div>
            </>
          )}

          {/* Error state */}
          {error && (
            <>
              <p className="text-red-500">{error}</p>
              {errorDetails && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                    Show details
                  </summary>
                  <pre className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-900 p-2 rounded">
                    {errorDetails}
                  </pre>
                </details>
              )}
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
                {importResult.spacesCount > 0 && (
                  <li>
                    {importResult.spacesCount} spaces
                    {importResult.spacesMerged > 0 && (
                      <span className="text-gray-500"> ({importResult.spacesMerged} merged with existing)</span>
                    )}
                  </li>
                )}
                {importResult.bookmarksCount > 0 && (
                  <li>{importResult.bookmarksCount} bookmarks</li>
                )}
                {importResult.tabsOpened > 0 && (
                  <li>{importResult.tabsOpened} tabs opened</li>
                )}
              </ul>
              {importResult.notes.length > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {importResult.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Preview/Options state */}
          {(dialogState === 'preview' || dialogState === 'importing') && preview && !error && (
            <>
              {/* Found summary */}
              <div className="text-gray-600 dark:text-gray-400 space-y-0.5">
                <p className="text-gray-700 dark:text-gray-300 font-medium">Found:</p>
                <p className="ml-2">{preview.topAppsCount} Top Apps</p>
                <p className="ml-2">{preview.spacesCount} Spaces</p>
                <p className="ml-2">{preview.pinnedItemsCount} pinned tabs/folders</p>
                {preview.unpinnedTabsCount > 0 && (
                  <p className="ml-2">{preview.unpinnedTabsCount} unpinned tabs</p>
                )}
                {preview.skippedCount > 0 && (
                  <p className="ml-2 text-gray-500">{preview.skippedCount} skipped (live folders)</p>
                )}
              </div>

              {/* Import options */}
              <div className="space-y-2 pt-1">
                {/* Top Apps */}
                {preview.topAppsCount > 0 && (
                  <div>
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importTopApps}
                        onChange={(e) => setImportTopApps(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                        disabled={dialogState === 'importing'}
                      />
                      Top Apps as Pinned Sites
                    </label>
                    {importTopApps && (
                      <div className="ml-5 mt-1 space-y-1">
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="topAppsMode"
                            checked={topAppsMode === 'append'}
                            onChange={() => setTopAppsMode('append')}
                            disabled={dialogState === 'importing'}
                          />
                          Append to existing
                        </label>
                        <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400 cursor-pointer">
                          <input
                            type="radio"
                            name="topAppsMode"
                            checked={topAppsMode === 'replace'}
                            onChange={() => setTopAppsMode('replace')}
                            disabled={dialogState === 'importing'}
                          />
                          Replace existing
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Spaces + Bookmarks */}
                {preview.spacesCount > 0 && (
                  <div>
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importSpaces}
                        onChange={(e) => setImportSpaces(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                        disabled={dialogState === 'importing'}
                      />
                      Spaces + Bookmarks
                    </label>
                    {importSpaces && (
                      <div className="ml-5 mt-1 space-y-1">
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
                      </div>
                    )}
                  </div>
                )}

                {/* Unpinned tabs */}
                {preview.unpinnedTabsCount > 0 && (
                  <div>
                    <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importUnpinnedTabs}
                        onChange={(e) => setImportUnpinnedTabs(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                        disabled={dialogState === 'importing'}
                      />
                      Open unpinned tabs in Chrome
                    </label>
                    {importUnpinnedTabs && (
                      <p className="ml-5 text-xs text-gray-500 dark:text-gray-500">
                        Creates tab groups named after each space
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
