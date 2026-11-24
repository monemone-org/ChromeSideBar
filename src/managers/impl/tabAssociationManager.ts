// TabAssociationManager - owns which tab stands in for which bookmark or
// pinned site, in both places that fact is kept.
//
// Background-side implementation of shared/tabAssociationsApi.ts. The sidebar
// reaches it through proxies/tabAssociationsProxy.ts; the routing vocabulary
// is in proxies/messageRouting.ts.
//
// This is the single writer of two storage keys - Case 1 in
// docs/decisions/2026-07-30-shared-storage-multiple-writers.md:
//
// - `tabAssociations_{windowId}` in session storage, the live tab id ->
//   itemKey map, held in memory here and written through on every change.
// - `tabAssociationsBackup_{windowId}` in local storage plus the index array
//   `tabAssociationsBackupWindowIds`, which survive a browser restart that
//   session storage does not. restoreFromBackup() matches each backed-up
//   window to one of the windows Chrome brought back.
//
// Before this, background.ts and BookmarkTabsContext.tsx both wrote both keys
// through the shared src/utils/tabAssociations.ts, so a sidebar write landing
// in the gap between background's read and background's write silently lost
// whichever entries changed in between. The whole of that file lives here and
// in shared/tabAssociationsApi.ts now.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { TestGateName } from '../shared/backgroundTestHooksApi';
import { backgroundTestHooks } from './backgroundTestHooks';
import {
  TabAssociationBackupEntry,
  TabAssociations,
  TabAssociationsApi,
  TAB_ASSOCIATIONS_CHANGED,
  WindowAssociationBackup,
  applyAssociate,
  applyDeassociate,
  applyKeepTabs,
  isPinnedItemKey,
} from '../shared/tabAssociationsApi';

// Session storage key helper
const SESSION_KEY_PREFIX = 'tabAssociations_';
const sessionKey = (windowId: number) => `${SESSION_KEY_PREFIX}${windowId}`;

// =============================================================================
// Local storage backup (persists across browser restarts)
// One storage entry per window + a separate index of all window IDs.
// =============================================================================

const BACKUP_KEY_PREFIX = 'tabAssociationsBackup_';
const BACKUP_WINDOW_IDS_KEY = 'tabAssociationsBackupWindowIds';

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
async function removeWindowAssociationBackup(windowId: number): Promise<void>
{
  await removeBackupWindowId(windowId);
  if (import.meta.env.DEV)
  {
    console.log('[TabAssociationBackup] removeWindow', windowId);
  }
}

