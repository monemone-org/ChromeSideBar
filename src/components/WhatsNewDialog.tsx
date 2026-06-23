import { Dialog } from './Dialog';
import { ChangelogGroup } from '../data/changelog';

interface WhatsNewDialogProps
{
  isOpen: boolean;
  onClose: () => void;
  groups: ChangelogGroup[];
  version?: string;
}

export function WhatsNewDialog({ isOpen, onClose, groups, version }: WhatsNewDialogProps)
{
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={version ? `What's New in ${version}` : "What's New"}
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
      {groups.length > 0 ? (
        <div className="p-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
          {groups.map((group) => (
            <div key={group.version}>
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1.5">
                {group.version}
              </div>
              <ul className="space-y-1.5">
                {group.items.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-blue-500 mt-0.5 select-none">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
          You're up to date - no new features since your last update.
        </p>
      )}
    </Dialog>
  );
}
