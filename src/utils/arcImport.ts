import { PinnedSite } from '../hooks/usePinnedSites';
import { Space } from '../contexts/SpacesContext';
import { importBookmarkNode, ImportResult } from './backupRestore';
import { toChromeColor } from './groupColors';

// =============================================================================
// Types
// =============================================================================

export interface ArcTab
{
  url: string;
  title: string;
  emoji?: string;
  iconName?: string;              // Lucide icon name in kebab-case
}

export interface ArcFolder
{
  name: string;
  children: ArcNode[];
}

export type ArcNode =
  | { type: 'tab'; tab: ArcTab }
  | { type: 'folder'; folder: ArcFolder };

export interface ArcSpace
{
  name: string;
  emoji?: string;
  iconName?: string;              // Lucide icon name in kebab-case (e.g. "database")
  hexColor?: string;
  pinnedItems: ArcNode[];
  unpinnedTabs: ArcTab[];
}

export interface ArcImportData
{
  topApps: ArcTab[];
  spaces: ArcSpace[];
  skippedCount: number;
}

export interface ArcImportOptions
{
  importTopApps: boolean;
  topAppsMode: 'append' | 'replace';
  importSpaces: boolean;
  spacesMode: 'append' | 'replace';
  importUnpinnedTabs: boolean;
}

export interface ArcImportResult extends ImportResult
{
  spacesCreated: number;
  spacesMerged: number;
  tabsOpened: number;
  notes: string[];
}

// =============================================================================
// Parser — pure functions
// =============================================================================

// Parse alternating [id, obj, id, obj, ...] array into a Map
function parseAlternatingArray(arr: unknown[]): Map<string, Record<string, unknown>>
{
  const map = new Map<string, Record<string, unknown>>();
  for (let i = 0; i + 1 < arr.length; i += 2)
  {
    const id = arr[i];
    const obj = arr[i + 1];
    if (typeof id === 'string' && typeof obj === 'object' && obj !== null)
    {
      map.set(id, obj as Record<string, unknown>);
    }
  }
  return map;
}

// Resolve pinned/unpinned container IDs from containerIDs array
// Format: ['pinned', '<pinnedId>', 'unpinned', '<unpinnedId>']
function resolveContainerIds(containerIDs: unknown[]): { pinnedId?: string; unpinnedId?: string }
{
  let pinnedId: string | undefined;
  let unpinnedId: string | undefined;

  for (let i = 0; i < containerIDs.length - 1; i++)
  {
    if (containerIDs[i] === 'pinned' && typeof containerIDs[i + 1] === 'string')
    {
      pinnedId = containerIDs[i + 1] as string;
    }
    if (containerIDs[i] === 'unpinned' && typeof containerIDs[i + 1] === 'string')
    {
      unpinnedId = containerIDs[i + 1] as string;
    }
  }

  return { pinnedId, unpinnedId };
}

// Map Arc icon names to Lucide icon names
// Arc icon names extracted from Arc.app binary
const ARC_ICON_TO_LUCIDE: Record<string, string> =
{
  // row 1
  star: 'star',
  bookmark: 'bookmark',
  heart: 'heart',
  flag: 'flag',
  flash: 'zap',
  triangle: 'triangle',
  medical: 'asterisk',
  notifications: 'bell',

  // row 2
  bulb: 'lightbulb',
  shapes: 'shapes',
  grid: 'layout-grid',
  apps: 'grid-3x3',
  layers: 'layers',
  server: 'database',
  albums: 'gallery-vertical-end',
  copy: 'copy',

  // row 3
  folder: 'folder-closed',
  fileTrayFull: 'archive',
  calendar: 'calendar-days',
  mail: 'mail',
  checkbox: 'square-check-big',
  document: 'file',
  book: 'book-open',
  chatBubbleEllipses: 'message-circle-more',

  // row 4
  people: 'users',
  terminal: 'square-terminal',
  construction: 'wrench',
  square: 'square',
  egg: 'egg',
  ellipse: 'circle',
  moon: 'moon',
  sunny: 'sun',

  // row 5
  planet: 'globe',
  leaf: 'leaf',
  cloud: 'cloud',
  paw: 'paw-print',
  bag: 'shopping-bag',
  gift: 'gift',
  bed: 'bed-double',
  restaurant: 'utensils-crossed',

  // row 6
  barbell: 'dumbbell',
  airplane: 'plane',
  musicalNote: 'music',
  colorPallete: 'palette',
  video: 'video',
  bandage: 'bandage',
  code: 'code',
  baseball: 'volleyball',

  // row 7
  cloudOutline: 'cloud',
  map: 'map',
  bonfire: 'flame',
  pizza: 'pizza',
  skull: 'skull',
  receipt: 'receipt-text',
  thumbsUp: 'thumbs-up',
  train: 'train-front',

  // other
  briefcase: 'archive',
  envelope: 'mail',
  file: 'file',
  cursor: 'mouse-pointer',
  disk: 'save',
  stop: 'square',
  tools: 'wrench',
  pencil: 'pencil',
  message: 'message-square',
  users: 'users',
  github: 'github',
  anchored: 'anchor',
  circle: 'circle',
};

