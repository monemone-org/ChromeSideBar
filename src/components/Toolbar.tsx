import { Settings, Filter, Volume2, ChevronDown, X, Save, Clock, Bookmark, Trash2, RotateCcw, RotateCcwSquare, RotateCwSquare } from 'lucide-react';
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
  onUpdateRecent?: (text: string, existingEntry?: string) => void;
  onShowToast?: (message: string) => void;
  onResetFilters?: () => void;
  showFilterArea?: boolean;
}


const DEBOUNCE_MS = 300;

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
  onUpdateRecent,
  onShowToast,
  onResetFilters,
  showFilterArea = false,
}, _ref) =>
{
  const activeButtonClass = 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400';
  const inactiveButtonClass = 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700';

  // Tab history navigation shortcuts
  const [prevTabShortcut, setPrevTabShortcut] = useState<string>('');
  const [nextTabShortcut, setNextTabShortcut] = useState<string>('');

  // Tab history dropdown state
  interface HistoryItem
  {
    tabId: number;
    index: number;
    title: string;
    url: string;
    favIconUrl: string;
  }
  const [historyDropdown, setHistoryDropdown] = useState<'prev' | 'next' | null>(null);
  const [historyBefore, setHistoryBefore] = useState<HistoryItem[]>([]);
  const [historyAfter, setHistoryAfter] = useState<HistoryItem[]>([]);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const prevButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() =>
  {
    chrome.commands.getAll((commands) =>
    {
      for (const cmd of commands)
      {
        if (cmd.name === 'prev-used-tab' && cmd.shortcut)
        {
          setPrevTabShortcut(cmd.shortcut);
        }
        else if (cmd.name === 'next-used-tab' && cmd.shortcut)
        {
          setNextTabShortcut(cmd.shortcut);
        }
      }
    });
  }, []);

  // Tab history navigation handlers
  const handlePrevUsedTab = useCallback(() =>
  {
    chrome.runtime.sendMessage({ action: 'prev-used-tab' });
  }, []);

  const handleNextUsedTab = useCallback(() =>
  {
    chrome.runtime.sendMessage({ action: 'next-used-tab' });
  }, []);

  // Fetch tab history for dropdown
  const fetchTabHistory = useCallback(() =>
  {
    chrome.runtime.sendMessage({ action: 'get-tab-history' }, (response) =>
    {
      if (response)
      {
        setHistoryBefore(response.before || []);
        setHistoryAfter(response.after || []);
      }
    });
  }, []);

  // Handle click-and-hold for history dropdown
  const handleHistoryMouseDown = useCallback((direction: 'prev' | 'next') =>
  {
    // Clear any existing timer
    if (holdTimerRef.current)
    {
      clearTimeout(holdTimerRef.current);
    }

    // Start hold timer (300ms to show dropdown)
    holdTimerRef.current = setTimeout(() =>
    {
      fetchTabHistory();
      setHistoryDropdown(direction);
      holdTimerRef.current = null;
    }, 300);
  }, [fetchTabHistory]);

  const handleHistoryMouseUp = useCallback((direction: 'prev' | 'next') =>
  {
    // If timer is still running, it was a quick click - navigate
    if (holdTimerRef.current)
    {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      if (direction === 'prev')
      {
        handlePrevUsedTab();
      }
      else
      {
        handleNextUsedTab();
      }
    }
    // If timer already fired, dropdown is shown - don't navigate
  }, [handlePrevUsedTab, handleNextUsedTab]);

  const handleHistoryMouseLeave = useCallback(() =>
  {
    // Cancel hold timer if mouse leaves before it fires
    if (holdTimerRef.current)
    {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Navigate to specific history item
  const handleHistoryItemClick = useCallback((index: number) =>
  {
    chrome.runtime.sendMessage({ action: 'navigate-to-history-index', index });
    setHistoryDropdown(null);
  }, []);

  // Close history dropdown when clicking outside
  useEffect(() =>
  {
    if (!historyDropdown) return;

    const handleClickOutside = (e: MouseEvent) =>
    {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(e.target as Node) &&
        prevButtonRef.current &&
        !prevButtonRef.current.contains(e.target as Node) &&
        nextButtonRef.current &&
        !nextButtonRef.current.contains(e.target as Node)
      )
      {
        setHistoryDropdown(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape')
      {
        e.preventDefault();
        setHistoryDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () =>
    {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [historyDropdown]);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Local input value for immediate display (debounced before filtering)
  const [inputValue, setInputValue] = useState(filterText);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track current session's recent entry (for updating instead of adding new)
  const [sessionRecentEntry, setSessionRecentEntry] = useState<string | null>(null);

  // Sync inputValue when filterText changes externally (e.g., from selecting a filter)
  useEffect(() =>
  {
    setInputValue(filterText);
  }, [filterText]);

  // Debounced filter change
  const handleInputChange = useCallback((value: string) =>
  {
    const oldValue = inputValue.trim();
    const newValue = value.trim();

    // Detect "select all and clear/replace" pattern:
    // If old value had meaningful content (3+ chars) and is being cleared or replaced
    const hadMeaningfulContent = oldValue.length >= 3;
    const isCleared = newValue.length === 0;
    const isReplacement = newValue.length > 0 &&
      newValue.length <= 2 &&
      !oldValue.toLowerCase().startsWith(newValue.toLowerCase());

    // If clearing or replacing meaningful content, save the old search first
    if (hadMeaningfulContent && (isCleared || isReplacement) && onUpdateRecent)
    {
      onUpdateRecent(oldValue, sessionRecentEntry ?? undefined);
      setSessionRecentEntry(null); // Start fresh session
    }

    setInputValue(value);

    // Clear existing timer
    if (debounceTimerRef.current)
    {
      clearTimeout(debounceTimerRef.current);
    }

    // If cleared completely, reset session and apply immediately
    if (newValue === '')
    {
      setSessionRecentEntry(null);
      onFilterTextChange('');
      return;
    }

    // Debounce the actual filter change
    debounceTimerRef.current = setTimeout(() =>
    {
      onFilterTextChange(value);
    }, DEBOUNCE_MS);
  }, [onFilterTextChange, inputValue, sessionRecentEntry, onUpdateRecent]);

  // Cleanup debounce timer on unmount
  useEffect(() =>
  {
    return () =>
    {
      if (debounceTimerRef.current)
      {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Commit current search to recent (on blur or Enter)
  const commitToRecent = useCallback(() =>
  {
    const trimmed = inputValue.trim();
    if (!trimmed || !onUpdateRecent) return;

    // Update existing entry or add new
    onUpdateRecent(trimmed, sessionRecentEntry ?? undefined);
    setSessionRecentEntry(trimmed);
  }, [inputValue, sessionRecentEntry, onUpdateRecent]);

  // Check if any filter is active
  const hasActiveFilters = filterLiveTabsActive || filterAudibleActive || inputValue.trim() !== '';

  // Close dropdown when clicking outside or pressing Escape
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

    const handleEscape = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape' && showDropdown)
      {
        e.preventDefault();
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () =>
    {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showDropdown]);

  // Listen for Chrome extension commands directly
  useEffect(() =>
  {
    const focusInputWithCursorAtEnd = () =>
    {
      const input = inputRef.current;
      if (input)
      {
        input.focus();
        // Use setSelectionRange for controlled inputs to avoid fighting with React
        const len = input.value.length;
        input.setSelectionRange(len, len);
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
        // Focus immediately to catch the event
        focusInputWithCursorAtEnd();
        
        // Toggle dropdown instead of just opening
        setShowDropdown(prev => !prev);
        
        // Re-focus after render to ensure it sticks
        setTimeout(focusInputWithCursorAtEnd, 100);
      }
    };

    chrome.commands.onCommand.addListener(handleCommand);
    return () => chrome.commands.onCommand.removeListener(handleCommand);
  }, []);

  // Handle input keydown for ArrowDown to open dropdown, Enter to commit
  const handleInputKeydown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) =>
  {
    if (e.key === 'ArrowDown')
    {
      e.preventDefault();
      setShowDropdown(true);
    }
    else if (e.key === 'Enter')
    {
      e.preventDefault();
      commitToRecent();
    }
  }, [commitToRecent]);

  // Handle input blur to commit to recent
  const handleInputBlur = useCallback(() =>
  {
    commitToRecent();
  }, [commitToRecent]);

  const handleSaveFilter = () =>
  {
    const trimmed = inputValue.trim();
    if (trimmed && !savedFilters.includes(trimmed))
    {
      onSaveFilter(trimmed);
      onShowToast?.(`"${trimmed}" filter saved`);
    }
  };

  const handleSelectFilter = (text: string) =>
  {
    // Commit current search to recent before switching (if any)
    commitToRecent();

    // Apply the selected filter and start a new session
    onApplyFilter(text);
    setSessionRecentEntry(text);
    setShowDropdown(false);
  };

  const handleClearFilter = () =>
  {
    // Clear debounce timer
    if (debounceTimerRef.current)
    {
      clearTimeout(debounceTimerRef.current);
    }
    setInputValue('');
    setSessionRecentEntry(null);
    onFilterTextChange('');
  };

  const canSave = inputValue.trim() && !savedFilters.includes(inputValue.trim());

  return (
    <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Top row - Filter buttons and settings */}
      <div className="flex items-center justify-between px-2 py-1">
        {/* Left side - Tab history and Filter buttons */}
        <div className="flex items-center gap-1">
          {/* Tab history navigation */}
          <div className="relative">
            <button
              ref={prevButtonRef}
              onMouseDown={() => handleHistoryMouseDown('prev')}
              onMouseUp={() => handleHistoryMouseUp('prev')}
              onMouseLeave={handleHistoryMouseLeave}
              title={`Previous used tab${prevTabShortcut ? ` (${prevTabShortcut})` : ''}\nHold for history`}
              className={`p-1.5 rounded transition-all duration-150 ${inactiveButtonClass}`}
            >
              <RotateCcwSquare size={16} className="-rotate-90" />
            </button>

            {/* Previous history dropdown */}
            {historyDropdown === 'prev' && historyBefore.length > 0 && (
              <div
                ref={historyDropdownRef}
                className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-48 max-w-72 max-h-64 overflow-y-auto"
              >
                {historyBefore.map((item) => (
                  <div
                    key={item.tabId}
                    onClick={() => handleHistoryItemClick(item.index)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    {item.favIconUrl ? (
                      <img src={item.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded" />
                    )}
                    <span className="text-gray-700 dark:text-gray-200 truncate text-sm">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state for prev */}
            {historyDropdown === 'prev' && historyBefore.length === 0 && (
              <div
                ref={historyDropdownRef}
                className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 px-3 z-50 min-w-32"
              >
                <span className="text-gray-500 dark:text-gray-400 text-sm">No previous tabs</span>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              ref={nextButtonRef}
              onMouseDown={() => handleHistoryMouseDown('next')}
              onMouseUp={() => handleHistoryMouseUp('next')}
              onMouseLeave={handleHistoryMouseLeave}
              title={`Next used tab${nextTabShortcut ? ` (${nextTabShortcut})` : ''}\nHold for history`}
              className={`p-1.5 rounded transition-all duration-150 ${inactiveButtonClass}`}
            >
              <RotateCwSquare size={16} className="rotate-90" />
            </button>

            {/* Next history dropdown */}
            {historyDropdown === 'next' && historyAfter.length > 0 && (
              <div
                ref={historyDropdownRef}
                className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-48 max-w-72 max-h-64 overflow-y-auto"
              >
                {historyAfter.map((item) => (
                  <div
                    key={item.tabId}
                    onClick={() => handleHistoryItemClick(item.index)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    {item.favIconUrl ? (
                      <img src={item.favIconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 flex-shrink-0 bg-gray-300 dark:bg-gray-600 rounded" />
                    )}
                    <span className="text-gray-700 dark:text-gray-200 truncate text-sm">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state for next */}
            {historyDropdown === 'next' && historyAfter.length === 0 && (
              <div
                ref={historyDropdownRef}
                className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 px-3 z-50 min-w-32"
              >
                <span className="text-gray-500 dark:text-gray-400 text-sm">No next tabs</span>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />

          {/* Filter buttons */}
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

      {/* Bottom row - Text filter (conditionally rendered) */}
      {showFilterArea && (
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <div className="relative flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleInputKeydown}
              onBlur={handleInputBlur}
              placeholder="Filter by title or URL..."
              className="w-full pl-2 pr-16 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />

            {/* Clear button - inside input on right */}
            {inputValue && (
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
            title={canSave ? "Save filter" : inputValue.trim() ? "Already saved" : "Enter filter text first"}
            className={`p-1.5 rounded transition-all duration-150 ${
              canSave
                ? 'text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          >
            <Save size={16} />
          </button>
        </div>
      )}
    </div>
  );
});

Toolbar.displayName = 'Toolbar';
