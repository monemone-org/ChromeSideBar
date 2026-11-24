// Types for the in-panel test runner. Automates the workflow scenarios in
// docs/test/tab-space-association-test-cases.md by running entirely inside the
// panel's own React app (real chrome.* calls, real hooks/context, real DOM) -
// an external Playwright/CDP driver was tried first and abandoned because the
// side panel's own page never reliably surfaced as a Playwright `page` target.

import { Space } from '../../contexts/SpacesContext';
import { PinnedSite } from '../../hooks/usePinnedSites';

export interface TestResult
{
  name: string;
  passed: boolean;
  error?: string;
  // Free text the tester typed at a 'confirm' pause. Kept on a pass as well
  // as a failure - "the favicons rendered but looked stretched" is worth
  // recording even though the check passed.
  note?: string;
}

// Bundles the live hooks/context values a step needs. Rebuilt every render by
// TestRunnerPanel (see ctxRef there) - steps must read fields off the `ctx`
// they're given rather than caching one across an `await`, since the
// underlying hook callbacks (e.g. isBookmarkLoaded) close over React state
// that changes identity on every update.
export interface TestContext
{
  windowId: number;
  spaces: readonly Space[];
  pinnedSites: readonly PinnedSite[];
  // string/number for tab/bookmark/space/pin ids, or any other value a step
  // needs to hand off to a later step (e.g. a DeleteSpaceAction instance
  // between its do() and undo() steps)
  refs: Map<string, unknown>;

  // Spaces (SpacesContext)
  switchToSpace: (spaceId: string) => void;
  createSpace: (
    name: string,
    icon: string,
    color: string,
    bookmarkFolderPath: string,
    bookmarkFolderSegments: string[]
  ) => Space;
  getSpaceById: (id: string) => Space | undefined;
  deleteSpace: (id: string) => Promise<void>;
  updateSpace: (id: string, updates: Partial<Omit<Space, 'id'>>) => Promise<void>;
  activeSpaceId: string;

  // Bookmarks (useBookmarks)
  createFolder: (parentId: string, title: string) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  createBookmark: (parentId: string, title: string, url: string) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  moveBookmark: (
    sourceId: string,
    destinationId: string,
    position: 'before' | 'after' | 'into' | 'intoFirst'
  ) => Promise<chrome.bookmarks.BookmarkTreeNode | null>;
  getBookmarkSegments: (bookmarkId: string) => Promise<string[]>;
  findSpaceForFolder: (folderId: string) => Promise<Space | undefined>;

  // Bookmark/pinned <-> live tab association (BookmarkTabsContext)
  openBookmarkTab: (bookmarkId: string, url: string, spaceId?: string) => Promise<number | undefined>;
  openPinnedTab: (pinnedId: string, url: string) => Promise<number | undefined>;
  isBookmarkLoaded: (bookmarkId: string) => boolean;
  isPinnedLoaded: (pinnedId: string) => boolean;
  // What the bookmark row reads for its speaker icon and its drift check:
  // both come from this panel's per-tab state, not from Chrome directly.
  isBookmarkAudible: (bookmarkId: string) => boolean;
  getBookmarkLiveUrl: (bookmarkId: string) => string | undefined;
  getTabIdForBookmark: (bookmarkId: string) => number | undefined;
  // What PinnedBar hands DeletePinnedSiteAction, so P.3 can build the action
  // exactly the way the unpin menu item does.
  getTabIdForPinned: (pinnedId: string) => number | undefined;
  getItemKeyForTab: (tabId: number) => string | null;
  restoreItemAssociation: (tabId: number, itemKey: string) => Promise<void>;
  associateExistingTab: (tabId: number, bookmarkId: string, spaceId?: string) => Promise<void>;
  // What a bookmark row's "Move To Tabs" menu item calls: breaks the
  // association, leaving the tab open where it is.
  deassociateBookmarkTab: (bookmarkId: string) => void;
  // What the "Back to Bookmarked URL" / "Back to Pinned URL" menu items (and
  // clicking a drifted bookmark's favicon) call: navigate the tab back to the
  // saved URL.
  resetBookmarkTab: (bookmarkId: string, savedUrl: string) => Promise<void>;
  resetPinnedTab: (pinnedId: string, savedUrl: string) => Promise<void>;

  // Pinned sites (usePinnedSites). The whole hook surface, not just add and
  // remove: Section P's point is that every one of these reaches
  // PinnedSitesManager, so the cases drive the hook callbacks the UI uses
  // rather than calling the proxy underneath them.
  addPin: (url: string, title: string) => Promise<void>;
  removePin: (id: string) => void;
  updatePin: (
    id: string,
    title: string,
    url: string,
    favicon?: string,
    customIconName?: string,
    iconColor?: string,
    emoji?: string
  ) => void;
  resetFavicon: (id: string) => Promise<void>;
  movePin: (activeId: string, overId: string, position?: 'before' | 'after') => void;
  duplicatePin: (id: string, liveUrl?: string, liveTitle?: string, liveFavicon?: string) => void;
  replacePinnedSites: (sites: PinnedSite[]) => void;
  appendPinnedSites: (sites: PinnedSite[]) => void;
}

export type StepRunner = (ctx: TestContext) => Promise<void>;

