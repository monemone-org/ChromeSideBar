// Setup/teardown helpers for the in-panel test runner. All test artifacts are
// tagged (URL prefix for tabs, a dedicated bookmark folder for spaces/
// bookmarks, a title prefix for pinned sites) so resetTestData() can find and
// remove them by introspecting real Chrome/extension state rather than
// requiring callers to track every id they created.

import { Space } from '../../contexts/SpacesContext';
import { PINNED_SITES_STORAGE_KEY } from '../../hooks/usePinnedSites';
import { DEFAULT_FOLLOW_ACTIVE_TAB_MODE, FOLLOW_ACTIVE_TAB_KEY } from '../../utils/followActiveTab';
import { TestContext } from './types';
import { sleep } from './stepHelpers';

export const TEST_URL_PREFIX = 'https://example.com/inpanel-test-';
export const TEST_ROOT_FOLDER_TITLE = 'InPanel Test Data (safe to delete)';
export const TEST_PINNED_PREFIX = 'InPanelTest: ';
const OTHER_BOOKMARKS_ID = '2';

/**
 * A page that can actually produce sound, for C.2e/C.2f. Every other fixture
 * uses a synthetic example.com URL, but those can't be made audible, and
 * chrome.tabs' `audible` flag (which the audio quick-jump and audio dropdown
 * are built on) only gets set by genuine playback - autoplay is blocked
 * without a user gesture, and muted playback doesn't count. Hence the real
 * video, plus a manual "press play" step in those two cases.
 *
 * Swap this for any video with sound. Keep it a bare watch?v= link: a
 * &list=... playlist auto-advances to the next video when this one ends,
 * rewriting the tab's URL mid-run and defeating the cleanup match below.
 */
export const TEST_AUDIO_URL = 'https://www.youtube.com/watch?v=-W2JdSl1v48';

/**
 * Whether a tab belongs to the test suite and is safe to close during
 * cleanup. Deliberately matches TEST_AUDIO_URL as a full-URL prefix rather
 * than something loose like "any youtube.com tab" - cleanup closes whatever
 * it matches, and a broad pattern would take the user's own tabs with it
 * (same collision hazard the namespaced test space names avoid). The
 * tradeoff: if the page navigates somewhere else entirely, that tab is
 * leaked rather than closed, which is the safe direction to fail.
 */
function isTestTabUrl(url: string | undefined): boolean
{
  if (!url) return false;
  return url.startsWith(TEST_URL_PREFIX) || url.startsWith(TEST_AUDIO_URL);
}

export function testUrl(label: string): string
{
  return `${TEST_URL_PREFIX}${label}`;
}

// Yield long enough for a React state update (setSpaces/setPinnedSites, both
// snapshot-based rather than functional updaters - see SpacesContext.tsx's
// createSpace/deleteSpaceBase and usePinnedSites.ts's removePin) to commit
// and flow into TestRunnerPanel's next ctxRef rebuild. Needed between any two
// calls to createSpace/deleteSpace/addPin/removePin in the same fixture -
// without it, the second call's stale closure overwrites the first call's
// write instead of building on it.
const FIXTURE_TICK_MS = 100;

async function findChild(parentId: string, title: string): Promise<chrome.bookmarks.BookmarkTreeNode | undefined>
{
  const children = await chrome.bookmarks.getChildren(parentId);
  return children.find(c => !c.url && c.title === title);
}

/** The shared root folder all test-created bookmark folders live under, creating it if needed. */
async function ensureTestRootFolder(): Promise<chrome.bookmarks.BookmarkTreeNode>
{
  const existing = await findChild(OTHER_BOOKMARKS_ID, TEST_ROOT_FOLDER_TITLE);
  if (existing) return existing;
  return chrome.bookmarks.create({ parentId: OTHER_BOOKMARKS_ID, title: TEST_ROOT_FOLDER_TITLE });
}

export interface SpaceFixtureSpec
{
  ref: string;    // symbolic name later steps use to look this space up in ctx.refs
  name: string;
  icon?: string;
  color?: string;
}