// Convert Arc icon name to Lucide icon name
function arcIconToLucide(arcName: string): string
{
  return ARC_ICON_TO_LUCIDE[arcName] || 'folder';
}

// Convert Arc's extendedSRGB color {red, green, blue} (0-1 range) to hex string
function arcRgbToHex(color: { red?: number; green?: number; blue?: number }): string
{
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const r = clamp(color.red ?? 0);
  const g = clamp(color.green ?? 0);
  const b = clamp(color.blue ?? 0);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Check if an item is a live folder (should be skipped)
function isLiveFolder(item: Record<string, unknown>): boolean
{
  const data = item.data as Record<string, unknown> | undefined;
  if (!data) return false;
  const list = data.list as Record<string, unknown> | undefined;
  return list !== undefined && 'automaticLiveFolderData' in list;
}

// Check if an item is a folder (has list data, not live)
function isFolder(item: Record<string, unknown>): boolean
{
  const data = item.data as Record<string, unknown> | undefined;
  if (!data) return false;
  return 'list' in data && !isLiveFolder(item);
}

// Extract tab data from an item
function extractTab(item: Record<string, unknown>): ArcTab | null
{
  const data = item.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const tab = data.tab as Record<string, unknown> | undefined;
  if (!tab) return null;

  const url = (tab.savedURL as string) || '';
  const title = (item.title as string) || (tab.savedTitle as string) || '';

  if (!url) return null;

  // Extract icon from tab's customInfo.iconType
  const customInfo = tab.customInfo as Record<string, unknown> | undefined;
  const iconType = customInfo?.iconType as Record<string, unknown> | undefined;
  const emoji = iconType?.emoji_v2 as string | undefined;
  const arcIconName = iconType?.icon as string | undefined;
  const iconName = arcIconName ? arcIconToLucide(arcIconName) : undefined;

  return { url, title, emoji, iconName };
}

// Build item tree recursively from a container ID
// Uses childrenIds for ordering, falls back to parentID scan
function buildItemTree(
  containerId: string,
  itemMap: Map<string, Record<string, unknown>>,
  skippedCount: { value: number }
): ArcNode[]
{
  const nodes: ArcNode[] = [];

  // Find direct children of this container, ordered by childrenIds if available
  // First check if the container itself is an item with childrenIds
  const containerItem = itemMap.get(containerId);
  const childrenIds = containerItem
    ? (containerItem.childrenIds as string[] | undefined) || []
    : [];

  // If container has childrenIds, use that ordering
  if (childrenIds.length > 0)
  {
    for (const childId of childrenIds)
    {
      const child = itemMap.get(childId);
      if (!child) continue;
      const node = buildNodeFromItem(childId, child, itemMap, skippedCount);
      if (node) nodes.push(node);
    }
  }
  else
  {
    // Fall back to scanning by parentID
    for (const [itemId, item] of itemMap)
    {
      if (item.parentID === containerId)
      {
        const node = buildNodeFromItem(itemId, item, itemMap, skippedCount);
        if (node) nodes.push(node);
      }
    }
  }

  return nodes;
}

// Build a single ArcNode from an Arc item
function buildNodeFromItem(
  itemId: string,
  item: Record<string, unknown>,
  itemMap: Map<string, Record<string, unknown>>,
  skippedCount: { value: number }
): ArcNode | null
{
  if (isLiveFolder(item))
  {
    skippedCount.value++;
    return null;
  }

  if (isFolder(item))
  {
    const children = buildItemTree(itemId, itemMap, skippedCount);
    const name = (item.title as string) || 'Untitled Folder';
    return { type: 'folder', folder: { name, children } };
  }

  const tab = extractTab(item);
  if (tab)
  {
    return { type: 'tab', tab };
  }

  return null;
}

// Validate and detect Arc sidebar format
export function isArcSidebar(json: unknown): boolean
{
  if (typeof json !== 'object' || json === null) return false;
  const obj = json as Record<string, unknown>;
  const sidebar = obj.sidebar as Record<string, unknown> | undefined;
  if (!sidebar) return false;
  const containers = sidebar.containers as unknown[] | undefined;
  return Array.isArray(containers) && containers.length >= 2;
}

// Main parser entry point
export function parseArcSidebar(json: unknown): ArcImportData
{
  if (!isArcSidebar(json))
  {
    throw new Error('Not a valid Arc StorableSidebar.json file');
  }

  const obj = json as Record<string, unknown>;
  const sidebar = obj.sidebar as Record<string, unknown>;
  const containers = sidebar.containers as Record<string, unknown>[];
  const container = containers[1];

  const itemsArr = container.items as unknown[] || [];
  const spacesArr = container.spaces as unknown[] || [];
  const topAppsContainerIDs = container.topAppsContainerIDs as unknown[] || [];

  const itemMap = parseAlternatingArray(itemsArr);
  const spaceMap = parseAlternatingArray(spacesArr);
  const skippedCount = { value: 0 };

  // Parse top apps
  // topAppsContainerIDs: [{default: true}, '<containerId>']
  let topAppsContainerId: string | undefined;
  for (const entry of topAppsContainerIDs)
  {
    if (typeof entry === 'string')
    {
      topAppsContainerId = entry;
      break;
    }
  }

  const topApps: ArcTab[] = [];
  if (topAppsContainerId)
  {
    // Find items whose parentID is the top apps container
    for (const [, item] of itemMap)
    {
      if (item.parentID === topAppsContainerId)
      {
        const tab = extractTab(item);
        if (tab) topApps.push(tab);
      }
    }
  }

  // Parse spaces
  const spaces: ArcSpace[] = [];
  for (const [, spaceObj] of spaceMap)
  {
    const name = (spaceObj.title as string) || 'Untitled';
    const containerIDs = (spaceObj.containerIDs as unknown[]) || [];
    const customInfo = (spaceObj.customInfo as Record<string, unknown>) || {};

    // Extract emoji and icon name
    const iconType = customInfo.iconType as Record<string, unknown> | undefined;
    const emoji = iconType?.emoji_v2 as string | undefined;
    // Map Arc icon name to Lucide icon name
    const arcIconName = iconType?.icon as string | undefined;
    const iconName = arcIconName ? arcIconToLucide(arcIconName) : undefined;

    // Extract hex color from windowTheme.primaryColorPalette.midTone
    let hexColor: string | undefined;
    const windowTheme = customInfo.windowTheme as Record<string, unknown> | undefined;
    if (windowTheme)
    {
      const pcp = windowTheme.primaryColorPalette as Record<string, unknown> | undefined;
      if (pcp)
      {
        const midTone = pcp.midTone as { red?: number; green?: number; blue?: number } | undefined;
        if (midTone)
        {
          hexColor = arcRgbToHex(midTone);
        }
      }
    }

    // Resolve pinned/unpinned container IDs
    const { pinnedId, unpinnedId } = resolveContainerIds(containerIDs);

    // Build pinned items tree
    const pinnedItems = pinnedId
      ? buildItemTree(pinnedId, itemMap, skippedCount)
      : [];

    // Build unpinned tabs (flat, no folders)
    const unpinnedTabs: ArcTab[] = [];
    if (unpinnedId)
    {
      for (const [, item] of itemMap)
      {
        if (item.parentID === unpinnedId)
        {
          const tab = extractTab(item);
          if (tab) unpinnedTabs.push(tab);
        }
      }
    }

    spaces.push({ name, emoji, iconName, hexColor, pinnedItems, unpinnedTabs });
  }

  const result = { topApps, spaces, skippedCount: skippedCount.value };

  if (import.meta.env.DEV)
  {
    debugLogParsedData(result);
  }

  return result;
}

// =============================================================================
// Debug logging (dev builds only)
// =============================================================================

function debugLogNodeTree(nodes: ArcNode[], indent: string): void
{
  for (const node of nodes)
  {
    if (node.type === 'tab')
    {
      const iconInfo = node.tab.emoji ? ` emoji=${node.tab.emoji}` : node.tab.iconName ? ` icon=${node.tab.iconName}` : '';
      console.log(`${indent}[tab] "${node.tab.title}"${iconInfo} -> ${node.tab.url}`);
    }
    else
    {
      console.log(`${indent}[folder] "${node.folder.name}" (${node.folder.children.length} children)`);
      debugLogNodeTree(node.folder.children, indent + '  ');
    }
  }
}

function debugLogParsedData(data: ArcImportData): void
{
  console.group('[ArcImport] Parsed data');

  console.group(`Top Apps (${data.topApps.length})`);
  for (const app of data.topApps)
  {
    const iconInfo = app.emoji ? ` emoji=${app.emoji}` : app.iconName ? ` icon=${app.iconName}` : '';
    console.log(`"${app.title}"${iconInfo} -> ${app.url}`);
  }
  console.groupEnd();

  console.group(`Spaces (${data.spaces.length})`);
  for (const space of data.spaces)
  {
    const meta = [
      space.emoji ? `emoji=${space.emoji}` : null,
      space.iconName ? `icon=${space.iconName}` : null,
      space.hexColor ? `color=${space.hexColor}` : null,
    ].filter(Boolean).join(', ');
    console.group(`"${space.name}"${meta ? ` (${meta})` : ''}`);

    if (space.pinnedItems.length > 0)
    {
      console.group(`Pinned (${space.pinnedItems.length} top-level)`);
      debugLogNodeTree(space.pinnedItems, '');
      console.groupEnd();
    }

    if (space.unpinnedTabs.length > 0)
    {
      console.group(`Unpinned (${space.unpinnedTabs.length})`);
      for (const tab of space.unpinnedTabs)
      {
        console.log(`"${tab.title}" -> ${tab.url}`);
      }
      console.groupEnd();
    }

    console.groupEnd();
  }
  console.groupEnd();

  if (data.skippedCount > 0)
  {
    console.log(`Skipped: ${data.skippedCount} live folders`);
  }

  console.groupEnd();
}

// =============================================================================
// Summary helpers (for preview)
// =============================================================================

function countNodes(nodes: ArcNode[]): number
{
  let count = 0;
  for (const node of nodes)
  {
    if (node.type === 'tab')
    {
      count++;
    }
    else
    {
      count++; // count the folder itself
      count += countNodes(node.folder.children);
    }
  }
  return count;
}

export function getImportSummary(data: ArcImportData):
{
  topAppsCount: number;
  spacesCount: number;
  pinnedItemsCount: number;
  unpinnedTabsCount: number;
  skippedCount: number;
}
{
  let pinnedItemsCount = 0;
  let unpinnedTabsCount = 0;
  for (const space of data.spaces)
  {
    pinnedItemsCount += countNodes(space.pinnedItems);
    unpinnedTabsCount += space.unpinnedTabs.length;
  }

  return {
    topAppsCount: data.topApps.length,
    spacesCount: data.spaces.length,
    pinnedItemsCount,
    unpinnedTabsCount,
    skippedCount: data.skippedCount,
  };
}

// =============================================================================
// Import executor
// =============================================================================

// Round-robin color assignment for spaces without a custom color
const SPACE_COLORS: string[] = [
  'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey',
];

// Generate a unique ID for a new space
const generateSpaceId = (): string =>
  `space_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

// Generate a unique ID for a pinned site
const generatePinId = (): string =>
  `pin_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Convert ArcNode tree to Chrome BookmarkTreeNode shape
function arcNodeToBookmarkNode(node: ArcNode): chrome.bookmarks.BookmarkTreeNode
{
  if (node.type === 'tab')
  {
    return {
      id: '',
      title: node.tab.title,
      url: node.tab.url,
    };
  }
  else
  {
    return {
      id: '',
      title: node.folder.name,
      children: node.folder.children.map(arcNodeToBookmarkNode),
    };
  }
}

// Walk Chrome bookmark tree to find a folder by path (e.g. "Other Bookmarks/Movies")
async function findBookmarkFolderByPath(path: string): Promise<string | null>
{
  if (!path) return null;

  const parts = path.split('/');
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0]?.children || [];

  let current = roots.find(r => r.title === parts[0]);
  if (!current) return null;

  // Walk remaining parts
  for (let i = 1; i < parts.length; i++)
  {
    const children: chrome.bookmarks.BookmarkTreeNode[] = current.children || [];
    const found = children.find(c => c.title === parts[i] && !c.url);
    if (!found) return null;
    current = found;
  }

  return current.id;
}

