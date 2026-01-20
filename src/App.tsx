import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BookmarkTree } from './components/BookmarkTree';
import { TabList, ExternalDropTarget, ResolveBookmarkDropTarget } from './components/TabList';
import { PinnedBar } from './components/PinnedBar';
import { Toolbar } from './components/Toolbar';
import { SpaceBar } from './components/SpaceBar';
import { SettingsDialog, SettingsValues, BookmarkOpenMode } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { ExportDialog } from './components/ExportDialog';
import { ImportDialog } from './components/ImportDialog';
import { WelcomeDialog } from './components/WelcomeDialog';
import { AudioTabsDialog } from './components/AudioTabsDialog';
import { SpaceNavigatorDialog } from './components/SpaceNavigatorDialog';
import { Toast } from './components/Toast';
import { usePinnedSites, PinnedSite } from './hooks/usePinnedSites';
import { useTabs } from './hooks/useTabs';
import { useBookmarks } from './hooks/useBookmarks';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useChromeLocalStorage } from './hooks/useChromeLocalStorage';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { FontSizeContext } from './contexts/FontSizeContext';
import { BookmarkTabsProvider } from './contexts/BookmarkTabsContext';
import { SpacesProvider, Space, useSpacesContext } from './contexts/SpacesContext';
import { SelectionProvider } from './contexts/SelectionContext';
import { SpaceDialogs } from './components/SpaceDialogs';
import { useFontSize } from './contexts/FontSizeContext';
import { getIconUrl } from './utils/iconify';
import { GROUP_COLORS } from './utils/groupColors';
import { Settings, Info, Upload, Download, RefreshCw, LayoutGrid } from 'lucide-react';
import { SectionHeader } from './components/SectionHeader';
import { SpaceContextMenuContent } from './components/SpaceContextMenuContent';
import * as DropdownMenu from './components/menu/DropdownMenu';

// Inner component that renders content for a single space
interface SidebarContentProps
{
  onPin: (url: string, title: string, faviconUrl?: string) => void;
  hideOtherBookmarks: boolean;
  externalDropTarget: ExternalDropTarget | null;
  bookmarkOpenMode: BookmarkOpenMode;
  onResolverReady: (fn: ResolveBookmarkDropTarget) => void;
  filterLiveTabs: boolean;
  filterText: string;
  sortGroupsFirst: boolean;
  useSpaces: boolean;
  onExternalDropTargetChange: (target: ExternalDropTarget | null) => void;
  resolveBookmarkDropTarget: () => ResolveBookmarkDropTarget | null;
  onShowToast?: (message: string) => void;
  onSpaceDropTargetChange?: (spaceId: string | null) => void;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  onPin,
  hideOtherBookmarks,
  externalDropTarget,
  bookmarkOpenMode,
  onResolverReady,
  filterLiveTabs,
  filterText,
  sortGroupsFirst,
  useSpaces,
  onExternalDropTargetChange,
  resolveBookmarkDropTarget,
  onShowToast,
  onSpaceDropTargetChange,
}) =>
{
  const { activeSpace } = useSpacesContext();

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-2">
      <BookmarkTree
        onPin={onPin}
        hideOtherBookmarks={hideOtherBookmarks}
        externalDropTarget={externalDropTarget}
        bookmarkOpenMode={bookmarkOpenMode}
        onResolverReady={onResolverReady}
        filterLiveTabs={filterLiveTabs}
        filterText={filterText}
        activeSpace={activeSpace}
        onShowToast={onShowToast}
        useSpaces={useSpaces}
      />
      <TabList
        onPin={onPin}
        sortGroupsFirst={sortGroupsFirst}
        onExternalDropTargetChange={onExternalDropTargetChange}
        resolveBookmarkDropTarget={resolveBookmarkDropTarget}
        arcStyleEnabled={bookmarkOpenMode === 'arc'}
        filterText={filterText}
        activeSpace={activeSpace}
        useSpaces={useSpaces}
        onSpaceDropTargetChange={onSpaceDropTargetChange}
      />
    </div>
  );
};

// Fixed space title bar - shows current space icon and name
interface SpaceTitleProps
{
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
  onCloseAllTabs: (space: Space) => void;
}