// Deliberately NOT plain "Work"/"Video" - both are the doc's own suggested
// example space names (see the manual test plan's Prerequisites section), so
// a real user following that doc by hand is likely to already have spaces
// with those exact names. Chrome tab groups are matched purely by TITLE
// STRING (see moveTabToSpace/moveTabNative/SpacesContext.deleteSpace, all of
// which do chrome.tabGroups.query({ title: space.name })) - a name collision
// would group test tabs into the user's REAL group, and resetTestData's
// cleanup (which closes every tab in a test space's group) would then close
// the user's real tabs too. These names are namespaced specifically to make
// that collision implausible.
export const TEST_SPACE_WORK_NAME = 'Work (inpanel-test)';
export const TEST_SPACE_VIDEO_NAME = 'Video (inpanel-test)';

// Real Space icons are Iconify names fetched from a CDN (see src/utils/iconify.ts)
// or an emoji (any codepoint > 255 - src/utils/emoji.ts's isEmoji()). Emoji are
// simpler and more robust for test fixtures: no network fetch, no need to guess
// a valid Iconify name. One per space NAME (not per space instance - every case
// resets and recreates its spaces fresh) so the two test spaces are always
// visually distinct from each other while a run is in progress. Extend this
// map as cases introduce new space names.
const DEFAULT_SPACE_ICONS: Record<string, string> = {
  [TEST_SPACE_WORK_NAME]: '💼',
  [TEST_SPACE_VIDEO_NAME]: '🎬',
};
const FALLBACK_SPACE_ICON = '🧪';

/**
 * Create a space with a fresh bookmark folder under the shared test root, and
 * record its id in ctx.refs. Takes getCtx (not a static ctx) so that calling
 * this twice in a row (e.g. a case's setup creating two spaces) has the
 * second call's ctx.createSpace see the first call's write - see the
 * TestCase.setup doc comment in types.ts.
 */
export async function createTestSpace(getCtx: () => TestContext, spec: SpaceFixtureSpec): Promise<Space>
{
  const root = await ensureTestRootFolder();
  const folder = await getCtx().createFolder(root.id, spec.name);
  const segments = await getCtx().getBookmarkSegments(folder.id);

  const icon = spec.icon ?? DEFAULT_SPACE_ICONS[spec.name] ?? FALLBACK_SPACE_ICON;
  const ctx = getCtx(); // fresh, right before the state-mutating call
  const space = ctx.createSpace(spec.name, icon, spec.color ?? 'blue', segments.join('/'), segments);
  ctx.refs.set(spec.ref, space.id);
  ctx.refs.set(`${spec.ref}:folderId`, folder.id);

  await sleep(FIXTURE_TICK_MS);
  return space;
}

/** Create a bookmark inside a space created by createTestSpace(), keyed by the space's ref. */
export async function createTestBookmark(
  ctx: TestContext,
  spaceRef: string,
  title: string,
  url: string,
  bookmarkRef: string
): Promise<chrome.bookmarks.BookmarkTreeNode>
{
  const folderId = ctx.refs.get(`${spaceRef}:folderId`);
  if (typeof folderId !== 'string') throw new Error(`createTestBookmark: no folder for space ref "${spaceRef}" - call createTestSpace first`);
  const bookmark = await ctx.createBookmark(folderId, title, url);
  ctx.refs.set(bookmarkRef, bookmark.id);
  return bookmark;
}

/** Create a bookmark inside an arbitrary folder ref (e.g. one from createTestSubfolder) - unlike createTestBookmark, which is anchored to a space's own root folder via its "${spaceRef}:folderId" ref convention. */
export async function createTestBookmarkInFolder(
  ctx: TestContext,
  folderRef: string,
  title: string,
  url: string,
  bookmarkRef: string
): Promise<chrome.bookmarks.BookmarkTreeNode>
{
  const folderId = ctx.refs.get(folderRef);
  if (typeof folderId !== 'string') throw new Error(`createTestBookmarkInFolder: no folder ref "${folderRef}" - call createTestSubfolder first`);
  const bookmark = await ctx.createBookmark(folderId, title, url);
  ctx.refs.set(bookmarkRef, bookmark.id);
  return bookmark;
}

