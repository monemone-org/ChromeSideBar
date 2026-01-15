import { LayoutGrid } from 'lucide-react';
import clsx from 'clsx';
import { Dialog } from './Dialog';
import { Space } from '../contexts/SpacesContext';
import { GROUP_COLORS } from '../utils/groupColors';
import { getIconUrl } from '../utils/iconify';

export interface MoveToSpaceDialogProps
{
  isOpen: boolean;
  tabId: number | null;
  spaces: Space[];
  currentSpaceId?: string;
  onMoveToSpace: (tabId: number, spaceId: string) => void;
  onClose: () => void;
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

export const MoveToSpaceDialog = ({
  isOpen,
  tabId,
  spaces,
  currentSpaceId,
  onMoveToSpace,
  onClose
}: MoveToSpaceDialogProps) =>
{
  // Filter out "All" space and current space
  const availableSpaces = spaces.filter(s => s.id !== 'all' && s.id !== currentSpaceId);

  if (tabId === null) return null;

  const handleSelectSpace = (spaceId: string) =>
  {
    onMoveToSpace(tabId, spaceId);
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
            return (
              <button
                key={space.id}
                onClick={() => handleSelectSpace(space.id)}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-200"
              >
                <span className={clsx("w-3 h-3 rounded-full flex-shrink-0", colorStyle.dot)} />
                <span className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                  {getSpaceIcon(space.icon, 14)}
                </span>
                <span className="truncate">{space.name}</span>
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
};
