/**
 * UnifiedDragOverlay - Renders drag overlay based on current drag item type
 *
 * This component reads from UnifiedDndContext and renders the appropriate
 * overlay for pins, bookmarks, tabs, tab groups, or spaces.
 */

import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { Globe, Folder, SquareStack } from 'lucide-react';
import clsx from 'clsx';
import { useUnifiedDndOptional } from '../contexts/UnifiedDndContext';
import { DragData, DragFormat, PinData, BookmarkData, TabData, TabGroupData, SpaceData, getPrimaryItem } from '../types/dragDrop';
import { TreeRow } from './TreeRow';
import { GROUP_COLORS } from '../utils/groupColors';
import { getFaviconUrl } from '../utils/favicon';
import { PinnedIconVisual } from './PinnedIcon';

interface UnifiedDragOverlayProps
{
  // Optional custom overlay rendering per format
  renderPin?: (data: PinData) => React.ReactNode;
  renderBookmark?: (data: BookmarkData) => React.ReactNode;
  renderTab?: (data: TabData) => React.ReactNode;
  renderTabGroup?: (data: TabGroupData) => React.ReactNode;
  renderSpace?: (data: SpaceData) => React.ReactNode;

  // Multi-drag overlay props
  multiDragCount?: number;

  // Offset modifier (for positioning below cursor)
  yOffset?: number;

  // Pinned icon size (for matching PinnedIcon appearance)
  pinnedIconSize?: number;
}

// Pin overlay - matches PinnedIcon appearance
const PinOverlay: React.FC<{ data: PinData; iconSize: number }> = ({ data, iconSize }) => (
  <PinnedIconVisual
    favicon={data.faviconUrl}
    iconSize={iconSize}
    title={data.title}
    className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 pointer-events-none"
  />
);

// Bookmark overlay - uses TreeRow style
const BookmarkOverlay: React.FC<{ data: BookmarkData }> = ({ data }) =>
{
  const icon = data.isFolder ? (
    <Folder size={16} className="text-gray-500" />
  ) : data.url ? (
    <img src={getFaviconUrl(data.url)} alt="" className="w-4 h-4" />
  ) : (
    <Globe size={16} className="text-gray-500" />
  );

  return (
    <div className="w-[280px]">
      <TreeRow
        depth={data.depth ?? 0}
        title={data.title}
        icon={icon}
        hasChildren={data.isFolder}
        className="pointer-events-none bg-blue-100 dark:bg-blue-900/50 rounded"
      />
    </div>
  );
};

// Tab overlay - uses TreeRow style
const TabOverlay: React.FC<{ data: TabData }> = ({ data }) =>
{
  // For tabs, we need to get favicon from URL
  const icon = data.url ? (
    <img src={getFaviconUrl(data.url)} alt="" className="w-4 h-4 flex-shrink-0" />
  ) : (
    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
  );

  return (
    <div className="w-[280px]">
      <TreeRow
        depth={0}
        title={data.title}
        icon={icon}
        hasChildren={false}
        className="pointer-events-none bg-blue-100 dark:bg-blue-900/50 rounded"
      />
    </div>
  );
};

// Tab group overlay - styled badge
const TabGroupOverlay: React.FC<{ data: TabGroupData }> = ({ data }) =>
{
  const colorStyle = GROUP_COLORS[data.color || 'grey'] || GROUP_COLORS.grey;

  const titleComponent = (
    <div className="flex items-center">
      <span className={clsx(
        "px-2 py-0.5 rounded-full font-medium text-white dark:text-black flex items-center gap-1 w-fit",
        colorStyle.badge
      )}>
        <SquareStack size={12} />
        {data.title || 'Unnamed Group'}
      </span>
      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
        ({data.tabCount} {data.tabCount === 1 ? 'tab' : 'tabs'})
      </span>
    </div>
  );

  return (
    <div className="w-[280px]">
      <TreeRow
        depth={0}
        title={titleComponent}
        hideIcon
        hasChildren={true}
        className="pointer-events-none"
      />
    </div>
  );
};

// Space overlay - space icon button style
const SpaceOverlay: React.FC<{ data: SpaceData }> = ({ data }) =>
{
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 pointer-events-none">
      <div className="w-7 h-7 rounded flex items-center justify-center bg-gray-200 dark:bg-gray-700">
        {/* Default icon - in full implementation would get space's actual icon */}
        <SquareStack size={14} />
      </div>
      <span className="text-sm font-medium">{data.name}</span>
    </div>
  );
};

