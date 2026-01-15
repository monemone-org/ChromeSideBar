import React, { ReactNode, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import * as ContextMenu from './ContextMenu';
import { getIndentPadding } from '../utils/indent';

interface SectionHeaderProps
{
  label: string;
  icon?: ReactNode;
  menuContent: ReactNode;
  menuTitle?: string;
  fontSize?: number;  // Optional custom font size in px
  showMenuButton?: boolean;  // Show "..." button (default true). When false, use right-click for menu.
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  icon,
  menuContent,
  menuTitle = 'Options',
  fontSize,
  showMenuButton = true,
}) =>
{
  const menuJustClosedRef = useRef(false);

  // Handler for menu button mousedown - detect if menu is open before it closes
  const handleMenuButtonMouseDown = (
    _e: React.MouseEvent<HTMLButtonElement>,
    isMenuOpen: boolean
  ) =>
  {
    if (isMenuOpen)
    {
      menuJustClosedRef.current = true;
    }
  };

  // Handler for menu button click
  const handleMenuButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    openMenu: (x: number, y: number) => void
  ) =>
  {
    e.stopPropagation();
    // If menu was just closed by mousedown, don't reopen
    if (menuJustClosedRef.current)
    {
      menuJustClosedRef.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    openMenu(rect.right, rect.bottom);
  };

  const headerContent = (
    <div
      className="group relative flex items-center py-1 rounded select-none outline-none border-2 border-transparent text-gray-500 dark:text-gray-400"
      style={{
        paddingLeft: `${getIndentPadding(0)}px`,
        paddingRight: '8px',
        ...(fontSize ? { fontSize: `${fontSize}px` } : {})
      }}
    >
      {icon && (
        <span className="flex-shrink-0 mr-1.5">
          {icon}
        </span>
      )}
      <span className="flex-1">
        {label}
      </span>
    </div>
  );

  // When showMenuButton is false, use right-click (ContextMenu.Trigger)
  if (!showMenuButton)
  {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          {headerContent}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            {menuContent}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  }

  // When showMenuButton is true, use button click
  return (
    <ContextMenu.Root>
      {({ open: openMenu, isOpen: isMenuOpen }) => (
        <>
          <div
            className="group relative flex items-center py-1 rounded select-none outline-none border-2 border-transparent text-gray-500 dark:text-gray-400"
            style={{
              paddingLeft: `${getIndentPadding(0)}px`,
              paddingRight: '8px',
              ...(fontSize ? { fontSize: `${fontSize}px` } : {})
            }}
          >
            {icon && (
              <span className="flex-shrink-0 mr-1.5">
                {icon}
              </span>
            )}
            <span className="flex-1">
              {label}
            </span>
            <button
              onMouseDown={(e) => handleMenuButtonMouseDown(e, isMenuOpen)}
              onClick={(e) => handleMenuButtonClick(e, openMenu)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title={menuTitle}
              aria-label={menuTitle}
            >
              <MoreHorizontal size={Math.max(fontSize ?? 14, 14)} />
            </button>
          </div>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              {menuContent}
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </>
      )}
    </ContextMenu.Root>
  );
};
