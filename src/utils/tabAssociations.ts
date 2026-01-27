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
