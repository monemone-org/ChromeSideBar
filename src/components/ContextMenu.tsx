import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { forwardRef, ComponentPropsWithoutRef } from 'react';

// Re-export Root and Trigger as-is
export const Root = ContextMenuPrimitive.Root;
export const Trigger = ContextMenuPrimitive.Trigger;
export const Portal = ContextMenuPrimitive.Portal;
export const Sub = ContextMenuPrimitive.Sub;

// Styled Content
export const Content = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Content
    ref={ref}
    className={clsx(
      "z-50 min-w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1",
      "animate-in fade-in-0 zoom-in-95",
      className
    )}
    {...props}
  />
));
Content.displayName = 'ContextMenu.Content';

// Styled Item
export const Item = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { danger?: boolean }
>(({ className, danger, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={clsx(
      "flex items-center w-full px-3 py-1.5 text-left cursor-pointer outline-none",
      "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700",
      danger
        ? "text-red-500 dark:text-red-400"
        : "text-gray-700 dark:text-gray-200",
      className
    )}
    {...props}
  />
));
Item.displayName = 'ContextMenu.Item';

// Styled SubTrigger
export const SubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={clsx(
      "w-full px-3 py-1.5 text-left cursor-pointer outline-none flex items-center justify-between",
      "text-gray-700 dark:text-gray-200",
      "data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700",
      "data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-gray-700",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight size={14} />
  </ContextMenuPrimitive.SubTrigger>
));
SubTrigger.displayName = 'ContextMenu.SubTrigger';

// Styled SubContent
export const SubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={clsx(
      "z-50 min-w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1",
      "animate-in fade-in-0 zoom-in-95",
      className
    )}
    sideOffset={4}
    {...props}
  />
));
SubContent.displayName = 'ContextMenu.SubContent';

// Separator
export const Separator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={clsx("h-px my-1 bg-gray-200 dark:bg-gray-700", className)}
    {...props}
  />
));
Separator.displayName = 'ContextMenu.Separator';
