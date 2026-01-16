import { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { GROUP_COLORS, GROUP_COLOR_OPTIONS, COLOR_CIRCLE_SIZE } from '../utils/groupColors';

export interface AddToGroupDialogProps
{
  isOpen: boolean;
  tabId: number | null;
  tabGroups: chrome.tabGroups.TabGroup[];
  currentGroupId?: number;
  onAddToGroup: (tabId: number, groupId: number) => void;
  onCreateGroup: (tabId: number, title: string, color: chrome.tabGroups.ColorEnum) => void;
  onClose: () => void;
}

export const AddToGroupDialog = ({
  isOpen,
  tabId,
  tabGroups,
  currentGroupId,
  onAddToGroup,
  onCreateGroup,
  onClose
}: AddToGroupDialogProps) =>
{
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<chrome.tabGroups.ColorEnum>('blue');

  // Filter out current group
  const availableGroups = tabGroups.filter(g => g.id !== currentGroupId);

  // Reset state when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      setIsCreatingNew(false);
      setNewGroupName('');
      setNewGroupColor('blue');
    }
  }, [isOpen]);

  if (tabId === null) return null;

  const handleSelectGroup = (groupId: number) =>
  {
    onAddToGroup(tabId, groupId);
    onClose();
  };

  const handleCreateGroup = () =>
  {
    if (newGroupName.trim())
    {
      onCreateGroup(tabId, newGroupName.trim(), newGroupColor);
      onClose();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isCreatingNew ? 'Create New Group' : 'Add to Group'}
    >
      {isCreatingNew ? (
        <div className="p-3 space-y-3">
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              Group Name
            </label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Enter group name"
              autoFocus
              className="w-full px-2 py-1.5 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              onKeyDown={(e) =>
              {
                if (e.key === 'Enter' && newGroupName.trim())
                {
                  handleCreateGroup();
                }
              }}
            />
          </div>
          <div>
            <label className="block font-medium mb-1 text-gray-700 dark:text-gray-300">
              Color
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {GROUP_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewGroupColor(opt.value)}
                  className={clsx(
                    COLOR_CIRCLE_SIZE,
                    "rounded-full border-2 transition-transform hover:scale-110",
                    opt.dot,
                    newGroupColor === opt.value
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
              onClick={() => setIsCreatingNew(false)}
              className="px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Back
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-md"
            >
              Create
            </button>
          </div>
        </div>
      ) : (
        <div className="py-1 max-h-64 overflow-y-auto">
          {/* Existing groups */}
          {availableGroups.map((group) =>
          {
            const colorStyle = GROUP_COLORS[group.color] || GROUP_COLORS.grey;
            return (
              <button
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
              >
                <span className={clsx("w-3 h-3 rounded-full flex-shrink-0", colorStyle.dot)} />
                <span className="truncate">{group.title || 'Unnamed Group'}</span>
              </button>
            );
          })}

          {/* Create new group option at bottom */}
          <button
            onClick={() => setIsCreatingNew(true)}
            className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-blue-600 dark:text-blue-400"
          >
            <Plus size={16} />
            <span>Create New Group</span>
          </button>
        </div>
      )}
    </Dialog>
  );
};
