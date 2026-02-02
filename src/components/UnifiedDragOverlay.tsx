/**
 * UnifiedDragOverlay - Renders drag overlay based on current drag item type
 *
 * This component reads from UnifiedDndContext and renders the appropriate
 * overlay for pins, bookmarks, tabs, and tab groups.
 * Note: Spaces use useSortable with visible original, so no overlay is needed.
 */

import React from 'react';
import { DragOverlay } from '@dnd-kit/core';
import { Globe, Folder, SquareStack } from 'lucide-react';
import clsx from 'clsx';
import { useUnifiedDndOptional } from '../contexts/UnifiedDndContext';
import { DragData, DragFormat, PinData, BookmarkData, TabData, TabGroupData, getPrimaryItem } from '../types/dragDrop';
import { TreeRow } from './TreeRow';
import { GROUP_COLORS } from '../utils/groupColors';
import { getFaviconUrl } from '../utils/favicon';
import { getIcon } from '../utils/spaceIcons';
import { PinnedIconVisual } from './PinnedIcon';

interface UnifiedDragOverlayProps
{
  // Optional custom overlay rendering per format
  renderPin?: (data: PinData) => React.ReactNode;
  renderBookmark?: (data: BookmarkData) => React.ReactNode;
  renderTab?: (data: TabData) => React.ReactNode;
  renderTabGroup?: (data: TabGroupData) => React.ReactNode;

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
const BookmarkOverlay: React.FC<{ data: BookmarkData; width?: number }> = ({ data, width }) =>
{
  const icon = data.isFolder ? (
    <Folder size={16} className="text-gray-500" />
  ) : data.url ? (
    <img src={getFaviconUrl(data.url)} alt="" className="w-4 h-4" />
  ) : (
    <Globe size={16} className="text-gray-500" />
  );

  return (
    <div style={width ? { width } : undefined} className={width ? undefined : "w-[280px]"}>
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

// Tab overlay - uses TreeRow style, matches TabRow icon rendering
const TabOverlay: React.FC<{ data: TabData; badges?: React.ReactNode; width?: number }> = ({ data, badges, width }) =>
{
  // Match TabRow: use faviconUrl directly, show Globe if not available
  const icon = data.faviconUrl ? (
    <img src={data.faviconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
  ) : (
    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
  );

  return (
    <div style={width ? { width } : undefined} className={width ? undefined : "w-[280px]"}>
      <TreeRow
        depth={0}
        title={data.title}
        icon={icon}
        hasChildren={false}
        className="pointer-events-none bg-blue-100 dark:bg-blue-900/50 rounded"
        badges={badges}
      />
    </div>
  );
};

// Tab group overlay - styled badge
const TabGroupOverlay: React.FC<{ data: TabGroupData; badges?: React.ReactNode; width?: number }> = ({ data, badges, width }) =>
{
  const colorStyle = GROUP_COLORS[data.color || 'grey'] || GROUP_COLORS.grey;

  // Show space icon if group title matches a space, otherwise generic SquareStack
  const iconElement = data.matchedSpaceIcon
    ? getIcon(data.matchedSpaceIcon, 12, true)
    : <SquareStack size={12} />;

  const titleComponent = (
    <div className="flex items-center">
      <span className={clsx(
        "px-2 py-0.5 rounded-full font-medium text-white dark:text-black flex items-center gap-1 w-fit",
        colorStyle.badge
      )}>
        {iconElement}
        {data.title || 'Unnamed Group'}
      </span>
      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
        ({data.tabCount} {data.tabCount === 1 ? 'tab' : 'tabs'})
      </span>
    </div>
  );

  return (
    <div style={width ? { width } : undefined} className={width ? undefined : "w-[280px]"}>
      <TreeRow
        depth={0}
        title={titleComponent}
        hideIcon
        hasChildren={true}
        className="pointer-events-none"
        badges={badges}
      />
    </div>
  );
};

// Multi-item overlay wrapper - shows stacked effect
const MultiDragWrapper: React.FC<{
  count: number;
  width?: number;
  children: React.ReactNode;
}> = ({ count, width, children }) => (
  <div
    className={clsx("relative pointer-events-none", !width && "w-[280px]")}
    style={width ? { width } : undefined}
  >
    {/* Stacked background layers */}
    {count > 2 && (
      <div
        className="absolute w-full h-7 bg-blue-100 dark:bg-blue-900 rounded border border-blue-200 dark:border-blue-800"
        style={{ top: 12, left: 12 }}
      />
    )}
    {count > 1 && (
      <div
        className="absolute w-full h-7 bg-blue-100 dark:bg-blue-900 rounded border border-blue-200 dark:border-blue-700"
        style={{ top: 6, left: 6 }}
      />
    )}
    {/* Front content - badges are passed to overlay components */}
    <div className="relative bg-blue-100 dark:bg-blue-900 rounded border border-blue-300 dark:border-blue-600">
      {children}
    </div>
  </div>
);

// Create badge element for multi-drag
const createMultiDragBadge = (count: number): React.ReactNode => (
  <span className="text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded-full">
    {count} items
  </span>
);

/**
 * Determine which overlay to render based on the primary item's formats.
 * We render the most specific format available (first in formats array).
 */
const getOverlayForDragData = (
  activeDragData: DragData,
  pinnedIconSize: number,
  badges?: React.ReactNode,
  width?: number,
  renderPin?: (data: PinData) => React.ReactNode,
  renderBookmark?: (data: BookmarkData) => React.ReactNode,
  renderTab?: (data: TabData) => React.ReactNode,
  renderTabGroup?: (data: TabGroupData) => React.ReactNode
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
            : <BookmarkOverlay data={primaryItem.bookmark} width={width} />;
        }
        break;

      case DragFormat.TAB:
        if (primaryItem.tab)
        {
          return renderTab
            ? renderTab(primaryItem.tab)
            : <TabOverlay data={primaryItem.tab} badges={badges} width={width} />;
        }
        break;

      case DragFormat.TAB_GROUP:
        if (primaryItem.tabGroup)
        {
          return renderTabGroup
            ? renderTabGroup(primaryItem.tabGroup)
            : <TabGroupOverlay data={primaryItem.tabGroup} badges={badges} width={width} />;
        }
        break;

      case DragFormat.SPACE:
        // Space uses useSortable with visible original - no overlay needed
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

  const { activeDragData, isMultiDrag, multiDragCount: contextMultiDragCount, activeDragWidth } = dnd;
  const count = multiDragCount ?? contextMultiDragCount;

  // Create badges for multi-drag
  const badges = isMultiDrag && count > 1 ? createMultiDragBadge(count) : undefined;

  // Use captured width from drag start, or undefined to fall back to default
  const width = activeDragWidth ?? undefined;

  // Render appropriate overlay based on available formats
  let overlayContent = getOverlayForDragData(
    activeDragData,
    pinnedIconSize,
    badges,
    width,
    renderPin,
    renderBookmark,
    renderTab,
    renderTabGroup
  );

  // Wrap in multi-drag container if needed
  if (isMultiDrag && count > 1 && overlayContent)
  {
    overlayContent = (
      <MultiDragWrapper count={count} width={width}>
        {overlayContent}
      </MultiDragWrapper>
    );
  }

  return (
    <DragOverlay
      dropAnimation={null}
      modifiers={yOffset !== 0 ? [
        ({ transform }) => ({ ...transform, y: transform.y + yOffset }),
      ] : undefined}
    >
      {overlayContent}
    </DragOverlay>
  );
};

export default UnifiedDragOverlay;
