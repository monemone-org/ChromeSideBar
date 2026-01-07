import { Settings, Filter, Volume2, ChevronDown, X, Save, Clock, Bookmark, Trash2, RotateCcw } from 'lucide-react';
import { forwardRef, useState, useRef, useEffect, useCallback } from 'react';

interface ToolbarProps
{
  filterLiveTabsActive: boolean;
  onFilterLiveTabsToggle: () => void;
  filterAudibleActive: boolean;
  onFilterAudibleToggle: () => void;
  onMenuToggle: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
  // Text filter props
  filterText: string;
  onFilterTextChange: (text: string) => void;
  savedFilters: string[];
  recentFilters: string[];
  onSaveFilter: (text: string) => void;
  onDeleteSavedFilter: (text: string) => void;
  onApplyFilter: (text: string) => void;
  onShowToast?: (message: string) => void;
  onResetFilters?: () => void;
}


export const Toolbar = forwardRef<HTMLButtonElement, ToolbarProps>(({
  filterLiveTabsActive,
  onFilterLiveTabsToggle,
  filterAudibleActive,
  onFilterAudibleToggle,
  onMenuToggle,
  menuButtonRef,
  filterText,
  onFilterTextChange,
  savedFilters,
  recentFilters,
  onSaveFilter,
  onDeleteSavedFilter,
  onApplyFilter,
  onShowToast,
  onResetFilters,
}, _ref) =>
{
  const activeButtonClass = 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400';
  const inactiveButtonClass = 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700';

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if any filter is active
  const hasActiveFilters = filterLiveTabsActive || filterAudibleActive || filterText.trim() !== '';

  // Close dropdown when clicking outside
  useEffect(() =>
  {
    const handleClickOutside = (e: MouseEvent) =>
    {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        dropdownButtonRef.current &&
        !dropdownButtonRef.current.contains(e.target as Node)
      )
      {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () =>
    {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Listen for Chrome extension commands directly
  useEffect(() =>
  {
    const focusInputWithCursorAtEnd = () =>
    {
      const input = inputRef.current;
      if (input)
      {
        input.focus();
        // Place cursor at the end of existing text
        const val = input.value;
        input.value = '';
        input.value = val;
      }
    };

    const handleCommand = (command: string) =>
    {
      if (command === 'focus-filter-input')
      {
        focusInputWithCursorAtEnd();
      }
      else if (command === 'open-saved-filters')
      {
        focusInputWithCursorAtEnd();
        // Toggle dropdown instead of just opening
        setShowDropdown(prev => !prev);
      }
    };

    chrome.commands.onCommand.addListener(handleCommand);
    return () => chrome.commands.onCommand.removeListener(handleCommand);
  }, []);

  // Handle input keydown for ArrowDown to open dropdown
  const handleInputKeydown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) =>
  {
    if (e.key === 'ArrowDown')
    {
      e.preventDefault();
      setShowDropdown(true);
    }
  }, []);

  const handleSaveFilter = () =>
  {
    const trimmed = filterText.trim();
    if (trimmed && !savedFilters.includes(trimmed))
    {
      onSaveFilter(trimmed);
      onShowToast?.(`"${trimmed}" filter saved`);
    }
  };

  const handleSelectFilter = (text: string) =>
  {
    onApplyFilter(text);
    setShowDropdown(false);
  };

  const handleClearFilter = () =>
  {
    onFilterTextChange('');
  };

  const canSave = filterText.trim() && !savedFilters.includes(filterText.trim());

  return (
    <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Top row - Filter buttons and settings */}
      <div className="flex items-center justify-between px-2 py-1">
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

          {/* Reset filters button - always visible, disabled when no filters active */}
          {onResetFilters && (
            <button
              onClick={onResetFilters}
              disabled={!hasActiveFilters}
              title="Reset all filters"
              className={`p-1.5 rounded transition-all duration-150 ${
                hasActiveFilters
                  ? inactiveButtonClass
                  : 'text-gray-300 dark:text-gray-600'
              }`}
            >
              <RotateCcw size={16} />
            </button>
          )}
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

      {/* Bottom row - Text filter */}
      <div className="flex items-center gap-1 px-2 pb-1.5">
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={(e) => onFilterTextChange(e.target.value)}
            onKeyDown={handleInputKeydown}
            placeholder="Filter by title or URL..."
            className="w-full pl-2 pr-16 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />

          {/* Clear button - inside input on right */}
          {filterText && (
            <button
              onClick={handleClearFilter}
              title="Clear filter"
              className="absolute right-8 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}

          {/* Dropdown button - inside input on right */}
          <button
            ref={dropdownButtonRef}
            onClick={() => setShowDropdown(!showDropdown)}
            title="Saved Filters"
            className="absolute right-1 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <ChevronDown size={16} />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 max-h-64 overflow-y-auto"
            >
              {/* Saved Filters Section */}
              {savedFilters.length > 0 && (
                <>
                  <div className="px-3 py-1 font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Bookmark size={12} />
                    Saved Filters
                  </div>
                  {savedFilters.map((filter) => (
                    <div
                      key={`saved-${filter}`}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
                    >
                      <span
                        onClick={() => handleSelectFilter(filter)}
                        className="flex-1 text-gray-700 dark:text-gray-200 truncate"
                      >
                        {filter}
                      </span>
                      <button
                        onClick={(e) =>
                        {
                          e.stopPropagation();
                          onDeleteSavedFilter(filter);
                        }}
                        className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete saved filter"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Recent Filters Section */}
              {recentFilters.length > 0 && (
                <>
                  {savedFilters.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  )}
                  <div className="px-3 py-1 font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock size={12} />
                    Recent
                  </div>
                  {recentFilters.map((filter) => (
                    <div
                      key={`recent-${filter}`}
                      onClick={() => handleSelectFilter(filter)}
                      className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <span className="text-gray-700 dark:text-gray-200 truncate block">
                        {filter}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Empty state */}
              {savedFilters.length === 0 && recentFilters.length === 0 && (
                <div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-center">
                  No saved or recent filters
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSaveFilter}
          disabled={!canSave}
          title={canSave ? "Save filter" : filterText.trim() ? "Already saved" : "Enter filter text first"}
          className={`p-1.5 rounded transition-all duration-150 ${
            canSave
              ? 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          <Save size={16} />
        </button>
      </div>
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