async function saveTabAssociationBackup(
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

async function removeTabAssociationBackup(
  windowId: number,
  itemKey: string
): Promise<void>
{
  const windowBackup = await getWindowBackup(windowId);
  if (!(itemKey in windowBackup)) return;
  delete windowBackup[itemKey];
  if (Object.keys(windowBackup).length === 0)
  {
    // Called directly, not through the store: this is already running inside
    // the queue, and re-entering it would wait on an operation that cannot
    // finish until this one returns.
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
async function updateTabAssociationBackupIndices(
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

/**
 * The local-storage backup, with every write serialised.
 *
 * All the functions above are read-modify-write: each one reads a key, changes
 * one entry, and writes the whole key back. Two of them running at once lose
 * whichever change landed in the gap, which is the same failure this manager
 * exists to fix for the associations themselves - so the backup gets the same
 * treatment rather than being left as the one place it can still happen.
 *
 * Closing several tabs at once is the case that makes this reachable rather
 * than theoretical: chrome.tabs.remove() takes an array, eight call sites pass
 * one, and background's onRemoved then fires once per tab with no gap between
 * them. A lost removal leaves a backup entry for a tab that is gone, which the
 * next browser restart would restore as a live association.
 *
 * One queue covers every window rather than one per window, because the
 * `tabAssociationsBackupWindowIds` index is a single key that save and remove
 * both rewrite - per-window queues would still collide on it. These writes are
 * small and rare enough that serialising all of them costs nothing worth
 * measuring.
 *
 * The functions above are the unqueued implementations and must only be
 * reached through the methods here, which is also why some of them call each
 * other directly: an inner call that re-entered the queue would wait on the
 * outer one that is still running, and neither would ever finish.
 */
class TabAssociationBackupStore
{
  // The tail of the queue. Every operation chains onto it, so each one starts
  // only after the previous has finished reading, changing and writing back.
  #queue: Promise<unknown> = Promise.resolve();

  /**
   * Runs one operation once everything queued before it has finished.
   *
   * The caller gets the real promise, failure and all, while the queue itself
   * continues past a failure - one rejected write must not stop every write
   * after it from ever running.
   */
  #enqueue<T>(work: () => Promise<T>): Promise<T>
  {
    const result = this.#queue.then(work);
    this.#queue = result.catch(() => {});
    return result;
  }

  /** Record where one item's tab is, so a restart can find it again. */
  save(windowId: number, itemKey: string, entry: TabAssociationBackupEntry): Promise<void>
  {
    return this.#enqueue(() => saveTabAssociationBackup(windowId, itemKey, entry));
  }

  /**
   * Like save(), but works out the entry inside the queue, for a caller that
   * has to look the tab up first. Looking it up before queueing would let a
   * removal queued during the lookup run first, and the save would then put
   * back an entry for an association that is already gone. Nothing is saved
   * when resolveEntry returns undefined.
   */
  saveResolved(
    windowId: number,
    itemKey: string,
    resolveEntry: () => Promise<TabAssociationBackupEntry | undefined>
  ): Promise<void>
  {
    return this.#enqueue(async () =>
    {
      const entry = await resolveEntry();
      if (entry) await saveTabAssociationBackup(windowId, itemKey, entry);
    });
  }

  /** Forget one item's tab. */
  remove(windowId: number, itemKey: string): Promise<void>
  {
    return this.#enqueue(() => removeTabAssociationBackup(windowId, itemKey));
  }

  /** Forget a whole window, including its place in the window index. */
  removeWindow(windowId: number): Promise<void>
  {
    return this.#enqueue(() => removeWindowAssociationBackup(windowId));
  }

  /** Patch the stored tab index of several items in one pass. */
  updateIndices(windowId: number, itemKeyToIndex: Record<string, number>): Promise<void>
  {
    return this.#enqueue(() => updateTabAssociationBackupIndices(windowId, itemKeyToIndex));
  }

  /**
   * Runs the startup restore with the queue held, so the whole read-match-write
   * pass sees one consistent picture of the backup rather than one that a tab
   * event could change underneath it.
   */
  runExclusively<T>(work: () => Promise<T>): Promise<T>
  {
    return this.#enqueue(work);
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

// Pass 1: direct match - backup window ID still exists.
// Tab IDs should also be preserved (extension reload), so match by stored tabId.
function matchDirect(ctx: MatchContext, backupIds: number[]): void
{
  const currentIds = new Set(ctx.allWindows.map(w => w.id!));

  // Try each backup window - if its ID still exists, match tabs by stored tabId
  for (const backupId of backupIds)
  {
    // Skip backups whose window ID no longer exists (needs fuzzy matching in later passes)
    if (!currentIds.has(backupId))
    {
      if (import.meta.env.DEV)
      {
        console.log(`[matchBackup] pass1: backup=${backupId} - window ID not found`);
      }
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
        logLines.push(`  ${itemKey}: tabId=${entry.tabId} - tab gone ✗`);
      }
    }

    ctx.result.set(backupId, { currentId: backupId, matchType: 'direct', tabMatches });
    ctx.claimedWindowIds.add(backupId);
    if (import.meta.env.DEV)
    {
      console.log(`[matchBackup] pass1: backup=${backupId} → direct (${Object.keys(tabMatches).length}/${Object.keys(backup).length} tabs)\n${logLines.join('\n')}`);
    }
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
      if (import.meta.env.DEV)
      {
        console.log(`[matchBackup] pass2: backup=${backupId} vs window=${winId} - ${allMatch ? 'MATCH' : 'no match'}\n${[...matchLines, ...mismatchLines].join('\n')}`);
      }

      // All entries matched - claim this window and move to next backup
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

  // Try each unmatched backup - find the unclaimed window with the most domain overlap
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

      if (import.meta.env.DEV)
      {
        console.log(`[matchBackup] pass3: backup=${backupId} vs window=${win.id!} - overlap=${overlap}/${backupDomains.size}`);
      }

      if (overlap > bestScore)
      {
        bestScore = overlap;
        bestWindowId = win.id!;
      }
    }

    // No window had any domain overlap - this backup can't be matched
    if (bestWindowId === -1)
    {
      if (import.meta.env.DEV)
      {
        console.log(`[matchBackup] pass3: backup=${backupId} - no matching window found`);
      }
      continue;
    }

    // Best window found - now map each backup entry to a specific tab by domain
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
        logLines.push(`  ${itemKey}: ${domain} - no matching tab ✗`);
      }
    }

    if (import.meta.env.DEV)
    {
      console.log(`[matchBackup] pass3: backup=${backupId} → window=${bestWindowId} (${bestScore}/${backupDomains.size} domains, ${Object.keys(tabMatches).length}/${entries.length} tabs)\n${logLines.join('\n')}`);
    }
    ctx.result.set(backupId, { currentId: bestWindowId, matchType: 'domain', tabMatches });
    ctx.claimedWindowIds.add(bestWindowId);
  }
}

// Match backed-up windows to current windows using three passes:
// 1. Direct window ID match (extension reload - tab IDs preserved)
// 2. Index+domain match (browser restart - tabs at same positions)
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
/**
 * The backup a restored window should have: one entry per association it
 * ends up with, not per backup entry that matched a tab. A matched entry the
 * restore skipped, because its item or its tab was already taken by a newer
 * association, must not be written back, or the next restart would restore
 * it (T.4).
 *
 * An entry comes from the restored backup when the restore applied it, and
 * otherwise from the current window's own backup, which is where a newer
 * association's entry already is. An association found in neither gets its
 * entry from the save still queued behind this restore.
 */
function buildMergedBackup(
  associations: TabAssociations,
  restoredBackup: WindowAssociationBackup,
  tabMatches: Record<string, number>,
  currentBackup: WindowAssociationBackup | undefined
): WindowAssociationBackup
{
  const merged: WindowAssociationBackup = {};

  // Find an entry for each association the window ends up with
  for (const [id, itemKey] of Object.entries(associations))
  {
    const tabId = Number(id);
    const restoredEntry = restoredBackup[itemKey];
    const currentEntry = currentBackup?.[itemKey];

    if (tabMatches[itemKey] === tabId && restoredEntry)
    {
      merged[itemKey] = { ...restoredEntry, tabId };
    }
    else if (currentEntry?.tabId === tabId)
    {
      merged[itemKey] = currentEntry;
    }
  }

  return merged;
}

// =============================================================================
// The manager
// =============================================================================

export class TabAssociationManager implements RoutedManager, TabAssociationsApi
{
  readonly managerId = ManagerId.TAB_ASSOCIATIONS;

  // windowId -> that window's live associations. The authoritative copy:
  // session storage is written from here, never read back except by load().
  #byWindow = new Map<number, TabAssociations>();

  // The local-storage backup that outlives a restart. Kept in step with the
  // map above by the methods below, so no caller has to know it exists.
  #backup = new TabAssociationBackupStore();

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    // originId is the calling context's CONTEXT_ID, stamped by callManager. It
    // rides along on the broadcast each mutation sends, as a label saying a
    // sidebar caused the change. Pulled out once here rather than in every
    // case below.
    const originId = message.senderId as string | undefined;

    switch (method)
    {
      case 'getAssociations':
        return this.getAssociations(message.windowId as number);

      case 'associate':
        return this.associate(
          message.windowId as number,
          message.tabId as number,
          message.itemKey as string,
          message.url as string | undefined,
          message.tabIndex as number | undefined,
          originId
        );

      case 'deassociate':
        return this.deassociate(message.windowId as number, message.tabId as number, originId);

      case 'reconcileWindow':
        return this.reconcileWindow(message.windowId as number, originId);

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  /**
   * Reads every window's associations out of session storage into memory,
   * once, when the service worker starts. Everything after this reads the
   * in-memory copy - which is what makes isPinnedManagedTab synchronous.
   */
  async load(): Promise<void>
  {
    const stored = await chrome.storage.session.get(null);

    // Session storage holds one key per window, so pick out the ones that are
    // ours and turn the windowId back into a number
    for (const [key, value] of Object.entries(stored))
    {
      if (!key.startsWith(SESSION_KEY_PREFIX)) continue;

      const windowId = Number(key.slice(SESSION_KEY_PREFIX.length));
      if (Number.isNaN(windowId)) continue;

      this.#byWindow.set(windowId, (value ?? {}) as TabAssociations);
    }
  }

  // ---------------------------------------------------------------------------
  // TabAssociationsApi - what the sidebar can call
  // ---------------------------------------------------------------------------

  getAssociations(windowId: number): TabAssociations
  {
    return this.#byWindow.get(windowId) ?? {};
  }

  /**
   * Points one item at one tab, in session storage and in the local backup,
   * together.
   *
   * url and tabIndex are what the backup needs to find this tab again after a
   * restart. Callers that already have them (tab creation hands them straight
   * from the new tab) pass them in; callers that don't leave them out and this
   * looks the tab up itself, rather than every caller remembering to.
   *
   * Returns as soon as the in-memory map and session storage are updated. The
   * backup write finishes in the queue afterwards - see #finishInBackground.
   */
  associate(
    windowId: number,
    tabId: number,
    itemKey: string,
    url?: string,
    tabIndex?: number,
    originId?: string
  ): TabAssociations
  {
    const current = this.getAssociations(windowId);
    const previousItemKey = current[tabId];
    const associations = this.#commit(windowId, applyAssociate(current, tabId, itemKey), originId);

    // The tab stood in for a different item until now. That item's backup
    // entry still points at this tab, and a restart would bring the old
    // association back, so it goes too.
    if (previousItemKey !== undefined && previousItemKey !== itemKey)
    {
      this.#finishInBackground(this.#backup.remove(windowId, previousItemKey), 'associate');
    }

    const save = this.#backup.saveResolved(windowId, itemKey, async () =>
    {
      // Fill in whatever the caller didn't have, so the backup entry is complete
      if (url !== undefined && tabIndex !== undefined) return { tabId, url, tabIndex };

      try
      {
        const tab = await chrome.tabs.get(tabId);
        return { tabId, url: url ?? tab.url ?? '', tabIndex: tabIndex ?? tab.index };
      }
      catch
      {
        // Tab may have been closed
        return undefined;
      }
    });
    this.#finishInBackground(save, 'associate');

    return associations;
  }

  /**
   * Drops one tab's association, in session storage and in the local backup,
   * together. An unknown tab id changes nothing and broadcasts nothing.
   *
   * Returns as soon as the in-memory map and session storage are updated. The
   * backup removal finishes in the queue afterwards - see #finishInBackground.
   */
  deassociate(windowId: number, tabId: number, originId?: string): TabAssociations
  {
    const current = this.getAssociations(windowId);
    const itemKey = current[tabId];
    if (itemKey === undefined) return current;

    const associations = this.#commit(windowId, applyDeassociate(current, tabId), originId);
    this.#finishInBackground(this.#backup.remove(windowId, itemKey), 'deassociate');
    return associations;
  }

  /**
   * Drops every association in one window whose tab is gone or has moved on,
   * and returns what is left.
   *
   * A tab is kept only when chrome.tabs.get succeeds AND the tab still lives
   * in this window. The second half is the fix for G2/A.6: the old
   * sidebar-side rebuild checked only that the tab existed, so a tab dragged
   * into another window while nothing was listening stayed associated forever
   * - it still exists, the get still succeeds, and nothing ever asked where it
   * lives now.
   *
   * The lookups run in parallel and take a while, and background can
   * associate or deassociate a tab in this window while they run. So the map
   * is read again once they finish, and only the tabs that failed the check
   * are removed from it. Writing back the map read before the lookups would
   * undo whatever changed in between.
   */
  async reconcileWindow(windowId: number, originId?: string): Promise<TabAssociations>
  {
    const tabIds = Object.keys(this.getAssociations(windowId)).map(id => Number(id));
    if (tabIds.length === 0) return this.getAssociations(windowId);

    // Check every tracked tab at once: it has to exist and still be in this window
    const deadTabIds = new Set<number>();
    await Promise.all(tabIds.map(async (tabId) =>
    {
      try
      {
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId !== windowId) deadTabIds.add(tabId);
      }
      catch
      {
        deadTabIds.add(tabId);
      }
    }));

    const current = this.getAssociations(windowId);
    const keepTabIds = new Set<number>();
    const removedItemKeys: string[] = [];

    // Split the map as it is now into tabs to keep and items to forget. A tab
    // associated during the lookups was never checked, so it is kept.
    for (const [id, itemKey] of Object.entries(current))
    {
      const tabId = Number(id);
      if (deadTabIds.has(tabId))
      {
        removedItemKeys.push(itemKey);
      }
      else
      {
        keepTabIds.add(tabId);
      }
    }

    if (removedItemKeys.length === 0) return current;

    // Clear each dead entry's backup too. The queue keeps these in order with
    // every other backup write, so nothing here needs to wait for them.
    for (const itemKey of removedItemKeys)
    {
      this.#finishInBackground(this.#backup.remove(windowId, itemKey), 'reconcileWindow');
    }

    return this.#commit(windowId, applyKeepTabs(current, keepTabIds), originId);
  }

  // ---------------------------------------------------------------------------
  // Background-only - the sidebar has never needed these, so they stay off the
  // wire contract rather than widening it past its actual callers.
  // ---------------------------------------------------------------------------

  /**
   * Whether a tab stands in for a pinned site. A plain in-memory lookup: it
   * sits on the tab-activation and tab-grouping hot paths (getSpaceForTab and
   * processGroupingRequest), where the storage read it used to do was an
   * asynchronous yield point on every single call.
   */
  isPinnedManagedTab(windowId: number, tabId: number): boolean
  {
    return isPinnedItemKey(this.getAssociations(windowId)[tabId]);
  }

  /**
   * A tracked tab navigated: refresh the URL and index its backup entry holds,
   * so the domain-matching passes have something current to compare against
   * after a restart. Does nothing for a tab nobody tracks.
   */
  async noteTabNavigated(windowId: number, tabId: number, url: string, tabIndex: number): Promise<void>
  {
    const itemKey = this.getAssociations(windowId)[tabId];
    if (itemKey === undefined) return;

    await this.#backup.save(windowId, itemKey, { tabId, url, tabIndex });
  }

  /**
   * Refresh the stored tab index of every tracked tab in one window. Called
   * after a move or a removal, either of which shifts the index of every tab
   * after it.
   */
  async refreshBackupIndices(windowId: number): Promise<void>
  {
    if (Object.keys(this.getAssociations(windowId)).length === 0) return;

    const allTabs = await chrome.tabs.query({ windowId });
    const tabIndexMap = new Map(allTabs.map(t => [t.id!, t.index]));

    if (import.meta.env.DEV)
    {
      await backgroundTestHooks.passGate(TestGateName.REFRESH_BACKUP_INDICES_AFTER_TAB_QUERY);
    }

    // Read the map only now, after the query: an item that moved to another
    // tab while it ran would otherwise be given its old tab's index (T.5)
    const associations = this.getAssociations(windowId);
    const updates: Record<string, number> = {};
    for (const [id, itemKey] of Object.entries(associations))
    {
      const newIndex = tabIndexMap.get(Number(id));
      if (newIndex !== undefined)
      {
        updates[itemKey] = newIndex;
      }
    }

    if (Object.keys(updates).length > 0)
    {
      await this.#backup.updateIndices(windowId, updates);
    }
  }

  /** Drops a closed window's state: in memory, in session storage, and in the backup. */
  async removeWindow(windowId: number): Promise<void>
  {
    this.#byWindow.delete(windowId);
    await chrome.storage.session.remove(sessionKey(windowId));
    await this.#backup.removeWindow(windowId);
  }

  /**
   * Restore tab associations from the local backup on extension startup.
   * Matches backup windows to current windows, restores session associations
   * for matched tabs, and cleans up unmatched backup data.
   *
   * The whole pass runs with the backup queue held, so it reads, matches and
   * rewrites one consistent picture. A tab event arriving while it is matching
   * would otherwise change a key it has already read and is about to overwrite.
   */
  async restoreFromBackup(): Promise<void>
  {
    return this.#backup.runExclusively(() => this.#restoreFromBackup());
  }

  async #restoreFromBackup(): Promise<void>
  {
    const backupWindowIds = await getBackupWindowIds();
    if (backupWindowIds.length === 0)
    {
      if (import.meta.env.DEV)
      {
        console.log('[TabAssociationBackup] restore - no backup data');
      }
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
      if (import.meta.env.DEV)
      {
        console.log(`[TabAssociationBackup] backup window=${windowId}\n${formatBackup(backup)}`);
      }
    }

    // Log current windows
    for (const win of allWindows)
    {
      const tabs = win.tabs ?? [];
      const tabLines = tabs.map(t => `  [${t.index}] id=${t.id} ${t.url}`).join('\n');
      if (import.meta.env.DEV)
      {
        console.log(`[TabAssociationBackup] current window=${win.id} (${tabs.length} tabs)\n${tabLines}`);
      }
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
      if (import.meta.env.DEV)
      {
        console.log(`[TabAssociationBackup] restoring: backup=${backupId} → window=${currentId} (${matchType}, ${matchedCount} tabs)`);
      }

      // Restore session associations for matched tabs, merged into whatever
      // this window already has. This runs on every service worker start, and
      // the event that woke the worker may already have associated a tab
      // here. That association is newer than the backup, so a restored entry
      // is skipped when its item or its tab is already taken.
      const associations: TabAssociations = { ...this.getAssociations(currentId) };
      const liveItemKeys = new Set(Object.values(associations));
      for (const [itemKey, tabId] of Object.entries(tabMatches))
      {
        if (liveItemKeys.has(itemKey) || associations[tabId] !== undefined) continue;
        associations[tabId] = itemKey;
      }
      this.#commit(currentId, associations);

      // Update backup: one entry per association the window now has, under
      // the current window ID
      const backup = backups.get(backupId)!;
      const filtered = buildMergedBackup(associations, backup, tabMatches, backups.get(currentId));

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
      if (import.meta.env.DEV)
      {
        console.log(`[TabAssociationBackup] removing unmatched backup window=${backupId}`);
      }
      storageRemovals.push(backupKey(backupId));
    }

    // Batch all storage operations
    storageWrites[BACKUP_WINDOW_IDS_KEY] = newBackupWindowIds;
    await Promise.all([
      chrome.storage.local.set(storageWrites),
      storageRemovals.length > 0 ? chrome.storage.local.remove(storageRemovals) : Promise.resolve(),
    ]);
  }

  // ---------------------------------------------------------------------------
  // DEV-only test hooks - reached through background.ts's test hook handler,
  // never from the sidebar's proxy. See shared/backgroundTestHooksApi.ts.
  // ---------------------------------------------------------------------------

  /**
   * Empties one window's live associations and leaves its backup alone, which
   * is what a browser restart does: session storage is cleared, local storage
   * is kept.
   */
  forgetSessionForTest(windowId: number): void
  {
    this.#commit(windowId, {});
  }

  /** One window's backup, read once every backup write queued before it has finished. */
  readBackupForTest(windowId: number): Promise<WindowAssociationBackup>
  {
    return this.#backup.runExclusively(() => getWindowBackup(windowId));
  }

  /**
   * Lets a backup write finish in the queue without holding up the caller.
   *
   * The queue already runs backup writes in the order they were requested, so
   * a reply doesn't have to wait for one before the next request can safely
   * arrive. Waiting would only delay the sidebar, most visibly behind the
   * startup restore, which holds the queue while it runs. Nobody is waiting on
   * the write, so a failure is logged here instead of being lost.
   */
  #finishInBackground(write: Promise<void>, method: string): void
  {
    write.catch((error) =>
    {
      console.error(`[TabAssociationManager] ${method}: backup write failed:`, error);
    });
  }

  /**
   * Stores one already-computed map for one window: in memory, then to session
   * storage, then out to every listening context. Every mutation above ends
   * here, so persisting and broadcasting have exactly one implementation.
   *
   * originId identifies the context that asked for this change, and rides
   * along on the broadcast as senderId - a label saying a sidebar caused it.
   * Absent for background-internal callers (the tab listeners, the startup
   * restore). See CONTEXT_ID in proxies/messageRouting.ts.
   */
  #commit(windowId: number, associations: TabAssociations, originId?: string): TabAssociations
  {
    this.#byWindow.set(windowId, associations);

    chrome.storage.session.set({ [sessionKey(windowId)]: associations });

    // Notify every sidebar of the change. windowId is carried so a mirror
    // bound to a different window can ignore it; senderId is the provenance
    // label described above, and every proxy applies the broadcast regardless
    // of it.
    chrome.runtime.sendMessage({
      action: TAB_ASSOCIATIONS_CHANGED,
      windowId,
      associations,
      senderId: originId,
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return associations;
  }
}
