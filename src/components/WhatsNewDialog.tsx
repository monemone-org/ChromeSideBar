import { useCallback } from 'react';
import { Dialog } from './Dialog';
import { useFontSize } from '../contexts/FontSizeContext';

interface WhatsNewDialogProps
{
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsNewDialog({ isOpen, onClose }: WhatsNewDialogProps)
{
  const fontSize = useFontSize();

  // Apply the sidebar's font size to the iframe body once it loads
  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) =>
  {
    const doc = e.currentTarget.contentDocument;
    if (doc?.body)
    {
      doc.body.style.fontSize = `${fontSize}px`;
    }
  }, [fontSize]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="What's New"
      maxWidth="max-w-sm"
      footer={
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Got it
          </button>
        </div>
      }
    >
      <iframe
        src="whatsnew.html"
        className="w-full border-0"
        style={{ height: '300px' }}
        title="What's New"
        onLoad={handleIframeLoad}
      />
    </Dialog>
  );
}
