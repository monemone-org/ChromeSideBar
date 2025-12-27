import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuOverlayProps
{
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  children: ReactNode;
}

export const ContextMenuOverlay = ({
  isOpen,
  onClose,
  position,
  children
}: ContextMenuOverlayProps) =>
{
  const menuRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  useEffect(() =>
  {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Invisible overlay - catches all clicks */}
      <div
        className="fixed inset-0 z-40"
        onClick={(e) =>
        {
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) =>
        {
          e.preventDefault();
          onClose();
        }}
      />
      {/* Menu content - floats above overlay */}
      <div
        ref={menuRef}
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-32"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body
  );
};