/** Create a subfolder nested inside a space's own folder (for A.7b's generic "Move to..." picker, which targets an arbitrary folder rather than a space's root folder directly). */
export async function createTestSubfolder(
  ctx: TestContext,
  spaceRef: string,
  title: string,
  folderRef: string
): Promise<chrome.bookmarks.BookmarkTreeNode>
{
  const parentFolderId = ctx.refs.get(`${spaceRef}:folderId`);
  if (typeof parentFolderId !== 'string') throw new Error(`createTestSubfolder: no folder for space ref "${spaceRef}" - call createTestSpace first`);
  const folder = await ctx.createFolder(parentFolderId, title);
  ctx.refs.set(folderRef, folder.id);
  return folder;
}

/** Create a subfolder inside another folder ref (e.g. one from createTestSubfolder), for bookmarks nested several folders deep. */
export async function createTestSubfolderInFolder(
  ctx: TestContext,
  parentFolderRef: string,
  title: string,
  folderRef: string
): Promise<chrome.bookmarks.BookmarkTreeNode>
{
  const parentFolderId = ctx.refs.get(parentFolderRef);
  if (typeof parentFolderId !== 'string') throw new Error(`createTestSubfolderInFolder: no folder ref "${parentFolderRef}" - call createTestSubfolder first`);
  const folder = await ctx.createFolder(parentFolderId, title);
  ctx.refs.set(folderRef, folder.id);
  return folder;
}

/**
 * Create a pinned site and wait for it to land in storage, recording its id
 * in ctx.refs. Takes getCtx for signature consistency with createTestSpace,
 * not because it's strictly required: unlike createSpace/deleteSpace/
 * removePin (which close over a snapshot and need a fresh ctx between
 * calls, see createTestSpace's doc comment), usePinnedSites.ts's addPin
 * uses a functional setState updater and is safe to call twice in a row off
 * the same ctx.
 */
export async function createTestPinnedSite(
  getCtx: () => TestContext,
  title: string,
  url: string,
  pinRef: string
): Promise<void>
{
  const taggedTitle = `${TEST_PINNED_PREFIX}${title}`;
  const ctx = getCtx();
  await ctx.addPin(url, taggedTitle);

  // addPin() doesn't return the generated id - wait for it to show up in
  // chrome.storage.local directly (not ctx.pinnedSites, which is a snapshot
  // taken when this step started and won't reflect the write until
  // TestRunnerPanel re-renders). Listens for the write instead of polling -
  // the listener is attached before any await, so a write can't land in an
  // unobserved gap; the get() below only catches a write that completed
  // before this function was even called.
  type PinRecord = { id: string; title: string; url: string };
  const match = await new Promise<PinRecord>((resolve, reject) =>
  {
    const timeoutId = setTimeout(() =>
    {
      chrome.storage.onChanged.removeListener(handleChange);
      reject(new Error(`createTestPinnedSite: "${taggedTitle}" never appeared in storage`));
    }, 3000);

    function settle(found: PinRecord)
    {
      clearTimeout(timeoutId);
      chrome.storage.onChanged.removeListener(handleChange);
      resolve(found);
    }

    function handleChange(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string)
    {
      if (areaName !== 'local' || !changes[PINNED_SITES_STORAGE_KEY]) return;
      const sites: PinRecord[] = changes[PINNED_SITES_STORAGE_KEY].newValue ?? [];
      const found = sites.find(p => p.title === taggedTitle && p.url === url);
      if (found) settle(found);
    }

    chrome.storage.onChanged.addListener(handleChange);

    chrome.storage.local.get([PINNED_SITES_STORAGE_KEY]).then(stored =>
    {
      const sites: PinRecord[] = stored[PINNED_SITES_STORAGE_KEY] ?? [];
      const found = sites.find(p => p.title === taggedTitle && p.url === url);
      if (found) settle(found);
    });
  });

  ctx.refs.set(pinRef, match.id);
}

