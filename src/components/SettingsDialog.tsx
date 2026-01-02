import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface SettingsValues {
  fontSize: number;
  hideOtherBookmarks: boolean;
  sortGroupsFirst: boolean;
  pinnedIconSize: number;
}

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsValues;
  onApply: (settings: SettingsValues) => void;
}

export function SettingsDialog({
  isOpen,
  onClose,
  settings,
  onApply,
}: SettingsDialogProps) {
  // Temporary state for the dialog
  const [tempFontSize, setTempFontSize] = useState(settings.fontSize);
  const [tempHideOtherBookmarks, setTempHideOtherBookmarks] = useState(settings.hideOtherBookmarks);
  const [tempSortGroupsFirst, setTempSortGroupsFirst] = useState(settings.sortGroupsFirst);
  const [tempPinnedIconSize, setTempPinnedIconSize] = useState(settings.pinnedIconSize);

  // Sync temp state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTempFontSize(settings.fontSize);
      setTempHideOtherBookmarks(settings.hideOtherBookmarks);
      setTempSortGroupsFirst(settings.sortGroupsFirst);
      setTempPinnedIconSize(settings.pinnedIconSize);
    }
  }, [isOpen, settings]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleApply = () => {
    onApply({
      fontSize: tempFontSize,
      hideOtherBookmarks: tempHideOtherBookmarks,
      sortGroupsFirst: tempSortGroupsFirst,
      pinnedIconSize: tempPinnedIconSize,
    });
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-56 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">
            Settings
          </h2>
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
                  checked={tempSortGroupsFirst}
                  onChange={(e) => setTempSortGroupsFirst(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Sort tab groups first
              </label>
            </div>
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
  );
}
