import React from 'react';
import { Dialog } from './Dialog';
import { Space } from '../contexts/SpacesContext';

interface SpaceDeleteDialogProps
{
  isOpen: boolean;
  space: Space | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const SpaceDeleteDialog: React.FC<SpaceDeleteDialogProps> = ({
  isOpen,
  space,
  onClose,
  onConfirm,
}) =>
{
  if (!space) return null;

  const handleConfirm = () =>
  {
    onConfirm();
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Delete Space" maxWidth="max-w-xs">
      <div className="flex flex-col">
        <div className="p-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete <strong>"{space.name}"</strong>?
          </p>
          <p className="mt-2 text-[0.85em] text-gray-500 dark:text-gray-400">
            Your bookmarks will not be deleted. Tabs in this space will be closed.
          </p>
        </div>

        <div className="flex justify-end gap-2 p-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md"
          >
            Delete
          </button>
        </div>
      </div>
    </Dialog>
  );
};
