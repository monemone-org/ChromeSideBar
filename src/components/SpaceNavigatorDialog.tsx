import { useEffect, useCallback, useState, useMemo } from 'react';
import { QuickDismissDialog } from './QuickDismissDialog';
import { useSpacesContext } from '../contexts/SpacesContext';
import { LayoutGrid } from 'lucide-react';
import { getIconUrl } from '../utils/iconify';
import { GROUP_COLORS } from '../utils/groupColors';
import clsx from 'clsx';

export interface SpaceNavigatorDialogProps
{
  isOpen: boolean;
  onClose: () => void;
  // Optional customization
  title?: string;
  hideAllSpace?: boolean;
  excludeSpaceId?: string;
  requireBookmarkFolder?: boolean;
  // Return error message string to keep dialog open and show error, or void/undefined to close
  onSelectSpace?: (spaceId: string) => Promise<string | void> | string | void;
  showCurrentIndicator?: boolean;
}

export const SpaceNavigatorDialog = ({
  isOpen,
  onClose,
  title = 'Navigate to Space',
  hideAllSpace = false,
  excludeSpaceId,
  requireBookmarkFolder = false,
  onSelectSpace,
  showCurrentIndicator = true
}: SpaceNavigatorDialogProps) =>
{
  const { allSpaces, spaces, switchToSpace, activeSpaceId } = useSpacesContext();
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter spaces based on options
  const filteredSpaces = useMemo(() =>
  {
    let result = hideAllSpace ? spaces : allSpaces;
    if (excludeSpaceId)
    {
      result = result.filter(s => s.id !== excludeSpaceId);
    }
    return result;
  }, [allSpaces, spaces, hideAllSpace, excludeSpaceId]);

  // Reset highlighted index and error when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      const currentIndex = filteredSpaces.findIndex(s => s.id === activeSpaceId);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      setErrorMessage(null);
    }
  }, [isOpen, filteredSpaces, activeSpaceId]);

  const handleSelectSpace = useCallback(async (spaceId: string, spaceName: string, isDisabled: boolean) =>
  {
    if (isDisabled)
    {
      setErrorMessage(`"${spaceName}" has no bookmark folder configured`);
      return;
    }

    setErrorMessage(null);
    if (onSelectSpace)
    {
      const error = await onSelectSpace(spaceId);
      if (error)
      {
        setErrorMessage(error);
        return;
      }
    }
    else
    {
      switchToSpace(spaceId);
    }
    onClose();
  }, [switchToSpace, onSelectSpace, onClose]);

  // Handle keyboard navigation
  useEffect(() =>
  {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) =>
    {
      // Number keys 1-9 for quick selection
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9)
      {
        const index = num - 1;
        if (index < filteredSpaces.length)
        {
          e.preventDefault();
          const space = filteredSpaces[index];
          const isDisabled = requireBookmarkFolder && !space.bookmarkFolderPath;
          handleSelectSpace(space.id, space.name, isDisabled);
        }
        return;
      }

      // Arrow keys for navigation
      if (e.key === 'ArrowDown')
      {
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredSpaces.length - 1 ? prev + 1 : 0
        );
      }
      else if (e.key === 'ArrowUp')
      {
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredSpaces.length - 1
        );
      }
      // Enter to select highlighted space
      else if (e.key === 'Enter')
      {
        e.preventDefault();
        const space = filteredSpaces[highlightedIndex];
        if (space)
        {
          const isDisabled = requireBookmarkFolder && !space.bookmarkFolderPath;
          handleSelectSpace(space.id, space.name, isDisabled);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredSpaces, highlightedIndex, requireBookmarkFolder, handleSelectSpace]);

  const renderIcon = (iconName: string, size: number = 16) =>
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

  return (
    <QuickDismissDialog isOpen={isOpen} onClose={onClose} title={title}>
      <div className="py-1">
        {filteredSpaces.length === 0 ? (
          <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
            No spaces available
          </div>
        ) : (
          filteredSpaces.map((space, index) =>
          {
            const colorStyle = GROUP_COLORS[space.color] || GROUP_COLORS.grey;
            const isActive = space.id === activeSpaceId;
            const isHighlighted = index === highlightedIndex;
            const isDisabled = requireBookmarkFolder && !space.bookmarkFolderPath;
            const displayIndex = index + 1;

            return (
              <button
                key={space.id}
                onClick={() => handleSelectSpace(space.id, space.name, isDisabled)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={clsx(
                  "w-full h-7 px-2 text-left flex items-center gap-2",
                  isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700",
                  isHighlighted && !isDisabled && "bg-blue-50 dark:bg-blue-900/30"
                )}
              >
                {/* Number prefix */}
                <span className={clsx(
                  "w-4 font-mono text-xs",
                  isDisabled
                    ? "text-gray-300 dark:text-gray-600"
                    : "text-gray-400 dark:text-gray-500"
                )}>
                  {displayIndex <= 9 ? displayIndex : ''}
                </span>

                {/* Space icon */}
                <span
                  className={clsx(
                    "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                    colorStyle.bg
                  )}
                >
                  <span className={colorStyle.text}>
                    {renderIcon(space.icon, 12)}
                  </span>
                </span>

                {/* Space name */}
                <span className={clsx(
                  "truncate flex-1",
                  isDisabled
                    ? "text-gray-400 dark:text-gray-500 line-through"
                    : "text-gray-700 dark:text-gray-200"
                )}>
                  {space.name}
                </span>

                {/* Status indicator */}
                {isDisabled ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    No folder
                  </span>
                ) : showCurrentIndicator && isActive && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    current
                  </span>
                )}
              </button>
            );
          })
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="px-2 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
            {errorMessage}
          </div>
        )}
      </div>
    </QuickDismissDialog>
  );
};
