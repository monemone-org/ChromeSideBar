import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, X } from 'lucide-react';
import { useFontSize } from '../contexts/FontSizeContext';

interface ToastProps
{
  message: string;
  isVisible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export const Toast = ({
  message,
  isVisible,
  onDismiss,
  duration = 3000
}: ToastProps) =>
{
  const fontSize = useFontSize();

  useEffect(() =>
  {
    if (!isVisible) return;

    const timer = setTimeout(() =>
    {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, duration, onDismiss]);

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed bottom-14 left-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2"
      style={{ fontSize: `${fontSize}px` }}
    >
      <CheckCircle size={16} className="shrink-0 self-start mt-0.5" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 hover:bg-green-500 rounded"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>,
    document.body
  );
};
