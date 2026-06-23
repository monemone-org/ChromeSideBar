import { Dialog } from './Dialog';

interface WhatsNewDialogProps
{
  isOpen: boolean;
  onClose: () => void;
  items: string[];
}

export function WhatsNewDialog({ isOpen, onClose, items }: WhatsNewDialogProps)
{
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
      {items.length > 0 ? (
        <ul className="p-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blue-500 mt-0.5 select-none">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
          You're up to date - no new features since your last update.
        </p>
      )}
    </Dialog>
  );
}
