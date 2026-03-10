// Shared functions for tab association storage
// Used by both background.ts and BookmarkTabsContext.tsx

// Storage key helper
const getStorageKey = (windowId: number) => `tabAssociations_${windowId}`;

// Get all associations for a window
export async function getTabAssociations(windowId: number): Promise<Record<number, string>>
{
  const key = getStorageKey(windowId);
  const result = await chrome.storage.session.get(key);
  return result[key] || {};
}

// Check if a tab is managed (has an association)
export async function isManagedTab(windowId: number, tabId: number): Promise<boolean>
{
  const associations = await getTabAssociations(windowId);
  return tabId in associations;
}

// Check if a tab is a pinned-site managed tab
export async function isPinnedManagedTab(windowId: number, tabId: number): Promise<boolean>
{
  const associations = await getTabAssociations(windowId);
  const itemKey = associations[tabId];
  return itemKey !== undefined && itemKey.startsWith('pinned-');
}

// Store an association
export async function storeTabAssociation(
  windowId: number,
  tabId: number,
  itemKey: string
): Promise<void>
{
  const key = getStorageKey(windowId);
  const associations = await getTabAssociations(windowId);
  associations[tabId] = itemKey;
  await chrome.storage.session.set({ [key]: associations });
}

// Remove an association
export async function removeTabAssociation(windowId: number, tabId: number): Promise<void>
{
  const key = getStorageKey(windowId);
  const associations = await getTabAssociations(windowId);
  delete associations[tabId];
  await chrome.storage.session.set({ [key]: associations });
}

// Set all associations for a window (used during rebuild)
export async function setTabAssociations(
  windowId: number,
  associations: Record<number, string>
): Promise<void>
{
  const key = getStorageKey(windowId);
  await chrome.storage.session.set({ [key]: associations });
}

// =============================================================================
// Local storage backup (persists across browser restarts)
// One storage entry per window + a separate index of all window IDs.
// =============================================================================

const BACKUP_KEY_PREFIX = 'tabAssociationsBackup_';
const BACKUP_WINDOW_IDS_KEY = 'tabAssociationsBackupWindowIds';

export interface TabAssociationBackupEntry
{
  tabId: number;
  url: string;
  tabIndex: number;
}

// itemKey → { tabId, url, tabIndex } for one window
export type WindowAssociationBackup = Record<string, TabAssociationBackupEntry>;

const backupKey = (windowId: number) => `${BACKUP_KEY_PREFIX}${windowId}`;

function getDomain(url: string): string
{
  try
  {
    return new URL(url).hostname;
  }
  catch
  {
    return '';
  }
}

// Return backup entries whose URL has a parseable domain
function backupEntriesWithDomain(backup: WindowAssociationBackup): [string, TabAssociationBackupEntry][]
{
  return Object.entries(backup).filter(([, e]) => getDomain(e.url) !== '');
}

function formatBackup(backup: WindowAssociationBackup): string
{
  const entries = Object.entries(backup);
  if (entries.length === 0) return '  (empty)';
  return entries.map(([key, e]) => `  ${key}: tabId=${e.tabId}, tabIndex=${e.tabIndex}, url=${e.url}`).join('\n');
}

// Read the backup for a single window from local storage
async function getWindowBackup(windowId: number): Promise<WindowAssociationBackup>
{
  const key = backupKey(windowId);
  const result = await chrome.storage.local.get(key);
  return result[key] ?? {};
}

async function getBackupWindowIds(): Promise<number[]>
{
  const result = await chrome.storage.local.get(BACKUP_WINDOW_IDS_KEY);
  return result[BACKUP_WINDOW_IDS_KEY] ?? [];
}

async function addBackupWindowId(windowId: number): Promise<void>
{
  const ids = await getBackupWindowIds();
  if (!ids.includes(windowId))
  {
    await chrome.storage.local.set({ [BACKUP_WINDOW_IDS_KEY]: [...ids, windowId] });
  }
}