const SpaceTitle: React.FC<SpaceTitleProps> = ({ onEditSpace, onDeleteSpace, onCloseAllTabs }) =>
{
  const { activeSpace } = useSpacesContext();
  const fontSize = useFontSize();
  const titleFontSize = fontSize - 1;
  const iconSize = titleFontSize;
  const isAllSpace = activeSpace.id === 'all';
  const colorStyle = GROUP_COLORS[activeSpace.color] ?? GROUP_COLORS.grey;

  // Build icon element - both Lucide and img icons use currentColor (inherited from text color)
  const iconElement = activeSpace.icon === 'LayoutGrid' ? (
    <LayoutGrid size={iconSize} />
  ) : (
    <span
      style={{
        display: 'inline-block',
        width: iconSize,
        height: iconSize,
        backgroundColor: 'currentColor',
        maskImage: `url(${getIconUrl(activeSpace.icon)})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: `url(${getIconUrl(activeSpace.icon)})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
    />
  );

  const menuContent = (
    <SpaceContextMenuContent
      isAllSpace={isAllSpace}
      onEdit={() => onEditSpace(activeSpace)}
      onDelete={() => onDeleteSpace(activeSpace)}
      onCloseAllTabs={() => onCloseAllTabs(activeSpace)}
    />
  );

  return (
    <SectionHeader
      label={activeSpace.name}
      icon={iconElement}
      menuContent={menuContent}
      menuTitle="Space options"
      fontSize={titleFontSize}
      showMenuButton={true}
      textClassName={colorStyle.text}
    />
  );
};

// Wrapper that provides close tabs handler using hooks (must be inside providers)
interface SpaceTitleWrapperProps
{
  onEditSpace: (space: Space) => void;
  onDeleteSpace: (space: Space) => void;
}

const SpaceTitleWrapper: React.FC<SpaceTitleWrapperProps> = ({ onEditSpace, onDeleteSpace }) =>
{
  const { closeAllTabsInSpace } = useSpacesContext();

  return (
    <SpaceTitle
      onEditSpace={onEditSpace}
      onDeleteSpace={onDeleteSpace}
      onCloseAllTabs={closeAllTabsInSpace}
    />
  );
};

// Container with swipe navigation and slide animation
interface SwipeableContainerProps extends SidebarContentProps
{
}

const SwipeableContainer: React.FC<SwipeableContainerProps> = (props) =>
{
  const { allSpaces, activeSpaceId, setActiveSpaceId, switchToSpace } = useSpacesContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const prevSpaceIdRef = useRef(activeSpaceId);

  const currentIndex = allSpaces.findIndex(s => s.id === activeSpaceId);
  const canSwipeLeft = currentIndex < allSpaces.length - 1;
  const canSwipeRight = currentIndex > 0;

  // Detect space change and set slide direction
  useEffect(() =>
  {
    if (activeSpaceId !== prevSpaceIdRef.current)
    {
      const prevIndex = allSpaces.findIndex(s => s.id === prevSpaceIdRef.current);
      const newIndex = allSpaces.findIndex(s => s.id === activeSpaceId);
      setSlideDirection(newIndex > prevIndex ? 'left' : 'right');
      prevSpaceIdRef.current = activeSpaceId;
    }
  }, [activeSpaceId, allSpaces]);

  // Clear animation after it completes
  useEffect(() =>
  {
    if (slideDirection)
    {
      const timer = setTimeout(() => setSlideDirection(null), 200);
      return () => clearTimeout(timer);
    }
  }, [slideDirection]);

  // Reset to "all" space when useSpaces is turned off
  useEffect(() =>
  {
    if (!props.useSpaces && activeSpaceId !== 'all')
    {
      setActiveSpaceId('all');
    }
  }, [props.useSpaces, activeSpaceId, setActiveSpaceId]);

  const handleSwipe = useCallback((direction: 'left' | 'right') =>
  {
    if (direction === 'left' && canSwipeLeft)
    {
      switchToSpace(allSpaces[currentIndex + 1].id);
    }
    else if (direction === 'right' && canSwipeRight)
    {
      switchToSpace(allSpaces[currentIndex - 1].id);
    }
  }, [allSpaces, currentIndex, canSwipeLeft, canSwipeRight, switchToSpace]);

  useSwipeNavigation(containerRef, { onSwipe: handleSwipe });

  const animationClass = slideDirection === 'left'
    ? 'animate-slide-left'
    : slideDirection === 'right'
      ? 'animate-slide-right'
      : '';

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <div className={`h-full ${animationClass}`}>
        <SidebarContent {...props} />
      </div>
    </div>
  );
};

// Wrapper for ExportDialog that uses spaces from context
interface ExportDialogWrapperProps
{
  isOpen: boolean;
  onClose: () => void;
  pinnedSites: PinnedSite[];
  bookmarks: chrome.bookmarks.BookmarkTreeNode[];
}

const ExportDialogWrapper: React.FC<ExportDialogWrapperProps> = (props) =>
{
  const { spaces } = useSpacesContext();
  return <ExportDialog {...props} spaces={spaces} />;
};

// Wrapper for ImportDialog that uses spaces from context
interface ImportDialogWrapperProps
{
  isOpen: boolean;
  onClose: () => void;
  replacePinnedSites: (sites: PinnedSite[]) => void;
  appendPinnedSites: (sites: PinnedSite[]) => void;
}

const ImportDialogWrapper: React.FC<ImportDialogWrapperProps> = (props) =>
{
  const { spaces, replaceSpaces, appendSpaces } = useSpacesContext();
  return (
    <ImportDialog
      {...props}
      replaceSpaces={replaceSpaces}
      appendSpaces={appendSpaces}
      existingSpaces={spaces}
    />
  );
};

function App() {
  const [fontSize, setFontSize] = useLocalStorage('sidebar-font-size-px', 14, {
    parse: (v) => parseInt(v, 10),
    serialize: (v) => v.toString()
  });
  const [hideOtherBookmarks, setHideOtherBookmarks] = useLocalStorage(
    'sidebar-hide-other-bookmarks',
    false,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [sortGroupsFirst, setSortGroupsFirst] = useLocalStorage(
    'sidebar-sort-groups-first',
    true,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [pinnedIconSize, setPinnedIconSize] = useLocalStorage(
    'sidebar-pinned-icon-size-px',
    22,
    { parse: (v) => parseInt(v, 10), serialize: (v) => v.toString() }
  );
  const [bookmarkOpenMode, setBookmarkOpenMode] = useChromeLocalStorage<BookmarkOpenMode>(
    'sidebar-bookmark-open-mode',
    'arc',
    {
      parse: (v) => {
        // Migration from old boolean setting
        if (v === 'true') return 'arc';
        if (v === 'false') return 'newTab';
        return v as BookmarkOpenMode;
      },
      serialize: (v) => v
    }
  );
  const [spacesEnabled, setSpacesEnabled] = useChromeLocalStorage(
    'sidebar-use-spaces',
    true,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [showFilterArea, setShowFilterArea] = useLocalStorage(
    'sidebar-show-filter-area',
    false,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useLocalStorage(
    'sidebar-has-seen-welcome',
    false,
    { parse: (v) => v === 'true', serialize: (v) => v.toString() }
  );
  const [showWelcome, setShowWelcome] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [filterLiveTabs, setFilterLiveTabs] = useState(false);
  const [showAudioDialog, setShowAudioDialog] = useState(false);
  const [showSpaceNavigator, setShowSpaceNavigator] = useState(false);
  const [lastAudibleTab, setLastAudibleTab] = useState<chrome.tabs.Tab | undefined>(undefined);
  const [filterText, setFilterText] = useState('');
  const [savedFilters, setSavedFilters] = useChromeLocalStorage<string[]>(
    'sidebar-saved-filters',
    [],
    { parse: (v) => JSON.parse(v), serialize: (v) => JSON.stringify(v) }
  );
  const [recentFilters, setRecentFilters] = useChromeLocalStorage<string[]>(
    'sidebar-recent-filters',
    [],
    { parse: (v) => JSON.parse(v), serialize: (v) => JSON.stringify(v) }
  );
  const [toastMessage, setToastMessage] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [externalDropTarget, setExternalDropTarget] = useState<ExternalDropTarget | null>(null);
  const [spaceDropTargetId, setSpaceDropTargetId] = useState<string | null>(null);
  const [spaceToEdit, setSpaceToEdit] = useState<Space | null>(null);
  const [showSpaceEditDialog, setShowSpaceEditDialog] = useState(false);
  const [spaceToDelete, setSpaceToDelete] = useState<Space | null>(null);
  const [showSpaceDeleteDialog, setShowSpaceDeleteDialog] = useState(false);
  const bookmarkDropResolverRef = useRef<ResolveBookmarkDropTarget | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null!);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const {
    pinnedSites,
    addPin,
    removePin,
    updatePin,
    resetFavicon,
    movePin,
    duplicatePin,
    replacePinnedSites,
    appendPinnedSites,
  } = usePinnedSites();
  const { bookmarks } = useBookmarks();
  const { tabs, activateTab } = useTabs();

  const handleApplySettings = (newSettings: SettingsValues) => {
    setFontSize(newSettings.fontSize);
    setHideOtherBookmarks(newSettings.hideOtherBookmarks);
    setSortGroupsFirst(newSettings.sortGroupsFirst);
    setPinnedIconSize(newSettings.pinnedIconSize);
    setBookmarkOpenMode(newSettings.bookmarkOpenMode);
    setSpacesEnabled(newSettings.useSpaces);
    setShowSettings(false);
  };

  // Filter handlers
  const handleFilterTextChange = (text: string) => {
    setFilterText(text);
  };

  const handleSaveFilter = (text: string) => {
    if (text.trim() && !savedFilters.includes(text.trim())) {
      setSavedFilters([text.trim(), ...savedFilters]);
    }
  };

  const handleDeleteSavedFilter = (text: string) => {
    setSavedFilters(savedFilters.filter((f) => f !== text));
  };

  const handleApplyFilter = (text: string) => {
    setFilterText(text);
    // Add to recent filters (avoid duplicates, max 5)
    const trimmed = text.trim();
    if (trimmed) {
      const newRecent = [trimmed, ...recentFilters.filter((f) => f !== trimmed)].slice(0, 5);
      setRecentFilters(newRecent);
    }
  };

  // Update recent filter (called on blur/Enter from toolbar)
  // If existingEntry is provided, replace it; otherwise add new
  const handleUpdateRecent = useCallback((text: string, existingEntry?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Remove existing entry if provided (we're updating it)
    // Also remove duplicates of the new text
    const filtered = recentFilters.filter((f) => f !== trimmed && f !== existingEntry);
    // Add new text at the top, max 5
    setRecentFilters([trimmed, ...filtered].slice(0, 5));
  }, [recentFilters]);

  // Toast helpers
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  }, []);

  const hideToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  // Reset all filters
  const handleResetFilters = useCallback(() => {
    setFilterText('');
    setFilterLiveTabs(false);
  }, []);

  // Space handlers
  const handleCreateSpace = useCallback(() => {
    setSpaceToEdit(null);
    setShowSpaceEditDialog(true);
  }, []);

  const handleEditSpace = useCallback((space: Space) => {
    setSpaceToEdit(space);
    setShowSpaceEditDialog(true);
  }, []);

  const handleDeleteSpace = useCallback((space: Space) => {
    setSpaceToDelete(space);
    setShowSpaceDeleteDialog(true);
  }, []);

  // Audio dialog handler - query for last audible tab before opening
  const handleOpenAudioDialog = useCallback(async () => {
    // Check if we already have audible tabs
    const audibleTabs = tabs.filter(t => t.audible);
    if (audibleTabs.length > 0)
    {
      setLastAudibleTab(undefined);
      setShowAudioDialog(true);
      return;
    }

    // No audible tabs - query background for last audible tab
    try
    {
      const response = await chrome.runtime.sendMessage({ action: 'get-last-audible-tab' });
      if (response?.tabId)
      {
        const tab = tabs.find(t => t.id === response.tabId);
        setLastAudibleTab(tab);
      }
      else
      {
        setLastAudibleTab(undefined);
      }
    }
    catch
    {
      setLastAudibleTab(undefined);
    }
    setShowAudioDialog(true);
  }, [tabs]);

  // DropdownMenu handles click-outside and escape key automatically

  // Listen for navigate-spaces command
  useEffect(() =>
  {
    const handleCommand = (command: string) =>
    {
      if (command === 'navigate-spaces')
      {
        setShowSpaceNavigator(true);
      }
    };

    chrome.commands.onCommand.addListener(handleCommand);
    return () => chrome.commands.onCommand.removeListener(handleCommand);
  }, []);

  return (
    <FontSizeContext.Provider value={fontSize}>
      <BookmarkTabsProvider>
      <SpacesProvider>
      <SelectionProvider>
      <div
        className="relative flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden"
        style={{ fontSize: `${fontSize}px` }}
      >
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={{
          fontSize,
          hideOtherBookmarks,
          sortGroupsFirst,
          pinnedIconSize,
          bookmarkOpenMode,
          useSpaces: spacesEnabled,
        }}
        onApply={handleApplySettings}
      />

      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
        onShowWelcome={() => setShowWelcome(true)}
      />

      <ExportDialogWrapper
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        pinnedSites={pinnedSites}
        bookmarks={bookmarks}
      />

      <ImportDialogWrapper
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        replacePinnedSites={replacePinnedSites}
        appendPinnedSites={appendPinnedSites}
      />

      <WelcomeDialog
        isOpen={!hasSeenWelcome || showWelcome}
        onClose={() => {
          setHasSeenWelcome(true);
          setShowWelcome(false);
        }}
      />

      <AudioTabsDialog
        isOpen={showAudioDialog}
        tabs={tabs.filter(t => t.audible)}
        lastAudibleTab={lastAudibleTab}
        onTabSelect={(tabId) =>
        {
          activateTab(tabId);
        }}
        onClose={() => setShowAudioDialog(false)}
      />

      {/* Toolbar */}
      <div ref={toolbarRef} className="relative">
        <Toolbar
          filterLiveTabsActive={filterLiveTabs}
          onFilterLiveTabsToggle={() =>
          {
            const newValue = !filterLiveTabs;
            setFilterLiveTabs(newValue);
          }}
          onAudioDialogOpen={handleOpenAudioDialog}
          onMenuToggle={() => setShowMenu(!showMenu)}
          menuButtonRef={buttonRef}
          filterText={filterText}
          onFilterTextChange={handleFilterTextChange}
          savedFilters={savedFilters}
          recentFilters={recentFilters}
          onSaveFilter={handleSaveFilter}
          onDeleteSavedFilter={handleDeleteSavedFilter}
          onApplyFilter={handleApplyFilter}
          onUpdateRecent={handleUpdateRecent}
          onShowToast={showToast}
          onResetFilters={handleResetFilters}
          showFilterArea={showFilterArea}
          onToggleFilterArea={() => {
            const newShowFilterArea = !showFilterArea;
            setShowFilterArea(newShowFilterArea);
            if (!newShowFilterArea)
            {
              setFilterText('');
            }
          }}
        />

        {/* Settings popup menu */}
        <DropdownMenu.Root
          open={showMenu}
          onOpenChange={setShowMenu}
          anchorRef={buttonRef}
        >
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onSelect={() => setShowSettings(true)}>
              <Settings size={14} className="mr-2" />
              Settings
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => setShowExport(true)}>
              <Upload size={14} className="mr-2" />
              Export...
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => {
              setShowImport(false);
              setTimeout(() => setShowImport(true), 0);
            }}>
              <Download size={14} className="mr-2" />
              Import...
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => setShowAbout(true)}>
              <Info size={14} className="mr-2" />
              About
            </DropdownMenu.Item>
            {import.meta.env.DEV && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => chrome.runtime.reload()}>
                  <RefreshCw size={14} className="mr-2" />
                  Reload Extension
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* Pinned Sites */}
      <PinnedBar
        pinnedSites={pinnedSites}
        removePin={removePin}
        updatePin={updatePin}
        resetFavicon={resetFavicon}
        movePin={movePin}
        duplicatePin={duplicatePin}
        iconSize={pinnedIconSize}
        bookmarkOpenMode={bookmarkOpenMode}
        filterLiveTabs={filterLiveTabs}
        filterText={filterText}
      />

      {/* Space Title */}
      <SpaceTitleWrapper
        onEditSpace={handleEditSpace}
        onDeleteSpace={handleDeleteSpace}
      />

      {/* Content with 2-finger swipe navigation */}
      <SwipeableContainer
        onPin={addPin}
        hideOtherBookmarks={hideOtherBookmarks}
        externalDropTarget={externalDropTarget}
        bookmarkOpenMode={bookmarkOpenMode}
        onResolverReady={(fn) => { bookmarkDropResolverRef.current = fn; }}
        filterLiveTabs={filterLiveTabs}
        filterText={filterText}
        sortGroupsFirst={sortGroupsFirst}
        useSpaces={spacesEnabled}
        onExternalDropTargetChange={setExternalDropTarget}
        resolveBookmarkDropTarget={() => bookmarkDropResolverRef.current}
        onShowToast={showToast}
        onSpaceDropTargetChange={setSpaceDropTargetId}
      />

      {/* Space Dialogs */}
      <SpaceDialogs
        showEditDialog={showSpaceEditDialog}
        spaceToEdit={spaceToEdit}
        onCloseEditDialog={() => setShowSpaceEditDialog(false)}
        showDeleteDialog={showSpaceDeleteDialog}
        spaceToDelete={spaceToDelete}
        onCloseDeleteDialog={() => setShowSpaceDeleteDialog(false)}
      />

      {/* Space Navigator Dialog */}
      <SpaceNavigatorDialog
        isOpen={showSpaceNavigator}
        onClose={() => setShowSpaceNavigator(false)}
      />

      {/* Space Bar - only shown when useSpaces is enabled */}
      {spacesEnabled && (
        <SpaceBar
          onCreateSpace={handleCreateSpace}
          onEditSpace={handleEditSpace}
          onDeleteSpace={handleDeleteSpace}
          dropTargetSpaceId={spaceDropTargetId}
        />
      )}

      <Toast
        message={toastMessage}
        isVisible={toastVisible}
        onDismiss={hideToast}
      />
      </div>
      </SelectionProvider>
      </SpacesProvider>
      </BookmarkTabsProvider>
    </FontSizeContext.Provider>
  );
}

export default App;
