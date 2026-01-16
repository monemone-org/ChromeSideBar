import { useState, useRef, useEffect } from 'react';
import { Dialog } from './Dialog';

export interface RenameGroupDialogProps
{
  isOpen: boolean;
  group: chrome.tabGroups.TabGroup | null;
  onRename: (groupId: number, title: string) => void;
  onClose: () => void;
}

export const RenameGroupDialog = ({
  isOpen,
  group,
  onRename,
  onClose
}: RenameGroupDialogProps) =>
{
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state and focus input when dialog opens
  useEffect(() =>
  {
    if (isOpen && group)
    {
      setNewName(group.title || '');
      // Focus after a short delay to ensure portal is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, group]);

  if (!group) return null;

  const handleSave = () =>
  {
    onRename(group.id, newName.trim());
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Rename Group">
      <div className="p-3 space-y-3">
        <div>
          <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
            Group Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter group name"
            className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) =>
            {
              if (e.key === 'Enter')
              {
                handleSave();
              }
            }}
          />
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
