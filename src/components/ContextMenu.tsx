import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  cloneElement,
  isValidElement,
  ReactNode,
  ReactElement,
  MouseEvent as ReactMouseEvent,
  forwardRef,
  HTMLAttributes
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useFontSize } from '../contexts/FontSizeContext';

// --- Context ---
interface ContextMenuState
{
  isOpen: boolean;
  position: { x: number; y: number };
  open: (x: number, y: number) => void;
  close: () => void;
}

const ContextMenuContext = createContext<ContextMenuState | null>(null);

const useContextMenuState = () =>
{
  const context = useContext(ContextMenuContext);
  if (!context)
  {
    throw new Error('ContextMenu components must be used within ContextMenu.Root');
  }
  return context;
};

// --- Root ---
interface RootRenderProps
{
  isOpen: boolean;
  open: (x: number, y: number) => void;
  close: () => void;
}

interface RootProps
{
  children: ReactNode | ((props: RootRenderProps) => ReactNode);
}

export const Root = ({ children }: RootProps) =>
{
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const open = useCallback((x: number, y: number) =>
  {
    setPosition({ x, y });
    setIsOpen(true);
  }, []);

  const close = useCallback(() =>
  {
    setIsOpen(false);
  }, []);

  const renderProps: RootRenderProps = { isOpen, open, close };

  return (
    <ContextMenuContext.Provider value={{ isOpen, position, open, close }}>
      {typeof children === 'function' ? children(renderProps) : children}
    </ContextMenuContext.Provider>
  );
};

// --- Trigger ---
interface TriggerProps
{
  children: ReactNode;
  asChild?: boolean;
}

export const Trigger = ({ children, asChild }: TriggerProps) =>
{
  const { open } = useContextMenuState();

  const handleContextMenu = (e: ReactMouseEvent) =>
  {
    e.preventDefault();
    // Focus window first to ensure events work (Chrome extension sidebar fix)
    window.focus();
    open(e.clientX, e.clientY);
  };

  if (asChild && isValidElement(children))
  {
    // Clone the child and add onContextMenu handler
    const child = children as ReactElement<{ onContextMenu?: (e: ReactMouseEvent) => void }>;
    const originalOnContextMenu = child.props.onContextMenu;

    return cloneElement(child, {
      onContextMenu: (e: ReactMouseEvent) =>
      {
        handleContextMenu(e);
        originalOnContextMenu?.(e);
      }
    });
  }

  return (
    <span onContextMenu={handleContextMenu}>
      {children}
    </span>
  );
};

// --- Portal ---
interface PortalProps
{
  children: ReactNode;
}

export const Portal = ({ children }: PortalProps) =>
{
  const { isOpen } = useContextMenuState();

  if (!isOpen) return null;

  return createPortal(children, document.body);
};

// --- Content ---
interface ContentProps extends HTMLAttributes<HTMLDivElement>
{
  children: ReactNode;
}

export const Content = forwardRef<HTMLDivElement, ContentProps>(
  ({ children, className, style, ...props }, ref) =>
  {
    const { isOpen, position, close } = useContextMenuState();
    const fontSize = useFontSize();
    const menuRef = useRef<HTMLDivElement | null>(null);

    // Handle click outside and escape key
    useEffect(() =>
    {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) =>
      {
        if (menuRef.current && !menuRef.current.contains(e.target as Node))
        {
          close();
        }
      };

      const handleEscape = (e: KeyboardEvent) =>
      {
        if (e.key === 'Escape')
        {
          close();
        }
      };

      // Use setTimeout to avoid closing immediately from the same click
      const timeoutId = setTimeout(() =>
      {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);

      document.addEventListener('keydown', handleEscape);

      return () =>
      {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [isOpen, close]);

    // Adjust position to keep menu within viewport
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    useEffect(() =>
    {
      if (!isOpen || !menuRef.current) return;

      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust horizontal position
      if (x + rect.width > viewportWidth)
      {
        x = viewportWidth - rect.width - 8;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight)
      {
        y = viewportHeight - rect.height - 8;
      }

      setAdjustedPosition({ x, y });
    }, [isOpen, position]);

    if (!isOpen) return null;

    return (
      <div
        ref={(node) =>
        {
          menuRef.current = node;
          if (typeof ref === 'function')
          {
            ref(node);
          }
          else if (ref)
          {
            ref.current = node;
          }
        }}
        className={clsx(
          "fixed z-50 min-w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1",
          className
        )}
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          fontSize: `${fontSize}px`,
          ...style
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Content.displayName = 'ContextMenu.Content';

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
    const { close } = useContextMenuState();

    const handleClick = (e: ReactMouseEvent<HTMLDivElement>) =>
    {
      onClick?.(e);
      onSelect?.();
      close();
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
Item.displayName = 'ContextMenu.Item';

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
Separator.displayName = 'ContextMenu.Separator';