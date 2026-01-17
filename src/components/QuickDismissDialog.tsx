import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFontSize } from '../contexts/FontSizeContext';
import { X } from 'lucide-react';

interface QuickDismissDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

/**
 * A dialog variant that dismisses when clicking outside the dialog content.
 * Use this for quick selection dialogs like audio tabs and space navigator.
 */
export const QuickDismissDialog = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-xs'
}: QuickDismissDialogProps) =>
{
  const fontSize = useFontSize();

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
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ fontSize: `${fontSize}px` }}
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full ${maxWidth} border border-gray-200 dark:border-gray-700 max-h-[calc(100vh-2rem)] flex flex-col my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
