import React from 'react';
import { Dialog } from './Dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteDialogProps
{
  isOpen: boolean;
  itemCount: number;
  itemType: 'tabs' | 'bookmarks';
  details?: string;  // e.g., "3 tabs, 2 groups"
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  isOpen,
  itemCount,
  itemType,
  details,
  onConfirm,
  onClose,
}) =>
{
  const handleConfirm = () =>
  {
    onConfirm();
    onClose();
  };

  const actionWord = itemType === 'tabs' ? 'close' : 'delete';
  const actionWordCapitalized = itemType === 'tabs' ? 'Close' : 'Delete';
  const itemWord = itemType === 'tabs' ? 'tab' : 'bookmark';
  const itemWordPlural = itemType === 'tabs' ? 'tabs' : 'bookmarks';

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`${actionWordCapitalized} ${itemCount} ${itemCount === 1 ? itemWord : itemWordPlural}`} maxWidth="max-w-xs">
      <div className="flex flex-col">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to {actionWord} <strong>{itemCount}</strong> {itemCount === 1 ? itemWord : itemWordPlural}?
              </p>
              {details && (
                <p className="mt-1 text-[0.85em] text-gray-500 dark:text-gray-400">
                  {details}
                </p>
              )}
              {itemType === 'bookmarks' && (
                <p className="mt-2 text-[0.85em] text-gray-500 dark:text-gray-400">
                  This action cannot be undone.
                </p>
              )}
            </div>
          </div>
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
            {actionWordCapitalized}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
