import { LayoutGrid } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from './Dialog';
import { Space } from '../contexts/SpacesContext';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIconUrl } from '../utils/iconify';

export interface MoveToSpaceDialogProps<T extends string | number>
{
  isOpen: boolean;
  itemId: T | null;
  spaces: Space[];
  currentSpaceId?: string;
  onMoveToSpace: (itemId: T, spaceId: string) => void;
  onClose: () => void;
  requireBookmarkFolder?: boolean;
}

// Get space icon element - mirrors SpaceIcon.tsx getIcon()
const getSpaceIcon = (iconName: string, size: number = 14): React.ReactNode =>
{
  if (iconName === 'LayoutGrid')
  {
    return <LayoutGrid size={size} />;
  }

  return (
    <img
      src={getIconUrl(iconName)}
      alt={iconName}
      width={size}
      height={size}
      className="dark:invert"
      onError={(e) =>
      {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};

export const MoveToSpaceDialog = <T extends string | number>({
  isOpen,
  itemId,
  spaces,
  currentSpaceId,
  onMoveToSpace,
  onClose,
  requireBookmarkFolder = false
}: MoveToSpaceDialogProps<T>) =>
{
  // Filter out "All" space and current space
  const availableSpaces = spaces.filter(s => s.id !== 'all' && s.id !== currentSpaceId);

  if (itemId === null) return null;

  const handleSelectSpace = (space: Space) =>
  {
    if (requireBookmarkFolder && !space.bookmarkFolderPath) return;
    onMoveToSpace(itemId, space.id);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Move to Space">
      <div className="py-1 max-h-64 overflow-y-auto">
        {availableSpaces.length === 0 ? (
          <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
            No other spaces available
          </div>
        ) : (
          availableSpaces.map((space) =>
          {
            const colorStyle = GROUP_COLORS[space.color] || GROUP_COLORS.grey;
            const isDisabled = requireBookmarkFolder && !space.bookmarkFolderPath;
            return (
              <button
                key={space.id}
                onClick={() => handleSelectSpace(space)}
                disabled={isDisabled}
                className={clsx(
                  "w-full px-3 py-2 text-left flex items-center gap-2",
                  isDisabled
                    ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                <span className={clsx("w-3 h-3 rounded-full flex-shrink-0", colorStyle.dot)} />
                <span className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                  {getSpaceIcon(space.icon, 14)}
                </span>
                <span className="truncate">{space.name}</span>
                {isDisabled && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">No folder</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
};