// Multi-item overlay wrapper - shows stacked effect
const MultiDragWrapper: React.FC<{
  count: number;
  children: React.ReactNode;
}> = ({ count, children }) =>
{
  const badges = (
    <span className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded-full">
      {count} items
    </span>
  );

  return (
    <div className="relative pointer-events-none">
      {/* Stacked background layers */}
      {count > 2 && (
        <div
          className="absolute w-full h-7 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800"
          style={{ top: 12, left: 12 }}
        />
      )}
      {count > 1 && (
        <div
          className="absolute w-full h-7 bg-blue-100 dark:bg-blue-900/70 rounded border border-blue-200 dark:border-blue-700"
          style={{ top: 6, left: 6 }}
        />
      )}
      {/* Front content with badge */}
      <div className="relative bg-blue-100 dark:bg-blue-900/50 rounded border border-blue-300 dark:border-blue-600">
        {children}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {badges}
        </div>
      </div>
    </div>
  );
};

/**
 * Determine which overlay to render based on the primary item's formats.
 * We render the most specific format available (first in formats array).
 */
const getOverlayForDragData = (
  activeDragData: DragData,
  pinnedIconSize: number,
  renderPin?: (data: PinData) => React.ReactNode,
  renderBookmark?: (data: BookmarkData) => React.ReactNode,
  renderTab?: (data: TabData) => React.ReactNode,
  renderTabGroup?: (data: TabGroupData) => React.ReactNode,
  renderSpace?: (data: SpaceData) => React.ReactNode
): React.ReactNode =>
{
  const primaryItem = getPrimaryItem(activeDragData);
  if (!primaryItem) return null;

  // Check formats in order of specificity (first format is most specific)
  for (const format of primaryItem.formats)
  {
    switch (format)
    {
      case DragFormat.PIN:
        if (primaryItem.pin)
        {
          return renderPin
            ? renderPin(primaryItem.pin)
            : <PinOverlay data={primaryItem.pin} iconSize={pinnedIconSize} />;
        }
        break;

      case DragFormat.BOOKMARK:
        if (primaryItem.bookmark)
        {
          return renderBookmark
            ? renderBookmark(primaryItem.bookmark)
            : <BookmarkOverlay data={primaryItem.bookmark} />;
        }
        break;

      case DragFormat.TAB:
        if (primaryItem.tab)
        {
          return renderTab
            ? renderTab(primaryItem.tab)
            : <TabOverlay data={primaryItem.tab} />;
        }
        break;

      case DragFormat.TAB_GROUP:
        if (primaryItem.tabGroup)
        {
          return renderTabGroup
            ? renderTabGroup(primaryItem.tabGroup)
            : <TabGroupOverlay data={primaryItem.tabGroup} />;
        }
        break;

      case DragFormat.SPACE:
        if (primaryItem.space)
        {
          return renderSpace
            ? renderSpace(primaryItem.space)
            : <SpaceOverlay data={primaryItem.space} />;
        }
        break;

      case DragFormat.URL:
        // URL doesn't have its own overlay - skip and try next format
        break;
    }
  }

  return null;
};

// Default pinned icon size (matches default in App.tsx)
const DEFAULT_PINNED_ICON_SIZE = 22;

export const UnifiedDragOverlay: React.FC<UnifiedDragOverlayProps> = ({
  renderPin,
  renderBookmark,
  renderTab,
  renderTabGroup,
  renderSpace,
  multiDragCount,
  yOffset = 0,
  pinnedIconSize = DEFAULT_PINNED_ICON_SIZE,
}) =>
{
  const dnd = useUnifiedDndOptional();

  if (!dnd || !dnd.activeDragData)
  {
    return <DragOverlay />;
  }

  const { activeDragData, isMultiDrag, multiDragCount: contextMultiDragCount } = dnd;
  const count = multiDragCount ?? contextMultiDragCount;

  // Render appropriate overlay based on available formats
  let overlayContent = getOverlayForDragData(
    activeDragData,
    pinnedIconSize,
    renderPin,
    renderBookmark,
    renderTab,
    renderTabGroup,
    renderSpace
  );

  // Wrap in multi-drag container if needed
  if (isMultiDrag && count > 1 && overlayContent)
  {
    overlayContent = (
      <MultiDragWrapper count={count}>
        {overlayContent}
      </MultiDragWrapper>
    );
  }

  return (
    <DragOverlay
      dropAnimation={null}
      modifiers={yOffset > 0 ? [
        ({ transform }) => ({ ...transform, y: transform.y + yOffset }),
      ] : undefined}
    >
      {overlayContent}
    </DragOverlay>
  );
};

export default UnifiedDragOverlay;
