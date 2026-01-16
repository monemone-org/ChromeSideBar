import { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';

export interface BookmarkCreateFolderModalProps
{
  isOpen: boolean;
  parentId: string | null;
  onSave: (parentId: string, title: string) => void;
  onClose: () => void;
}

export const BookmarkCreateFolderModal = ({ isOpen, parentId, onSave, onClose }: BookmarkCreateFolderModalProps) =>
{
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && parentId)
    {
      setTitle('');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, parentId]);

  if (!parentId) return null;

  const handleSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    if (title.trim())
    {
      onSave(parentId, title.trim());
      onClose();
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="New Folder" maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">Folder Name</label>
          <input
            ref={inputRef}
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter folder name"
          />
        </div>

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
            disabled={!title.trim()}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md"
          >
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
};
