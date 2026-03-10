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
  url: string;
  tabIndex: number;
}

// itemKey → { url, tabIndex } for one window
export type WindowAssociationBackup = Record<string, TabAssociationBackupEntry>;

const backupKey = (windowId: number) => `${BACKUP_KEY_PREFIX}${windowId}`;

function formatBackup(backup: WindowAssociationBackup): string
{
  const entries = Object.entries(backup);
  if (entries.length === 0) return '  (empty)';
  return entries.map(([key, e]) => `  ${key}: tabIndex=${e.tabIndex}, url=${e.url}`).join('\n');
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