// Remove backup data for windows that no longer exist and return the cleaned list.
async function pruneStaleBackupWindowIds(ids: number[]): Promise<number[]>
{
  const existingWindows = await chrome.windows.getAll();
  const existingIds = new Set(existingWindows.map(w => w.id!));

  const staleIds = ids.filter(id => !existingIds.has(id));
  if (staleIds.length > 0)
  {
    await chrome.storage.local.remove(staleIds.map(id => backupKey(id)));
    if (import.meta.env.DEV)
    {
      console.log('[TabAssociationBackup] pruned stale windows:', staleIds);
    }
  }

  return ids.filter(id => existingIds.has(id));
}

async function removeBackupWindowId(windowId: number): Promise<void>
{
  const ids = await getBackupWindowIds();
  const pruned = await pruneStaleBackupWindowIds(ids);
  const filtered = pruned.filter(id => id !== windowId);
  if (filtered.length !== ids.length)
  {
    await chrome.storage.local.set({ [BACKUP_WINDOW_IDS_KEY]: filtered });
  }
  await chrome.storage.local.remove(backupKey(windowId));
}

// Remove all backup entries for a window
export async function removeWindowAssociationBackup(windowId: number): Promise<void>
{
  await removeBackupWindowId(windowId);
  if (import.meta.env.DEV)
  {
    console.log('[TabAssociationBackup] removeWindow', windowId);
  }
}

export async function saveTabAssociationBackup(
  windowId: number,
  itemKey: string,
  entry: TabAssociationBackupEntry
): Promise<void>
{
  const windowBackup = await getWindowBackup(windowId);
  windowBackup[itemKey] = entry;
  await chrome.storage.local.set({ [backupKey(windowId)]: windowBackup });
  await addBackupWindowId(windowId);
  if (import.meta.env.DEV)
  {
    console.log(`[TabAssociationBackup] save window=${windowId} ${itemKey}\n${formatBackup(windowBackup)}`);
  }
}

export async function removeTabAssociationBackup(
  windowId: number,
  itemKey: string
): Promise<void>
{
  const windowBackup = await getWindowBackup(windowId);
  if (!(itemKey in windowBackup)) return;
  delete windowBackup[itemKey];
  if (Object.keys(windowBackup).length === 0)
  {
    await removeWindowAssociationBackup(windowId);
  }
  else
  {
    await chrome.storage.local.set({ [backupKey(windowId)]: windowBackup });
  }
  if (import.meta.env.DEV)
  {
    console.log(`[TabAssociationBackup] remove window=${windowId} ${itemKey}\n${formatBackup(windowBackup)}`);
  }
}

// Patch tabIndex for multiple entries in one read-modify-write.
// itemKeyToIndex: itemKey → new tabIndex
export async function updateTabAssociationBackupIndices(
  windowId: number,
  itemKeyToIndex: Record<string, number>
): Promise<void>
{
  const windowBackup = await getWindowBackup(windowId);
  let changed = false;

  for (const [itemKey, tabIndex] of Object.entries(itemKeyToIndex))
  {
    const entry = windowBackup[itemKey];
    if (!entry || entry.tabIndex === tabIndex) continue;
    windowBackup[itemKey] = { ...entry, tabIndex };
    changed = true;
  }

  if (!changed) return;

  await chrome.storage.local.set({ [backupKey(windowId)]: windowBackup });
  if (import.meta.env.DEV)
  {
    console.log(`[TabAssociationBackup] updateIndices window=${windowId}\n${formatBackup(windowBackup)}`);
  }
}

type MatchType = 'direct' | 'index+domain' | 'domain';

interface WindowMatch
{
  currentId: number;
  matchType: MatchType;
  // itemKey → tabId for tabs that were matched
  tabMatches: Record<string, number>;
}

// Shared state threaded through all matching passes
interface MatchContext
{
  result: Map<number, WindowMatch>;
  claimedWindowIds: Set<number>;
  backups: Map<number, WindowAssociationBackup>;
  allWindows: chrome.windows.Window[];
}

