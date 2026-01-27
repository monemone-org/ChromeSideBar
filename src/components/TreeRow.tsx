import React, { forwardRef } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { DraggableAttributes } from '@dnd-kit/core';
import { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { LAYOUT, getIndentStyle } from '../utils/indent';

// Shared ring style for hover and highlighted states
const RING_HIGHLIGHT = 'ring-2 ring-inset ring-gray-300 dark:ring-gray-600';
const RING_HIGHLIGHT_HOVER = 'hover:ring-2 hover:ring-inset hover:ring-gray-300 dark:hover:ring-gray-600';

export interface TreeRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  depth: number;
  title: React.ReactNode;
  tooltip?: string;             // Native HTML title attribute for hover tooltip
  icon?: React.ReactNode;
  isExpanded?: boolean;
  hasChildren?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
  // onClick, onContextMenu, onPointerEnter, onPointerLeave are covered by HTMLAttributes but we can keep specific overrides if needed
  isActive?: boolean;
  isSelected?: boolean;     // Multi-selection highlight (same visual as isActive)
  isHighlighted?: boolean;  // Show ring highlight (e.g. during context menu)
  isDragging?: boolean;
  disableHoverBorder?: boolean; // Disable hover ring (e.g. during drag operations)
  // Slots for extra content
  leadingIndicator?: React.ReactNode; // Fixed at absolute left edge, before indent (e.g. speaker icon)
  indicators?: React.ReactNode; // Content to the left of the title - CAREFUL: this will shift title
  actions?: React.ReactNode;    // Content to the right of the title (hover actions)
  badges?: React.ReactNode;     // Content after the title (e.g. tab count, pin)
  children?: React.ReactNode;   // For absolute overlays like drop indicators
  hideIcon?: boolean;           // Hide the icon slot entirely (removes space)

  // DND props
  dndAttributes?: DraggableAttributes;
  dndListeners?: SyntheticListenerMap;

  // Custom styles
  // className and style are in HTMLAttributes
}

export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(({
  depth,
  title,
  tooltip,
  icon,
  isExpanded,
  hasChildren,
  onToggle,
  // Removed explicit handlers that are now in ...props or handled specifically if needed
  isActive,
  isSelected,
  isHighlighted,
  isDragging,
  disableHoverBorder,
  leadingIndicator,
  indicators,
  actions,
  badges,
  children,
  hideIcon,
  dndAttributes,
  dndListeners,
  className,
  style,
  ...props // Capture remaining props (including those from ContextMenu.Trigger)
}, ref) => {
  return (
    <div
      ref={ref}
      {...props} // Spread standard HTML attributes and injected props first
      {...dndAttributes}
      {...dndListeners}
      title={tooltip}
      className={clsx(
        'group flex items-center h-7 rounded-md cursor-default select-none transition-colors relative pr-2 outline-none',
        // Selection style (brighter blue background)
        isSelected && 'bg-blue-200 dark:bg-blue-800/60 text-blue-800 dark:text-blue-50',
        // Active tab style (border ring, visually distinct from selection)
        isActive && !isSelected && 'ring-2 ring-inset ring-blue-400 dark:ring-blue-600 text-gray-700 dark:text-gray-200',
        // Default style (ring hover) - only when neither active nor selected, and hover not disabled
        !isActive && !isSelected && !disableHoverBorder && `${RING_HIGHLIGHT_HOVER} text-gray-700 dark:text-gray-200`,
        !isActive && !isSelected && disableHoverBorder && 'text-gray-700 dark:text-gray-200',
        // Highlight ring (e.g. during context menu)
        !isActive && !isSelected && isHighlighted && RING_HIGHLIGHT,
        isDragging && 'opacity-50',
        className
      )}
      style={{
        ...getIndentStyle(depth),
        ...style,
      }}
    >
      {/* Drop Indicators & Overlays */}
      {children}

      {/* Leading Indicator - Fixed at absolute left edge (e.g. speaker icon) */}
      {leadingIndicator && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center"
            style={{ width: LAYOUT.CHEVRON_WIDTH }}
        >
          {leadingIndicator}
        </div>
      )}

      {/* Chevron Slot - Fixed Width */}
      <div
        className="flex items-center justify-center shrink-0 h-full"
        style={{ width: LAYOUT.CHEVRON_WIDTH }}
      >
        {hasChildren && (
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
            className="w-full h-full flex items-center justify-center border-0 bg-transparent cursor-pointer hover:text-gray-900 dark:hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.(e);
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Icon Slot - Fixed Width (hidden when hideIcon is true) */}
      {hideIcon ? (
        <div className="shrink-0" style={{ width: 0 }} />
      ) : (
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: LAYOUT.ICON_WIDTH, marginRight: LAYOUT.GAP }}
        >
          {icon}
        </div>
      )}

      {/* Indicators (Left of Title) - Optional */}
      {/* Use sparingly as this shifts alignment */}
      {indicators && (
        <div className="flex items-center gap-1 shrink-0 mr-1">
          {indicators}
        </div>
      )}

      {/* Title */}
      <div className={clsx("flex-1 truncate min-w-0", isActive && "font-semibold")}>
        {title}
      </div>

      {/* Badges (Right of Title, visible always) */}
      {badges && (
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {badges}
        </div>
      )}

      {/* Actions (Absolute positioned, overlays on right side) */}
      {actions && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center pl-2">
          {actions}
        </div>
      )}
    </div>
  );
});

TreeRow.displayName = 'TreeRow';
