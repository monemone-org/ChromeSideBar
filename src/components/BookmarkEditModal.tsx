import { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';

export interface BookmarkEditModalProps
{
  isOpen: boolean;
  node: chrome.bookmarks.BookmarkTreeNode | null;
  onSave: (id: string, title: string, url?: string) => void;
  onClose: () => void;
}

export const BookmarkEditModal = ({ isOpen, node, onSave, onClose }: BookmarkEditModalProps) =>
{
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && node)
    {
      setTitle(node.title);
      setUrl(node.url || '');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, node]);

  if (!node) return null;

  const isFolder = !node.url;

  const handleSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    onSave(node.id, title, isFolder ? undefined : url);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${isFolder ? 'Folder' : 'Bookmark'}`}
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

        {!isFolder && (
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">URL</label>
            <input
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
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
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
};