// Pass 1: direct match — backup window ID still exists.
// Tab IDs should also be preserved (extension reload), so match by stored tabId.
function matchDirect(ctx: MatchContext, backupIds: number[]): void
{
  const currentIds = new Set(ctx.allWindows.map(w => w.id!));

  // Try each backup window — if its ID still exists, match tabs by stored tabId
  for (const backupId of backupIds)
  {
    // Skip backups whose window ID no longer exists (needs fuzzy matching in later passes)
    if (!currentIds.has(backupId))
    {
      console.log(`[matchBackup] pass1: backup=${backupId} — window ID not found`);
      continue;
    }

    const backup = ctx.backups.get(backupId)!;
    const win = ctx.allWindows.find(w => w.id === backupId)!;
    const currentTabIds = new Set((win.tabs ?? []).map(t => t.id!));

    const tabMatches: Record<string, number> = {};
    const logLines: string[] = [];

    // Check each backup entry's stored tabId against the window's current tab IDs
    for (const [itemKey, entry] of Object.entries(backup))
    {
      if (currentTabIds.has(entry.tabId))
      {
        tabMatches[itemKey] = entry.tabId;
        logLines.push(`  ${itemKey}: tabId=${entry.tabId} ✓`);
      }
      else
      {
        logLines.push(`  ${itemKey}: tabId=${entry.tabId} — tab gone ✗`);
      }
    }

    ctx.result.set(backupId, { currentId: backupId, matchType: 'direct', tabMatches });
    ctx.claimedWindowIds.add(backupId);
    console.log(`[matchBackup] pass1: backup=${backupId} → direct (${Object.keys(tabMatches).length}/${Object.keys(backup).length} tabs)\n${logLines.join('\n')}`);
  }
}

// Pass 2: index+domain matching.
// Matches when a current window has a tab at the same index whose domain matches
// for every backup entry. Catches Chrome restoring tabs in the same positions
// with new IDs.
function matchByIndexAndDomain(ctx: MatchContext, backupIds: number[]): void
{
  const unmatched = backupIds.filter(id => !ctx.result.has(id));
  if (unmatched.length === 0) return;

  // Pre-compute index → { domain, tabId } for each unclaimed current window
  const windowTabsByIndex = new Map<number, Map<number, { domain: string; tabId: number }>>();
  for (const win of ctx.allWindows)
  {
    if (ctx.claimedWindowIds.has(win.id!))
      continue;

    const indexMap = new Map<number, { domain: string; tabId: number }>();
    for (const tab of win.tabs ?? [])
    {
      const domain = getDomain(tab.url ?? '');
      if (domain) indexMap.set(tab.index, { domain, tabId: tab.id! });
    }
    windowTabsByIndex.set(win.id!, indexMap);
  }

  // Try each unmatched backup against all unclaimed windows
  for (const backupId of unmatched)
  {
    const backup = ctx.backups.get(backupId)!;
    const entries = backupEntriesWithDomain(backup);
    if (entries.length === 0) continue;

    // Compare this backup's entries against each candidate window
    for (const [winId, indexMap] of windowTabsByIndex)
    {
      if (ctx.claimedWindowIds.has(winId)) continue;

      const tabMatches: Record<string, number> = {};
      const matchLines: string[] = [];
      const mismatchLines: string[] = [];

      // Check if every backup entry has a tab at the same index with matching domain
      for (const [itemKey, entry] of entries)
      {
        const backupDomain = getDomain(entry.url);
        const current = indexMap.get(entry.tabIndex);
        if (current && current.domain === backupDomain)
        {
          tabMatches[itemKey] = current.tabId;
          matchLines.push(`  [${entry.tabIndex}] ${backupDomain} → tabId=${current.tabId} ✓`);
        }
        else
        {
          mismatchLines.push(`  [${entry.tabIndex}] backup=${backupDomain} current=${current?.domain ?? '(none)'} ✗`);
        }
      }

      const allMatch = mismatchLines.length === 0;
      console.log(`[matchBackup] pass2: backup=${backupId} vs window=${winId} — ${allMatch ? 'MATCH' : 'no match'}\n${[...matchLines, ...mismatchLines].join('\n')}`);

      // All entries matched — claim this window and move to next backup
      if (allMatch)
      {
        ctx.result.set(backupId, { currentId: winId, matchType: 'index+domain', tabMatches });
        ctx.claimedWindowIds.add(winId);
        break;
      }
    }
  }
}

