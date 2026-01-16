/**
 * MenuBase - Shared components for ContextMenu and DropdownMenu
 */
import
{
  useEffect,
  useRef,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  MouseEvent as ReactMouseEvent
} from 'react';
import clsx from 'clsx';

// --- Item ---
interface ItemProps extends HTMLAttributes<HTMLDivElement>
{
  children: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
}

export const Item = forwardRef<HTMLDivElement, ItemProps>(
  ({ children, className, danger, onSelect, onClick, ...props }, ref) =>
  {
    const handleClick = (e: ReactMouseEvent<HTMLDivElement>) =>
    {
      onClick?.(e);
      onSelect?.();
    };

    return (
      <div
        ref={ref}
        className={clsx(
          "flex items-center w-full px-3 py-1.5 text-left cursor-pointer outline-none",
          "hover:bg-gray-100 dark:hover:bg-gray-700",
          danger
            ? "text-red-500 dark:text-red-400"
            : "text-gray-700 dark:text-gray-200",
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Item.displayName = 'MenuItem';

// --- Separator ---
interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx("h-px my-1 bg-gray-200 dark:bg-gray-700", className)}
      {...props}
    />
  )
);
Separator.displayName = 'MenuSeparator';

// --- Overlay ---
interface OverlayProps
{
  onClose: () => void;
}

export const Overlay = ({ onClose }: OverlayProps) => (
  <div
    className="fixed inset-0 z-40"
    onClick={onClose}
    onContextMenu={(e) =>
    {
      e.preventDefault();
      onClose();
    }}
  />
);

// --- useEscapeKey hook ---
export const useEscapeKey = (isOpen: boolean, onClose: () => void) =>
{
  useEffect(() =>
  {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
};

// --- useViewportAdjust hook ---
interface Position
{
  x: number;
  y: number;
}

export const useViewportAdjust = (
  isOpen: boolean,
  initialPosition: Position,
  menuRef: React.RefObject<HTMLDivElement | null>
): Position =>
{
  const adjustedPosition = useRef<Position>(initialPosition);

  useEffect(() =>
  {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = initialPosition.x;
    let y = initialPosition.y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth)
    {
      x = viewportWidth - rect.width - 8;
    }
    if (x < 0)
    {
      x = 8;
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight)
    {
      y = viewportHeight - rect.height - 8;
    }
    if (y < 0)
    {
      y = 8;
    }

    adjustedPosition.current = { x, y };
  }, [isOpen, initialPosition, menuRef]);

  return adjustedPosition.current;
};

// --- Menu container styling ---
export const menuContainerClass = "fixed z-50 min-w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1";
