import React, { useRef } from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { SpaceIcon } from './SpaceIcon';
import { useSpacesContext, Space } from '../contexts/SpacesContext';

interface SpaceBarProps
{
  onCreateSpace: () => void;
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
}

export const SpaceBar: React.FC<SpaceBarProps> = ({
  onCreateSpace,
  onEditSpace,
  onDeleteSpace,
}) =>
{
  const { allSpaces, activeSpaceId, setActiveSpaceId } = useSpacesContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSpaceClick = (spaceId: string) =>
  {
    setActiveSpaceId(spaceId);
    // Tab group is NOT created on space switch
    // It will be created when first tab/bookmark is opened
  };

  const handleDelete = (space: Space) =>
  {
    onDeleteSpace(space);
  };

  return (
    <div className="flex items-stretch border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      {/* Vertical "SPACE" label */}
      <div className="flex items-center justify-center px-0.5 border-r border-gray-200 dark:border-gray-700">
        <span
          className="text-[8px] font-medium text-gray-400 dark:text-gray-500 tracking-wide"
          style={{
            writingMode: 'vertical-lr',
            transform: 'rotate(180deg)',
          }}
        >
          SPACE
        </span>
      </div>

      {/* Horizontal scrollable space icons */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center gap-1 px-1 py-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
        style={{
          scrollbarWidth: 'thin',
        }}
      >
        {allSpaces.map((space) => (
          <SpaceIcon
            key={space.id}
            space={space}
            isActive={space.id === activeSpaceId}
            onClick={() => handleSpaceClick(space.id)}
            onEdit={() => onEditSpace(space)}
            onDelete={() => handleDelete(space)}
            isAllSpace={space.id === 'all'}
          />
        ))}
      </div>

      {/* Fixed "+" button */}
      <div className="flex items-center px-1 border-l border-gray-200 dark:border-gray-700">
        <button
          onClick={onCreateSpace}
          title="Create new space"
          className={clsx(
            "w-7 h-7 rounded flex items-center justify-center",
            "bg-gray-100 dark:bg-gray-700",
            "hover:bg-gray-200 dark:hover:bg-gray-600",
            "text-gray-600 dark:text-gray-300",
            "transition-colors"
          )}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
};
