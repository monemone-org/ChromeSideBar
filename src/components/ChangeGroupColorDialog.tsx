import { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import clsx from 'clsx';
import { GROUP_COLOR_OPTIONS, COLOR_CIRCLE_SIZE } from '../utils/groupColors';

export interface ChangeGroupColorDialogProps
{
  isOpen: boolean;
  group: chrome.tabGroups.TabGroup | null;
  onChangeColor: (groupId: number, color: chrome.tabGroups.ColorEnum) => void;
  onClose: () => void;
}

export const ChangeGroupColorDialog = ({
  isOpen,
  group,
  onChangeColor,
  onClose
}: ChangeGroupColorDialogProps) =>
{
  const [selectedColor, setSelectedColor] = useState<chrome.tabGroups.ColorEnum>('blue');

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen && group)
    {
      setSelectedColor(group.color);
    }
  }, [isOpen, group]);

  if (!group) return null;

  const handleSave = () =>
  {
    onChangeColor(group.id, selectedColor);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Change Group Color">
      <div className="p-3 space-y-3">
        <div>
          <label className="block font-medium mb-2 text-gray-700 dark:text-gray-300">
            Select Color
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {GROUP_COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedColor(opt.value)}
                className={clsx(
                  COLOR_CIRCLE_SIZE,
                  "rounded-full border-2 transition-transform hover:scale-110",
                  opt.dot,
                  selectedColor === opt.value
                    ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800"
                    : "border-transparent"
                )}
                title={opt.value}
                aria-label={`Select ${opt.value} color`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
};
