import { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';

export interface BookmarkEditModalProps
{
  isOpen: boolean;
  node: chrome.bookmarks.BookmarkTreeNode | null;
  createInParentId?: string | null;  // If set, create mode; else edit mode
  onSave: (id: string, title: string, url?: string) => void;
  onCreate?: (parentId: string, title: string, url: string) => Promise<string | null>;  // Returns error message or null on success
  onClose: () => void;
}

export const BookmarkEditModal = ({
  isOpen,
  node,
  createInParentId,
  onSave,
  onCreate,
  onClose
}: BookmarkEditModalProps) =>
{
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCreateMode = !!createInParentId;

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      setError(null);  // Clear any previous error
      if (isCreateMode)
      {
        // Create mode: start with empty fields
        setTitle('');
        setUrl('');
      }
      else if (node)
      {
        // Edit mode: populate from existing node
        setTitle(node.title);
        setUrl(node.url || '');
      }
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, node, isCreateMode]);

  // In edit mode, require node; in create mode, require parentId
  if (!isCreateMode && !node) return null;
  if (isCreateMode && !createInParentId) return null;

  const isFolder = !isCreateMode && node && !node.url;

  // Normalize URL by adding https:// if no protocol is specified
  const normalizeUrl = (inputUrl: string): string =>
  {
    const trimmed = inputUrl.trim();
    if (!trimmed) return trimmed;
    // Check if URL already has a protocol
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSubmit = async (e: React.FormEvent) =>
  {
    e.preventDefault();
    const normalizedUrl = normalizeUrl(url);
    if (isCreateMode && onCreate && createInParentId)
    {
      const errorMsg = await onCreate(createInParentId, title, normalizedUrl);
      if (errorMsg)
      {
        setError(errorMsg);
        return;  // Keep dialog open so user can fix the issue
      }
    }
    else if (node)
    {
      onSave(node.id, title, isFolder ? undefined : normalizedUrl);
    }
    onClose();
  };

  const dialogTitle = isCreateMode ? 'New Bookmark' : `Edit ${isFolder ? 'Folder' : 'Bookmark'}`;
  const submitButtonText = isCreateMode ? 'Create' : 'Save';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={dialogTitle}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Name</label>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {(isCreateMode || !isFolder) && (
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">URL</label>
            <input
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              required={isCreateMode}
              placeholder={isCreateMode ? 'https://example.com' : undefined}
            />
            {error && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            {submitButtonText}
          </button>
        </div>
      </form>
    </Dialog>
  );
};