// Pass 3: domain-based matching for remaining backup windows.
// For each unmatched backup, scores current windows by domain overlap count.
// The window with the most overlapping domains wins. Tabs are matched by domain
// (first unclaimed tab with matching domain).
function matchByDomainOverlap(ctx: MatchContext, backupIds: number[]): void
{
  const unmatched = backupIds.filter(id => !ctx.result.has(id));
  if (unmatched.length === 0) return;

  const unclaimed = ctx.allWindows.filter(w => !ctx.claimedWindowIds.has(w.id!));
  if (unclaimed.length === 0) return;

  // Pre-compute domain → tabIds for unclaimed current windows
  const windowDomainTabs = new Map<number, Map<string, number[]>>();
  for (const win of unclaimed)
  {
    const domainMap = new Map<string, number[]>();
    for (const tab of win.tabs ?? [])
    {
      const domain = getDomain(tab.url ?? '');
      if (!domain) continue;
      const ids = domainMap.get(domain) ?? [];
      ids.push(tab.id!);
      domainMap.set(domain, ids);
    }
    windowDomainTabs.set(win.id!, domainMap);
  }

  // Try each unmatched backup — find the unclaimed window with the most domain overlap
  for (const backupId of unmatched)
  {
    const backup = ctx.backups.get(backupId)!;
    const entries = backupEntriesWithDomain(backup);
    if (entries.length === 0) continue;

    const backupDomains = new Set(entries.map(([, e]) => getDomain(e.url)));

    // Score each unclaimed window by counting how many backup domains appear in its tabs
    let bestWindowId = -1;
    let bestScore = 0;

    for (const win of unclaimed)
    {
      if (ctx.claimedWindowIds.has(win.id!)) continue;
      const domainMap = windowDomainTabs.get(win.id!)!;

      let overlap = 0;
      for (const domain of backupDomains)
      {
        if (domainMap.has(domain)) overlap++;
      }

      console.log(`[matchBackup] pass3: backup=${backupId} vs window=${win.id!} — overlap=${overlap}/${backupDomains.size}`);

      if (overlap > bestScore)
      {
        bestScore = overlap;
        bestWindowId = win.id!;
      }
    }

    // No window had any domain overlap — this backup can't be matched
    if (bestWindowId === -1)
    {
      console.log(`[matchBackup] pass3: backup=${backupId} — no matching window found`);
      continue;
    }

    // Best window found — now map each backup entry to a specific tab by domain
    const domainMap = windowDomainTabs.get(bestWindowId)!;
    const tabMatches: Record<string, number> = {};
    const claimedTabIds = new Set<number>();
    const logLines: string[] = [];

    // For each backup entry, find the first unclaimed tab with the same domain
    for (const [itemKey, entry] of entries)
    {
      const domain = getDomain(entry.url);
      const candidates = domainMap.get(domain);
      const tabId = candidates?.find(id => !claimedTabIds.has(id));
      if (tabId !== undefined)
      {
        tabMatches[itemKey] = tabId;
        claimedTabIds.add(tabId);
        logLines.push(`  ${itemKey}: ${domain} → tabId=${tabId} ✓`);
      }
      else
      {
        logLines.push(`  ${itemKey}: ${domain} — no matching tab ✗`);
      }
    }

    console.log(`[matchBackup] pass3: backup=${backupId} → window=${bestWindowId} (${bestScore}/${backupDomains.size} domains, ${Object.keys(tabMatches).length}/${entries.length} tabs)\n${logLines.join('\n')}`);
    ctx.result.set(backupId, { currentId: bestWindowId, matchType: 'domain', tabMatches });
    ctx.claimedWindowIds.add(bestWindowId);
  }
}

// Match backed-up windows to current windows using three passes:
// 1. Direct window ID match (extension reload — tab IDs preserved)
// 2. Index+domain match (browser restart — tabs at same positions)
// 3. Domain overlap match (tabs may have shifted positions)
function matchBackupWindows(
  backupIds: number[],
  backups: Map<number, WindowAssociationBackup>,
  allWindows: chrome.windows.Window[]
): Map<number, WindowMatch>
{
  const ctx: MatchContext = {
    result: new Map(),
    claimedWindowIds: new Set(),
    backups,
    allWindows,
  };

  matchDirect(ctx, backupIds);
  matchByIndexAndDomain(ctx, backupIds);
  matchByDomainOverlap(ctx, backupIds);

  return ctx.result;
}

