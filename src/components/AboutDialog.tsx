import { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';

const ABOUT = {
  author: 'monehsieh',
  github: 'https://github.com/monemone-org/ChromeSideBar',
  chromeWebStore: 'https://chromewebstore.google.com/detail/Sidebar%20for%20Arc%20Users/jmmgjadgeeicdbagekohgmaipoekgcbn',
};

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps)
{
  const [version, setVersion] = useState('');

  useEffect(() =>
  {
    if (isOpen)
    {
      setVersion(chrome.runtime.getManifest().version);
    }
  }, [isOpen]);

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

  if (!isOpen)
  {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-3 w-56 border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">About</h2>
          <button
            onClick={onClose}
            aria-label="Close about"
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="text-gray-700 dark:text-gray-300">
            <p className="font-medium">Sidebar for Arc Users</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Version {version}
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              by {ABOUT.author}
            </p>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
            <a
              href={ABOUT.github}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
            >
              GitHub <ExternalLink size={12} />
            </a>
            <a
              href={ABOUT.chromeWebStore}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Chrome Web Store <ExternalLink size={12} />
            </a>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