// Create a bookmark folder under Other Bookmarks, return its ID and path
async function createBookmarkFolder(name: string): Promise<{ id: string; path: string }>
{
  const folder = await chrome.bookmarks.create({
    parentId: '2', // Other Bookmarks
    title: name,
  });
  return { id: folder.id, path: `Other Bookmarks/${name}` };
}

export interface ArcImportCallbacks
{
  replacePinnedSites: (sites: PinnedSite[]) => void;
  appendPinnedSites: (sites: PinnedSite[]) => void;
  replaceSpaces: (spaces: Space[]) => void;
  appendSpaces: (spaces: Space[]) => void;
  existingSpaces: Space[];
}

export async function importArcData(
  data: ArcImportData,
  options: ArcImportOptions,
  callbacks: ArcImportCallbacks
): Promise<ArcImportResult>
{
  if (import.meta.env.DEV)
  {
    console.group('[ArcImport] importArcData');
    console.log('Options:', options);
    console.log('Existing spaces:', callbacks.existingSpaces.map(s => `"${s.name}" (${s.bookmarkFolderPath})`));
  }

  const result: ArcImportResult = {
    pinnedSitesCount: 0,
    bookmarksCount: 0,
    tabGroupsCount: 0,
    spacesCount: 0,
    spacesCreated: 0,
    spacesMerged: 0,
    tabsOpened: 0,
    notes: [],
  };

  // ─── Step 1: Top Apps → Pinned Sites ───
  if (options.importTopApps && data.topApps.length > 0)
  {
    // Favicon/icon resolution is handled lazily by usePinnedSites hook.
    // Just store metadata here.
    const sites: PinnedSite[] = data.topApps.map((tab) => ({
      id: generatePinId(),
      url: tab.url,
      title: tab.title,
      ...(tab.emoji ? { emoji: tab.emoji } : {}),
      ...(tab.iconName ? { customIconName: tab.iconName } : {}),
    }));

    if (options.topAppsMode === 'replace')
    {
      callbacks.replacePinnedSites(sites);
    }
    else
    {
      callbacks.appendPinnedSites(sites);
    }
    result.pinnedSitesCount = sites.length;
  }

  // ─── Step 2: Spaces + Bookmarks ───
  if (options.importSpaces && data.spaces.length > 0)
  {
    const newSpaces: Space[] = [];
    let colorIndex = 0;

    if (options.spacesMode === 'replace')
    {
      // Replace mode: create all new spaces + bookmark folders
      for (const arcSpace of data.spaces)
      {
        const color = arcSpace.hexColor || SPACE_COLORS[colorIndex % SPACE_COLORS.length];
        colorIndex++;

        const icon = arcSpace.emoji || arcSpace.iconName || 'folder';
        const { id: folderId, path: folderPath } = await createBookmarkFolder(arcSpace.name);

        // Import pinned items as bookmarks
        for (const node of arcSpace.pinnedItems)
        {
          const bmNode = arcNodeToBookmarkNode(node);
          result.bookmarksCount += await importBookmarkNode(bmNode, folderId);
        }

        newSpaces.push({
          id: generateSpaceId(),
          name: arcSpace.name,
          icon,
          color,
          bookmarkFolderPath: folderPath,
        });
      }

      callbacks.replaceSpaces(newSpaces);
      result.spacesCount = newSpaces.length;
      result.spacesCreated = newSpaces.length;
      result.notes.push('Existing bookmarks were not modified');
    }
    else
    {
      // Append mode: match by name (case-insensitive) or create new
      const existingByName = new Map<string, Space>();
      for (const s of callbacks.existingSpaces)
      {
        existingByName.set(s.name.toLowerCase(), s);
      }

      for (const arcSpace of data.spaces)
      {
        const match = existingByName.get(arcSpace.name.toLowerCase());

        if (match)
        {
          // Merge into existing space's bookmark folder
          const folderId = await findBookmarkFolderByPath(match.bookmarkFolderPath);
          if (folderId)
          {
            for (const node of arcSpace.pinnedItems)
            {
              const bmNode = arcNodeToBookmarkNode(node);
              result.bookmarksCount += await importBookmarkNode(bmNode, folderId);
            }
          }
          else
          {
            // Folder not found, create new one
            const { id: newFolderId } = await createBookmarkFolder(arcSpace.name);
            for (const node of arcSpace.pinnedItems)
            {
              const bmNode = arcNodeToBookmarkNode(node);
              result.bookmarksCount += await importBookmarkNode(bmNode, newFolderId);
            }
            result.notes.push(`Folder for "${match.name}" not found, created new one`);
          }
          result.spacesMerged++;
        }
        else
        {
          // Create new space + bookmark folder
          const color = arcSpace.hexColor || SPACE_COLORS[colorIndex % SPACE_COLORS.length];
          colorIndex++;

          const icon = arcSpace.emoji || arcSpace.iconName || 'folder';
          const { id: folderId, path: folderPath } = await createBookmarkFolder(arcSpace.name);

          for (const node of arcSpace.pinnedItems)
          {
            const bmNode = arcNodeToBookmarkNode(node);
            result.bookmarksCount += await importBookmarkNode(bmNode, folderId);
          }

          newSpaces.push({
            id: generateSpaceId(),
            name: arcSpace.name,
            icon,
            color,
            bookmarkFolderPath: folderPath,
          });
          result.spacesCreated++;
        }
      }

      if (newSpaces.length > 0)
      {
        callbacks.appendSpaces(newSpaces);
      }
      result.spacesCount = data.spaces.length;
    }
  }

  // ─── Step 3: Unpinned tabs (optional) ───
  if (options.importUnpinnedTabs)
  {
    let colorIndex = 0;
    for (const arcSpace of data.spaces)
    {
      if (arcSpace.unpinnedTabs.length === 0) continue;

      const createdTabIds: number[] = [];
      for (const tab of arcSpace.unpinnedTabs)
      {
        const created = await chrome.tabs.create({
          url: tab.url,
          active: false,
        });
        if (created.id) createdTabIds.push(created.id);
      }

      if (createdTabIds.length > 0)
      {
        const firstTab = await chrome.tabs.get(createdTabIds[0]);
        const groupId = await chrome.tabs.group({
          tabIds: createdTabIds,
          createProperties: { windowId: firstTab.windowId },
        });
        const groupColor = arcSpace.hexColor
          ? toChromeColor(arcSpace.hexColor)
          : toChromeColor(SPACE_COLORS[colorIndex % SPACE_COLORS.length]);
        await chrome.tabGroups.update(groupId, {
          title: arcSpace.name,
          color: groupColor,
        });
        result.tabsOpened += createdTabIds.length;
      }
      colorIndex++;
    }
  }

  if (import.meta.env.DEV)
  {
    console.log('Import result:', result);
    console.groupEnd();
  }

  return result;
}