// Build a filtered backup containing only matched entries, updated with new tabIds.
function buildFilteredBackup(
  backup: WindowAssociationBackup,
  tabMatches: Record<string, number>
): WindowAssociationBackup
{
  const filtered: WindowAssociationBackup = {};
  for (const [itemKey, tabId] of Object.entries(tabMatches))
  {
    const entry = backup[itemKey];
    if (entry) filtered[itemKey] = { ...entry, tabId };
  }
  return filtered;
}

// Restore tab associations from local backup on extension startup.
// Matches backup windows to current windows, restores session associations
// for matched tabs, and cleans up unmatched backup data.
export async function restoreTabAssociationBackup(): Promise<void>
{
  const backupWindowIds = await getBackupWindowIds();
  if (backupWindowIds.length === 0)
  {
    console.log('[TabAssociationBackup] restore — no backup data');
    return;
  }

  // Pre-fetch all data in parallel
  const [allWindows, ...backupValues] = await Promise.all([
    chrome.windows.getAll({ populate: true }),
    ...backupWindowIds.map(id => getWindowBackup(id)),
  ]);

  const backups = new Map<number, WindowAssociationBackup>();
  backupWindowIds.forEach((id, i) => backups.set(id, backupValues[i]));

  // Log backup data
  for (const [windowId, backup] of backups)
  {
    console.log(`[TabAssociationBackup] backup window=${windowId}\n${formatBackup(backup)}`);
  }

  // Log current windows
  for (const win of allWindows)
  {
    const tabs = win.tabs ?? [];
    const tabLines = tabs.map(t => `  [${t.index}] id=${t.id} ${t.url}`).join('\n');
    console.log(`[TabAssociationBackup] current window=${win.id} (${tabs.length} tabs)\n${tabLines}`);
  }

  // Match windows and restore associations
  const matches = matchBackupWindows(backupWindowIds, backups, allWindows);

  // Collect storage operations to batch where possible
  const storageWrites: Record<string, unknown> = {};
  const storageRemovals: string[] = [];
  const newBackupWindowIds: number[] = [];

  for (const [backupId, { currentId, matchType, tabMatches }] of matches)
  {
    const matchedCount = Object.keys(tabMatches).length;
    console.log(`[TabAssociationBackup] restoring: backup=${backupId} → window=${currentId} (${matchType}, ${matchedCount} tabs)`);

    // Restore session associations for matched tabs
    const associations: Record<number, string> = {};
    for (const [itemKey, tabId] of Object.entries(tabMatches))
    {
      associations[tabId] = itemKey;
    }
    await setTabAssociations(currentId, associations);

    // Update backup: keep only matched entries under the current window ID
    const backup = backups.get(backupId)!;
    const filtered = buildFilteredBackup(backup, tabMatches);

    if (backupId !== currentId)
    {
      storageRemovals.push(backupKey(backupId));
    }

    if (Object.keys(filtered).length > 0)
    {
      storageWrites[backupKey(currentId)] = filtered;
      newBackupWindowIds.push(currentId);
    }
    else
    {
      storageRemovals.push(backupKey(currentId));
    }
  }

  // Clean up unmatched backup windows
  const unmatched = backupWindowIds.filter(id => !matches.has(id));
  for (const backupId of unmatched)
  {
    console.log(`[TabAssociationBackup] removing unmatched backup window=${backupId}`);
    storageRemovals.push(backupKey(backupId));
  }

  // Batch all storage operations
  storageWrites[BACKUP_WINDOW_IDS_KEY] = newBackupWindowIds;
  await Promise.all([
    chrome.storage.local.set(storageWrites),
    storageRemovals.length > 0 ? chrome.storage.local.remove(storageRemovals) : Promise.resolve(),
  ]);
}