/**
 * Remove every test artifact this runner could have created, regardless of
 * which case created it - run before each case (clean slate) and once after
 * a full suite. Looks state up directly (storage, chrome.bookmarks) instead
 * of relying on ctx.refs, since resets also need to cover artifacts left
 * over from a run that errored or was abandoned mid-case.
 *
 * Takes getCtx, not a static ctx: deleteSpace/removePin are snapshot-based
 * (see createTestSpace's doc comment), so deleting more than one space or pin
 * needs a fresh ctx per iteration or every delete after the first is a no-op
 * against stale state.
 */
export async function resetTestData(getCtx: () => TestContext): Promise<void>
{
  const ctx = getCtx();

  // Close any OTHER window holding a test-tagged tab (e.g. left behind by
  // moveTabToNewWindow in A.6/A.6b/A.6c) - chrome.windows.remove() takes its
  // tabs with it, so this must run before the current-window tab cleanup
  // below would otherwise miss them entirely (that query is scoped to
  // ctx.windowId only). Each window's cleanup is independent of the others,
  // so run them concurrently rather than one at a time.
  const allWindows = await chrome.windows.getAll({ populate: true });
  const otherWindowsWithTestTabs = allWindows.filter(win =>
    win.id !== undefined && win.id !== ctx.windowId && (win.tabs ?? []).some(t => isTestTabUrl(t.url))
  );

  await Promise.all(otherWindowsWithTestTabs.map(async win =>
  {
    const winTabs = win.tabs ?? [];
    const testTabsInWindow = winTabs.filter(t => isTestTabUrl(t.url));

    // The doc's A.6/A.6b/A.6c manual steps permit dropping a tab into an
    // EXISTING second window, not just a freshly-popped-out one - if this
    // window also has real (non-test) tabs, only close the test ones,
    // don't take the whole window (and whatever real tabs are in it) down.
    if (testTabsInWindow.length === winTabs.length)
    {
      await chrome.windows.remove(win.id!);
    }
    else
    {
      const testTabIdsInWindow = testTabsInWindow.map(t => t.id).filter((id): id is number => id !== undefined);
      if (testTabIdsInWindow.length > 0) await chrome.tabs.remove(testTabIdsInWindow);
    }
  }));

  const tabs = await chrome.tabs.query({ windowId: ctx.windowId });
  const testTabIds = tabs
    .filter(t => isTestTabUrl(t.url))
    .map(t => t.id)
    .filter((id): id is number => id !== undefined);
  if (testTabIds.length > 0)
  {
    await chrome.tabs.remove(testTabIds);
  }

  const rootFolder = await findChild(OTHER_BOOKMARKS_ID, TEST_ROOT_FOLDER_TITLE);
  if (rootFolder)
  {
    await chrome.bookmarks.removeTree(rootFolder.id);
  }

  // Spaces created under the test root have it somewhere in their segment
  // path (getBookmarkSegments includes the "Other Bookmarks" ancestor first,
  // so this isn't always index 0) - delete via ctx.deleteSpace() (not a raw
  // storage write) so it also closes any tabs still sitting in the space's
  // Chrome group.
  const testSpaces = getCtx().spaces.filter(s => s.bookmarkFolderSegments?.includes(TEST_ROOT_FOLDER_TITLE));
  for (const space of testSpaces)
  {
    await getCtx().deleteSpace(space.id);
    await sleep(FIXTURE_TICK_MS);
  }

  const testPins = getCtx().pinnedSites.filter(p => p.title.startsWith(TEST_PINNED_PREFIX));
  for (const pin of testPins)
  {
    getCtx().removePin(pin.id);
    await sleep(FIXTURE_TICK_MS);
  }

  getCtx().refs.clear();

  // Section C cases (setFollowActiveTabMode) mutate a real, non-test-tagged
  // user setting rather than disposable test data - there's nothing to
  // "find and delete" for it the way there is for spaces/bookmarks/pins.
  // Reset it to the app's own documented default so a case that sets 'off'
  // doesn't silently leave every OTHER case (and the user's real sidebar)
  // running in 'off' afterward. Not a restore of whatever the user's own
  // prior preference was - same as the manual test doc already requires
  // testers to flip this in Settings and expect to reset it back by hand.
  await chrome.storage.local.set({ [FOLLOW_ACTIVE_TAB_KEY]: DEFAULT_FOLLOW_ACTIVE_TAB_MODE });
}
