import { Settings, Filter, Volume2 } from 'lucide-react';
import { forwardRef } from 'react';

interface ToolbarProps
{
  filterLiveTabsActive: boolean;
  onFilterLiveTabsToggle: () => void;
  filterAudibleActive: boolean;
  onFilterAudibleToggle: () => void;
  onMenuToggle: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
}


export const Toolbar = forwardRef<HTMLButtonElement, ToolbarProps>(({
  filterLiveTabsActive,
  onFilterLiveTabsToggle,
  filterAudibleActive,
  onFilterAudibleToggle,
  onMenuToggle,
  menuButtonRef,
}, _ref) =>
{
  const activeButtonClass = 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400';
  const inactiveButtonClass = 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700';

  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Left side - Filter buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onFilterLiveTabsToggle}
          title={filterLiveTabsActive ? "Show all items" : "Show only items with open tabs"}
          className={`p-1.5 rounded transition-all duration-150 ${
            filterLiveTabsActive ? activeButtonClass : inactiveButtonClass
          }`}
        >
          <Filter size={16} />
        </button>

        <button
          onClick={onFilterAudibleToggle}
          title={filterAudibleActive ? "Show all items" : "Show only items playing audio/video"}
          className={`p-1.5 rounded transition-all duration-150 ${
            filterAudibleActive ? activeButtonClass : inactiveButtonClass
          }`}
        >
          <Volume2 size={16} />
        </button>
      </div>

      {/* Right side - Settings gear button */}
      <button
        ref={menuButtonRef}
        onClick={onMenuToggle}
        title="Menu"
        className={`p-1.5 rounded transition-all duration-150 ${inactiveButtonClass}`}
      >
        <Settings size={16} />
      </button>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
