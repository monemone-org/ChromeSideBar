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

interface TooltipButtonProps
{
  onClick: () => void;
  tooltip: string;
  className?: string;
  children: React.ReactNode;
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

const TooltipButton = ({ onClick, tooltip, className, children, buttonRef }: TooltipButtonProps) =>
{
  return (
    <div className="relative group">
      <button
        ref={buttonRef}
        onClick={onClick}
        className={className}
      >
        {children}
      </button>
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white bg-gray-800 dark:bg-gray-700 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-150 pointer-events-none z-50">
        {tooltip}
      </div>
    </div>
  );
};

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
        <TooltipButton
          onClick={onFilterLiveTabsToggle}
          tooltip={filterLiveTabsActive ? "Show all items" : "Show only items with live tabs"}
          className={`p-1.5 rounded transition-all duration-150 ${
            filterLiveTabsActive ? activeButtonClass : inactiveButtonClass
          }`}
        >
          <Filter size={16} />
        </TooltipButton>

        <TooltipButton
          onClick={onFilterAudibleToggle}
          tooltip={filterAudibleActive ? "Show all items" : "Show only items playing audio/video"}
          className={`p-1.5 rounded transition-all duration-150 ${
            filterAudibleActive ? activeButtonClass : inactiveButtonClass
          }`}
        >
          <Volume2 size={16} />
        </TooltipButton>
      </div>

      {/* Right side - Settings gear button */}
      <TooltipButton
        onClick={onMenuToggle}
        tooltip="Menu"
        buttonRef={menuButtonRef}
        className={`p-1.5 rounded transition-all duration-150 ${inactiveButtonClass}`}
      >
        <Settings size={16} />
      </TooltipButton>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
