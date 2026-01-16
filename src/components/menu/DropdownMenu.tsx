/**
 * DropdownMenu - Left-click dropdown menu that positions below trigger button
 */
import
{
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
import { useFontSize } from '../../contexts/FontSizeContext';
import { Item as BaseItem, Separator, Overlay, useEscapeKey, menuContainerClass } from './MenuBase';

// Re-export Separator (Item is wrapped below to add close behavior)
export { Separator };

// --- Context ---
interface DropdownMenuState
{
  isOpen: boolean;
  triggerRect: DOMRect | null;
  open: (rect: DOMRect) => void;
  close: () => void;
}

const DropdownMenuContext = createContext<DropdownMenuState | null>(null);

const useDropdownMenuState = () =>
{
  const context = useContext(DropdownMenuContext);
  if (!context)
  {
    throw new Error('DropdownMenu components must be used within DropdownMenu.Root');
  }
  return context;
};

// --- Root ---
interface RootProps
{
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchorRef?: React.RefObject<HTMLElement | null>;  // For external trigger positioning
}

export const Root = ({ children, open: controlledOpen, onOpenChange, anchorRef }: RootProps) =>
{
  const [internalOpen, setInternalOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  // Update triggerRect from anchorRef when opening in controlled mode
  useEffect(() =>
  {
    if (isOpen && anchorRef?.current && !triggerRect)
    {
      setTriggerRect(anchorRef.current.getBoundingClientRect());
    }
    if (!isOpen)
    {
      setTriggerRect(null);
    }
  }, [isOpen, anchorRef, triggerRect]);

  const open = useCallback((rect: DOMRect) =>
  {
    setTriggerRect(rect);
    if (isControlled)
    {
      onOpenChange?.(true);
    }
    else
    {
      setInternalOpen(true);
    }
  }, [isControlled, onOpenChange]);

  const close = useCallback(() =>
  {
    if (isControlled)
    {
      onOpenChange?.(false);
    }
    else
    {
      setInternalOpen(false);
    }
  }, [isControlled, onOpenChange]);

  return (
    <DropdownMenuContext.Provider value={{ isOpen, triggerRect, open, close }}>
      {children}
    </DropdownMenuContext.Provider>
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
  const { isOpen, open, close } = useDropdownMenuState();
  const ref = useRef<HTMLElement>(null);

  const handleClick = useCallback((e: ReactMouseEvent) =>
  {
    e.stopPropagation();
    if (isOpen)
    {
      close();
    }
    else
    {
      const element = ref.current;
      if (element)
      {
        open(element.getBoundingClientRect());
      }
    }
  }, [isOpen, open, close]);

  if (asChild && isValidElement(children))
  {
    const child = children as ReactElement<{
      onClick?: (e: ReactMouseEvent) => void;
      ref?: React.Ref<HTMLElement>;
    }>;
    const originalOnClick = child.props.onClick;

    return cloneElement(child, {
      ref: ref as React.Ref<HTMLElement>,
      onClick: (e: ReactMouseEvent) =>
      {
        handleClick(e);
        originalOnClick?.(e);
      }
    });
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      onClick={handleClick}
      type="button"
    >
      {children}
    </button>
  );
};

// --- Content ---
interface ContentProps extends HTMLAttributes<HTMLDivElement>
{
  children: ReactNode;
  align?: 'start' | 'end';  // align to left or right edge of trigger
}

export const Content = forwardRef<HTMLDivElement, ContentProps>(
  ({ children, className, align = 'start', style, ...props }, ref) =>
  {
    const { isOpen, triggerRect, close } = useDropdownMenuState();
    const fontSize = useFontSize();
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    // Use shared escape key handler
    useEscapeKey(isOpen, close);

    // Position below trigger, adjust to stay in viewport
    useEffect(() =>
    {
      if (!isOpen || !triggerRect || !menuRef.current) return;

      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Start position: below trigger, aligned to start or end
      let x = align === 'start' ? triggerRect.left : triggerRect.right - rect.width;
      let y = triggerRect.bottom + 4;

      // Adjust horizontal position to stay in viewport
      if (x + rect.width > viewportWidth)
      {
        x = viewportWidth - rect.width - 8;
      }
      if (x < 0)
      {
        x = 8;
      }

      // If not enough space below, position above trigger
      if (y + rect.height > viewportHeight)
      {
        y = triggerRect.top - rect.height - 4;
      }
      if (y < 0)
      {
        y = 8;
      }

      setPosition({ x, y });
    }, [isOpen, triggerRect, align]);

    if (!isOpen) return null;

    return createPortal(
      <>
        <Overlay onClose={close} />
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
          className={clsx(menuContainerClass, className)}
          style={{
            left: position.x,
            top: position.y,
            fontSize: `${fontSize}px`,
            ...style
          }}
          {...props}
        >
          {children}
        </div>
      </>,
      document.body
    );
  }
);
Content.displayName = 'DropdownMenu.Content';

// --- Item (wraps BaseItem to add close behavior) ---
interface ItemProps extends HTMLAttributes<HTMLDivElement>
{
  children: ReactNode;
  danger?: boolean;
  onSelect?: () => void;
}

export const Item = forwardRef<HTMLDivElement, ItemProps>(
  ({ onSelect, ...props }, ref) =>
  {
    const { close } = useDropdownMenuState();

    const handleSelect = useCallback(() =>
    {
      onSelect?.();
      close();
    }, [onSelect, close]);

    return <BaseItem ref={ref} onSelect={handleSelect} {...props} />;
  }
);
Item.displayName = 'DropdownMenu.Item';
