import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog } from './Dialog';

const ABOUT = {
  author: 'monehsieh',
  github: 'https://github.com/monemone-org/ChromeSideBar',
  chromeWebStore: 'https://chromewebstore.google.com/detail/Sidebar%20for%20Arc%20Users/jmmgjadgeeicdbagekohgmaipoekgcbn',
};

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onShowWelcome?: () => void;
}

export function AboutDialog({ isOpen, onClose, onShowWelcome }: AboutDialogProps)
{
  const [version, setVersion] = useState('');

  useEffect(() =>
  {
    if (isOpen)
    {
      setVersion(chrome.runtime.getManifest().version);
    }
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="About" maxWidth="max-w-xs">
      <div className="p-3 space-y-3">
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
          {onShowWelcome && (
            <button
              onClick={() =>
              {
                onClose();
                onShowWelcome();
              }}
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show Welcome
            </button>
          )}
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
    </Dialog>
  );
}
