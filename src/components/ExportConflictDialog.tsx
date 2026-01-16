import { useState, useEffect } from 'react';
import { Dialog } from './Dialog';

export type ExportConflictMode = 'overwrite' | 'merge';

export interface ExportConflictDialogProps
{
  isOpen: boolean;
  folderName: string;
  onConfirm: (mode: ExportConflictMode) => void;
  onClose: () => void;
}

export const ExportConflictDialog = ({
  isOpen,
  folderName,
  onConfirm,
  onClose
}: ExportConflictDialogProps) =>
{
  const [selectedMode, setSelectedMode] = useState<ExportConflictMode>('overwrite');

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      setSelectedMode('overwrite');
    }
  }, [isOpen]);

  const handleConfirm = () =>
  {
    onConfirm(selectedMode);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Folder Already Exists">
      <div className="p-3 space-y-3">
        <p className="text-gray-600 dark:text-gray-400">
          A bookmark folder named "{folderName}" already exists. What would you like to do?
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="radio"
              name="conflictMode"
              checked={selectedMode === 'overwrite'}
              onChange={() => setSelectedMode('overwrite')}
            />
            Overwrite (replace all bookmarks)
          </label>
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="radio"
              name="conflictMode"
              checked={selectedMode === 'merge'}
              onChange={() => setSelectedMode('merge')}
            />
            Merge (add missing bookmarks only)
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            OK
          </button>
        </div>
      </div>
    </Dialog>
  );
};
