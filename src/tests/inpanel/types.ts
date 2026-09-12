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
  pinnedSites: PinnedSite[];
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
  getTabIdForBookmark: (bookmarkId: string) => number | undefined;
  getItemKeyForTab: (tabId: number) => string | null;
  restoreItemAssociation: (tabId: number, itemKey: string) => Promise<void>;
  associateExistingTab: (tabId: number, bookmarkId: string, spaceId?: string) => Promise<void>;

  // Pinned sites (usePinnedSites)
  addPin: (url: string, title: string) => Promise<void>;
  removePin: (id: string) => void;
}

export type StepRunner = (ctx: TestContext) => Promise<void>;

export type TestStep =
  | { kind: 'action'; label: string; run: StepRunner }
  | { kind: 'assert'; label: string; run: StepRunner }
  | { kind: 'pause'; label: string; instruction: string };

export interface TestCase
{
  id: string;      // matches the doc's case id, e.g. "A.1"
  title: string;
  // Fixture creation, run once before step 0 of a fresh run. Takes a getter
  // (not a static TestContext) because SpacesContext/usePinnedSites' CRUD
  // callbacks (createSpace, deleteSpace, removePin) close over a snapshot of
  // their own state - calling one of them twice with the same stale ctx
  // silently drops the first call's write. Fixtures that call these more
  // than once must re-fetch via getCtx() between calls (see fixtures.ts).
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
  stepIndex: number;               // index of the pause step just completed
  results: TestResult[];           // results accumulated before the pause
  refs: Record<string, string | number>;
}
