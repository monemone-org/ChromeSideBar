import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFontSize } from '../contexts/FontSizeContext';

type SlideState = 'entering' | 'visible' | 'exiting' | 'hidden';

interface ToastProps
{
  message: string;
  isVisible: boolean;
  onDismiss: () => void;
  onUndo?: () => void;
  duration?: number;
}

export const Toast = ({
  message,
  isVisible,
  onDismiss,
  onUndo,
  duration
}: ToastProps) =>
{
  const fontSize = useFontSize();
  const [slideState, setSlideState] = useState<SlideState>('hidden');
  const effectiveDuration = duration ?? (onUndo ? 5000 : 2500);

  const startExit = useCallback(() =>
  {
    setSlideState('exiting');
  }, []);

  // Drive slide state from isVisible
  useEffect(() =>
  {
    if (isVisible)
    {
      setSlideState('entering');
      // Trigger reflow then transition to visible
      const frame = requestAnimationFrame(() =>
      {
        setSlideState('visible');
      });
      return () => cancelAnimationFrame(frame);
    }
    else
    {
      setSlideState((prev) => (prev === 'visible' ? 'exiting' : 'hidden'));
    }
  }, [isVisible]);

  // Auto-dismiss timer
  useEffect(() =>
  {
    if (slideState !== 'visible') return;

    const timer = setTimeout(() =>
    {
      startExit();
    }, effectiveDuration);

    return () => clearTimeout(timer);
  }, [slideState, effectiveDuration, startExit]);

  // After exit animation completes, call onDismiss and go hidden
  const handleTransitionEnd = useCallback(() =>
  {
    if (slideState === 'exiting')
    {
      setSlideState('hidden');
      onDismiss();
    }
  }, [slideState, onDismiss]);

  if (slideState === 'hidden') return null;

  const translateY = slideState === 'visible' ? 'translateY(0)' : 'translateY(100%)';

  return createPortal(
    <div className="fixed bottom-14 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 mx-4 min-w-[80%]"
        style={{
          fontSize: `${fontSize}px`,
          transform: translateY,
          transition: 'transform 200ms ease-out',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        <span className="flex-1">{message}</span>
        {onUndo && (
          <button
            onClick={() => { onUndo(); startExit(); }}
            className="shrink-0 px-2 py-0.5 text-blue-300 hover:text-blue-200 font-medium rounded"
          >
            Undo
          </button>
        )}
        <button
          onClick={startExit}
          className="shrink-0 p-0.5 hover:bg-gray-700 rounded"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  );
};
