import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Space, SpaceMessageAction, ALL_SPACE } from '../utils/spaceMessages';
import { SpaceList, useSpaceListKeyboard, useSpaceListHighlight } from './SpaceList';

export const SpaceNavigatorApp = () =>
{
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>('all');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // windowId is passed by background.ts as a URL query param
  const windowId = useMemo(() =>
  {
    const params = new URLSearchParams(window.location.search);
    return parseInt(params.get('windowId') || '0', 10);
  }, []);

  // Load spaces and current active space from background on mount
  useEffect(() =>
  {
    chrome.runtime.sendMessage({ action: SpaceMessageAction.GET_SPACES }, (response) =>
    {
      if (!chrome.runtime.lastError)
      {
        setSpaces(response?.spaces || []);
      }
    });

    chrome.runtime.sendMessage(
      { action: SpaceMessageAction.GET_WINDOW_STATE, windowId },
      (state) =>
      {
        if (!chrome.runtime.lastError)
        {
          setActiveSpaceId(state?.activeSpaceId || 'all');
        }
      }
    );
  }, [windowId]);

  // All = index 0, named spaces = index 1..N
  const allSpaces = useMemo(() => [ALL_SPACE, ...spaces], [spaces]);

  // Highlight the active space once spaces are loaded
  useSpaceListHighlight({
    spaces: allSpaces,
    activeSpaceId,
    setHighlightedIndex,
    itemRefs,
    enabled: spaces.length > 0,
  });

  const handleSelect = useCallback((spaceId: string) =>
  {
    chrome.runtime.sendMessage(
      { action: SpaceMessageAction.SET_ACTIVE_SPACE, spaceId, windowId },
      () => window.close()
    );
  }, [windowId]);

  // displaySpaces is the search-filtered subset of allSpaces
  const { filteredSpaces: displaySpaces, searchQuery, onSearchChange, searchInputRef } = useSpaceListKeyboard({
    spaces: allSpaces,
    highlightedIndex,
    setHighlightedIndex,
    onSelect: handleSelect,
    itemRefs,
    firstKeyIsZero: true,
    onEscape: window.close,
  });

  return (
    <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 h-screen flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Navigate to Space</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SpaceList
          spaces={displaySpaces}
          highlightedIndex={highlightedIndex}
          activeSpaceId={activeSpaceId}
          firstKeyIsZero={true}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchInputRef={searchInputRef}
          onSelect={handleSelect}
          onHighlight={setHighlightedIndex}
          itemRefs={itemRefs}
        />
      </div>
    </div>
  );
};