// The ids a ResumeState checkpoint carries (see its doc comment below) - all
// a closed-panel runner has to go on, since it runs with no TestContext.
export type SavedRefs = Record<string, string | number>;

// Does a step's action on the parked page (test-parked.html, see parked.ts),
// where the sidebar app is unloaded and no React context exists - so it gets
// only the checkpoint's saved refs and must use raw chrome.* calls.
export type ClosedPanelRunner = (refs: SavedRefs) => Promise<void>;

// What a pause asks of the tester. A pause is only for what nothing inside
// the extension can do; everything the panel can do itself is an ordinary
// action or assert step, and everything that must happen with the sidebar
// unloaded is a closedPanel step.
//
// - `confirm` turns a pause into a question the tester answers Pass or Fail,
//   for checks the runner structurally cannot make. The answer becomes a
//   TestResult like any assert. Omit it for pauses that only ask for an
//   action to be performed.
// - `external` names an action only something outside the extension can do
//   (see ExternalAction). The panel treats such a pause exactly like a
//   manual one - banner, written instruction, Resume button - and only the
//   driver script (tools/run-inpanel-tests.mjs) acts on it, by reading the
//   checkpoint, doing the action and clicking Resume.
//
// The two are exclusive: an external pause has nobody to ask, and the panel
// only comes back once the step is over.
export type PauseOptions =
  | { confirm?: string; external?: undefined }
  | { confirm?: undefined; external: ExternalAction };

// What the driver script does for a pause marked `external`, from outside
// the extension over the DevTools protocol:
// - 'stop-service-worker': closes the extension's service worker target,
//   which stops it the way DevTools' Stop button does.
// - 'reload-extension': reloads the extension from chrome://extensions, then
//   reopens the side panel in the test window.
// - 'clear-browsing-data': deletes Chrome's browsing history for all time
//   through the Clear browsing data dialog, which also drops the stored
//   favicons. The driver does this only when Chrome runs on a profile inside
//   the project's tools/tmp/ folder and is not signed in to any account;
//   otherwise it leaves the pause to a person.
export type ExternalAction = 'stop-service-worker' | 'reload-extension' | 'clear-browsing-data';

/**
 * How a tester performs a step by hand, for the steps whose automated
 * version differs from a real user's input (simulated mouse events, a
 * message standing in for a key press, the parked page standing in for a
 * closed panel). With the runner's Manual mode on, such a step becomes a
 * pause that shows these instructions; with it off, the automated version
 * runs. `confirm` makes the pause ask a Pass/Fail question, for a step whose
 * automated version checks something the tester now has to judge.
 */
export interface ManualStep
{
  steps: string[];
  confirm?: string;
}

export type TestStep =
  | { kind: 'action'; label: string; run: StepRunner; manual?: ManualStep }
  | { kind: 'assert'; label: string; run: StepRunner; manual?: ManualStep }
  // Runs on the parked page with the sidebar app unloaded - from the
  // extension's side, the same state as a closed panel. The runner writes a
  // checkpoint and parks the panel; the parked page runs the step and sends
  // the panel back, which resumes on its own. A failure ends the case, like
  // a failed action.
  | { kind: 'closedPanel'; label: string; run: ClosedPanelRunner; manual?: ManualStep }
  | ({ kind: 'pause'; label: string; instruction: string } & PauseOptions);

export interface TestCase
{
  id: string;      // matches the doc's case id, e.g. "A.1"
  title: string;
  // Fixture creation, run once before step 0 of a fresh run. Takes a getter
  // (not a static TestContext) because SpacesContext's CRUD callbacks
  // (createSpace, deleteSpace) close over a snapshot of their own state -
  // calling one of them twice with the same stale ctx silently drops the
  // first call's write. Fixtures that call these more than once must
  // re-fetch via getCtx() between calls (see fixtures.ts). The pinned-site
  // callbacks are exempt: they write pinnedSitesManagerProxy's mirror, not a
  // captured list.
  setup?: (getCtx: () => TestContext) => Promise<void>;
  steps: TestStep[];
}

// Persisted to chrome.storage.local across a manual-pause step so the run
// can pick back up once the panel remounts. `refs` snapshots ctx.refs's
// string/number entries (tab/bookmark/space ids) - the live Map itself lives
// in a React ref and doesn't survive the panel's context tearing down, so
// resume steps would otherwise fail to look up ids set before the pause.
export interface ResumeState
{
  caseId: string;
  stepIndex: number;               // index of the pause or closedPanel step just reached
  results: TestResult[];           // results accumulated before that step
  refs: SavedRefs;
  // Written by the parked page (parked.ts) after it ran a closedPanel
  // step. Exactly one is set once it has run: parkedError when
  // the action threw, so the resumed run records a failed step instead of
  // carrying on as though the action had happened; parkedCompleted when it
  // succeeded. Neither is set on a checkpoint the parked page never touched,
  // which is how the panel tells a parked step from a manual one on mount.
  parkedError?: string;
  parkedCompleted?: boolean;
  // Copied from the pause step's `external` when it has one, so the driver
  // script can tell from storage alone which pauses it should act on. Absent
  // on every other checkpoint.
  external?: ExternalAction;
  // Set when Manual mode turned a step with a manual version into a pause:
  // the tester performs the step, and the banner shows its manual
  // instructions instead of running or parking for it.
  manual?: boolean;
}
