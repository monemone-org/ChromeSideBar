// Seeds/resets extension state directly via chrome.* APIs evaluated on the
// service worker - no production code changes needed. Spaces live at
// chrome.storage.local['spaces'] (see utils/spaceMessages.ts
// SPACES_STORAGE_KEY) and pinned sites at chrome.storage.local['pinnedSites']
// (see background.ts's PINNED_KEY) - both confirmed readable/writable
// directly from the background context, same shape the existing
// export/import feature (utils/backupRestore.ts) already uses.

/**
 * Reset to a clean slate between test cases: close all tabs except a keeper,
 * wipe the bookmark tree, and clear spaces/pinned sites. Deliberately doesn't
 * touch chrome.storage.session wholesale - closing tabs lets the extension's
 * own onRemoved cleanup naturally prune tab-keyed associations, the same way
 * the existing in-app tests (src/tests/closeTabActionTest.ts) already rely on.
 */
export async function resetState(worker)
{
  await worker.evaluate(async () =>
  {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows)
    {
      const keeper = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: win.id });
      const otherTabIds = (win.tabs ?? [])
        .map(t => t.id)
        .filter((id) => id !== undefined && id !== keeper.id);
      if (otherTabIds.length > 0)
      {
        await chrome.tabs.remove(otherTabIds);
      }
    }

    for (const rootId of ['1', '2', '3'])
    {
      const children = await chrome.bookmarks.getChildren(rootId).catch(() => []);
      for (const child of children)
      {
        await chrome.bookmarks.removeTree(child.id);
      }
    }

    await chrome.storage.local.remove(['spaces', 'pinnedSites']);
  });
}

/**
 * Seed spaces, pinned sites, and bookmarks for one test case. Fixture shape
 * mirrors the existing FullBackup export format (see
 * tools/sidebar-backup-2026-07-30.json) but only the fields test cases
 * actually need:
 *
 *   spaces: [{ name, icon?, color?, bookmarks?: [{ title, url }] }]
 *   pinnedSites: [{ title, url }]
 *
 * bookmarks (if present under a space) are created in a folder under "Other
 * Bookmarks" named after the space, matching how the real app links a space
 * to its bookmark folder by name (bookmarkFolderPath/Segments - see
 * utils/spaceMessages.ts Space.bookmarkFolderPath).
 *
 * Returns a map of created resource refs: { spaces: {name: Space}, bookmarks: {ref: bookmarkNode}, pinnedSites: {ref: pinnedSite} }
 */
export async function seedFixture(worker, fixture)
{
  return worker.evaluate(async (fixture) =>
  {
    function randomId(prefix)
    {
      return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const createdSpaces = [];
    const createdBookmarks = {};

    for (const spaceDef of fixture.spaces ?? [])
    {
      const folder = await chrome.bookmarks.create({ parentId: '2', title: spaceDef.name });

      for (const bm of spaceDef.bookmarks ?? [])
      {
        const node = await chrome.bookmarks.create({
          parentId: folder.id,
          title: bm.title,
          url: bm.url,
        });
        if (bm.as) createdBookmarks[bm.as] = node;
      }

      createdSpaces.push({
        id: randomId('space'),
        name: spaceDef.name,
        icon: spaceDef.icon ?? 'Folder',
        color: spaceDef.color ?? 'grey',
        bookmarkFolderPath: `Other Bookmarks/${spaceDef.name}`,
        bookmarkFolderSegments: ['Other Bookmarks', spaceDef.name],
      });
    }

    if (createdSpaces.length > 0)
    {
      await chrome.storage.local.set({ spaces: createdSpaces });
    }

    const createdPinnedSites = {};
    const pinnedSitesToStore = [];
    for (const pinDef of fixture.pinnedSites ?? [])
    {
      const site = {
        id: randomId('pin'),
        title: pinDef.title,
        url: pinDef.url,
      };
      pinnedSitesToStore.push(site);
      if (pinDef.as) createdPinnedSites[pinDef.as] = site;
    }
    if (pinnedSitesToStore.length > 0)
    {
      await chrome.storage.local.set({ pinnedSites: pinnedSitesToStore });
    }

    return {
      spaces: Object.fromEntries(createdSpaces.map(s => [s.name, s])),
      bookmarks: createdBookmarks,
      pinnedSites: createdPinnedSites,
    };
  }, fixture);
}
