// DEV-only in-panel test runner UI. Wired into App.tsx's DEV dropdown, next to
// the existing "Unit Test ..." menu items. Runs the workflow-style cases in
// ./cases/* (which automate docs/test/tab-space-association-test-cases.md)
// entirely inside this component's own render tree, using the same hooks the
// real UI uses - see types.ts's TestContext doc comment for why ctxRef is
// rebuilt every render instead of captured once.
//
// Deliberately NOT the shared modal Dialog component - this renders inline
// as the last child in AppContainer's flex column (see App.tsx), docked
// below the rest of the sidebar (space bar included) with no backdrop, so
// you can keep using tabs/bookmarks/spaces while a run is in progress
// instead of it blocking the whole UI.

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical, X } from 'lucide-react';
import { useSpacesContext } from '../../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../../contexts/BookmarkTabsContext';
import { useBookmarks } from '../../hooks/useBookmarks';
import { useChromeLocalStorage } from '../../hooks/useChromeLocalStorage';
import { PinnedSite } from '../../hooks/usePinnedSites';
import { useFindSpaceForFolder } from '../../hooks/useFindSpaceForFolder';
import { ResumeState, TestCase, TestContext, TestResult } from './types';
import {
  clearAllCaseResults,
  clearBatchQueue,
  clearResumeState,
  readAllCaseResults,
  readBatchCaseIds,
  readBatchQueue,
  readResumeState,
  runFrom,
  writeBatchCaseIds,
  writeBatchQueue,
  writeCaseResult,
} from './runner';
import { resetTestData } from './fixtures';
import { sleep } from './stepHelpers';
import { ALL_CASES } from './cases';

// SpacesContext (and the other contexts this panel depends on) start with
// empty/default state and only populate via an async load on mount (the
// spaceManagerProxy/spaceWindowStateProxy mirror fills, see
// SpacesContext.tsx's mount effect) - every pause->close->reopen cycle is a
// fresh mount, racing that load against whatever the resumed run does next.
// Give it a moment to settle before driving anything, so
// resetTestData()/setup() don't read still-empty context state right after a
// remount.
const RESUME_SETTLE_MS = 800;

interface TestRunnerPanelProps
{
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // Passed down from App.tsx's own usePinnedSites() instance rather than
  // calling the hook again here. The list itself is now safe to read twice -
  // every instance of the hook reads the one mirror owned by
  // pinnedSitesManagerProxy - but the hook also runs a favicon-resolution
  // effect, and this panel is mounted unconditionally in DEV, so a second
  // instance would fetch and resolve the same icons a second time in
  // parallel with App's.
  pinnedSites: readonly PinnedSite[];
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

interface CaseSummary
{
  total: number;
  failed: number;
}

// Outcome of a "Run Tests" batch that finished cleanly (every queued case ran
// to completion - not stopped by a pause or an error). Cases, not steps: the
// per-row list already shows step-level pass/fail for each case, so the
// batch-level signal only needs to say how many cases came out clean. Covers
// the whole batch even if it paused and resumed along the way.
interface BatchSummary
{
  casesRun: number;
  casesFailed: number;
}

function summarize(results: TestResult[]): CaseSummary
{
  return { total: results.length, failed: results.filter(r => !r.passed).length };
}

/**
 * Whether a case can't run start-to-finish on its own - it has at least one
 * pause step, meaning it stops partway and needs the tester to do something
 * in Chrome's own UI (usually with the panel closed) before resuming. Worth
 * surfacing in the list: it's the difference between a case you can kick off
 * and walk away from and one that will sit waiting for you.
 */
function requiresManualSteps(testCase: TestCase): boolean
{
  return testCase.steps.some(step => step.kind === 'pause');
}

// Section a case belongs to, derived from its id's leading letter (e.g. "A"
// from "A.1") rather than a separate field - the id format already encodes
// it and every case in cases/* follows it.
function sectionOf(testCase: TestCase): string
{
  return testCase.id[0];
}

// Matches a URL mentioned in a paused step's instructions - either a
// chrome:// page ("chrome://extensions") or an http(s) address, which Section
// P's guided cases hand the tester to open (P.7's race URL, complete with its
// query string).
//
// The chrome:// half stays restricted to word/slash/hyphen characters. The
// http(s) half has to accept query strings, so it takes everything up to
// whitespace and then gives back any trailing sentence punctuation - see
// TRAILING_PUNCTUATION below.
const INSTRUCTION_URL_PATTERN = /chrome:\/\/[a-zA-Z0-9/_-]+|https?:\/\/[^\s]+/g;

// Sentence punctuation that follows a URL rather than belonging to it: the
// period after "...open https://example.com/x." or the comma in a list of
// two. A closing bracket is included for "(see https://example.com/x)".
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

// Opens a page from an instruction in a new tab. A plain <a href="chrome://...">
// can't navigate there - Chrome blocks that from page content - but the
// extension's own chrome.tabs API can, and using it for http(s) links too
// keeps one code path.
function openInstructionUrl(url: string): void
{
  void chrome.tabs.create({ url });
}

/** Splits `text` on any URLs it mentions, rendering each as a clickable link (see openInstructionUrl) and leaving the rest as plain text. */
function linkifyInstructionUrls(text: string, keyPrefix: string): ReactNode[]
{
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchCount = 0;
  INSTRUCTION_URL_PATTERN.lastIndex = 0;
  while ((match = INSTRUCTION_URL_PATTERN.exec(text)) !== null)
  {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    // Hand back any punctuation that ended the sentence rather than the URL,
    // and resume scanning from where the real URL stopped so that punctuation
    // still renders as text.
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    parts.push(
      <button
        key={`${keyPrefix}-url-${matchCount++}`}
        type="button"
        className="text-blue-600 dark:text-blue-400 underline hover:no-underline break-all text-left"
        onClick={() => openInstructionUrl(url)}
      >
        {url}
      </button>
    );
    lastIndex = match.index + url.length;
    INSTRUCTION_URL_PATTERN.lastIndex = lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// The two bits of markup an instruction line can use:
//
// `backticks` render as plain monospace text and are never linked, which is
// how a step asks for an address to be TYPED rather than clicked - a link
// opens in whichever window is running the test, and several steps need the
// page somewhere else, or are read before the panel is closed.
//
// **double asterisks** render bold, for naming a button, menu item or
// checkbox the tester has to find in Chrome's own UI.
const INSTRUCTION_MARKUP_PATTERN = /`([^`]+)`|\*\*([^*]+)\*\*/g;

/**
 * Renders one run of instruction text: marked-up spans render as themselves,
 * and everything between them gets its URLs linked.
 */
function renderInstructionText(text: string, keyPrefix: string): ReactNode[]
{
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchCount = 0;
  INSTRUCTION_MARKUP_PATTERN.lastIndex = 0;
  while ((match = INSTRUCTION_MARKUP_PATTERN.exec(text)) !== null)
  {
    if (match.index > lastIndex)
    {
      parts.push(...linkifyInstructionUrls(text.slice(lastIndex, match.index), `${keyPrefix}-text-${matchCount}`));
    }

    const [, code, bold] = match;
    parts.push(code !== undefined
      ? (
        <code
          key={`${keyPrefix}-code-${matchCount++}`}
          className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded break-all"
        >
          {code}
        </code>
      )
      : (
        <strong key={`${keyPrefix}-bold-${matchCount++}`} className="font-semibold">
          {bold}
        </strong>
      ));

    lastIndex = INSTRUCTION_MARKUP_PATTERN.lastIndex;
  }
  if (lastIndex < text.length)
  {
    parts.push(...linkifyInstructionUrls(text.slice(lastIndex), `${keyPrefix}-text-last`));
  }
  return parts;
}

/**
 * Renders one numbered line of a paused step's instructions (see pause() in
 * actions.ts). Steps in cases/* consistently write "<action> - <why/what to
 * expect>" when there's an aside to add, so splitting on the first " - " and
 * dimming everything after it separates the actual action from the
 * explanation instead of running them together as one same-weight sentence.
 * Lines with no " - " (most of them) render unchanged.
 */
function renderPausedLine(line: string, key: number): JSX.Element
{
  const numberMatch = /^(\d+\. )(.*)$/.exec(line);
  const prefix = numberMatch ? numberMatch[1] : '';
  const rest = numberMatch ? numberMatch[2] : line;

  const splitIndex = rest.indexOf(' - ');
  const action = splitIndex === -1 ? rest : rest.slice(0, splitIndex);
  const explanation = splitIndex === -1 ? null : rest.slice(splitIndex); // keeps the leading " - "

  return (
    <div key={key}>
      {prefix}
      {renderInstructionText(action, `line-${key}-action`)}
      {explanation !== null && (
        <span className="text-gray-500 dark:text-gray-400">
          {renderInstructionText(explanation, `line-${key}-explanation`)}
        </span>
      )}
    </div>
  );
}

// Fixed section letters shown as select-all checkboxes, not derived from
// ALL_CASES - keeps the checkbox order stable (A before B before C...)
// regardless of case registration order.
const ALL_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'P'];

// chrome.storage.local key for the ids of cases the tester has unchecked.
const DESELECTED_CASES_STORAGE_KEY = 'testRunnerDeselectedCaseIds';

type SectionCheckState = 'all' | 'some' | 'none';

/**
 * Which cases "Run Tests" will queue. Immutable: every with*() method returns
 * a new CaseSelection, so it can sit in a useMemo and be swapped wholesale.
 *
 * Remembers the DESELECTED ids rather than the selected ones. Everything
 * starts checked, and a case added to ALL_CASES later shows up checked
 * without the stored list needing to know about it.
 */
class CaseSelection
{
  private readonly deselectedIds: ReadonlySet<string>;

  constructor(deselectedIds: Iterable<string> = [])
  {
    this.deselectedIds = new Set(deselectedIds);
  }

  /** The form persisted to chrome.storage.local - feed it back to the constructor to restore. */
  toStored(): string[]
  {
    return [...this.deselectedIds];
  }

  isSelected(caseId: string): boolean
  {
    return !this.deselectedIds.has(caseId);
  }

  /** The checked cases, in `cases` order (not click order - some cases lean on earlier state). */
  selectedCases(cases: readonly TestCase[]): TestCase[]
  {
    return cases.filter(c => this.isSelected(c.id));
  }

  /** Whether every, some, or none of the section's cases are checked - drives the section checkbox's tri-state look. */
  sectionState(section: string, cases: readonly TestCase[]): SectionCheckState
  {
    const inSection = cases.filter(c => sectionOf(c) === section);
    const selectedCount = inSection.filter(c => this.isSelected(c.id)).length;
    if (selectedCount === 0) return 'none';
    return selectedCount === inSection.length ? 'all' : 'some';
  }

  withCaseToggled(caseId: string): CaseSelection
  {
    const next = new Set(this.deselectedIds);
    if (next.has(caseId)) next.delete(caseId);
    else next.add(caseId);
    return new CaseSelection(next);
  }

  /** Unchecks the whole section if it was fully checked, otherwise checks all of it (so a partial section fills up rather than emptying). */
  withSectionToggled(section: string, cases: readonly TestCase[]): CaseSelection
  {
    const selectAll = this.sectionState(section, cases) !== 'all';
    const next = new Set(this.deselectedIds);

    // Apply the same direction to every case in the section.
    for (const testCase of cases)
    {
      if (sectionOf(testCase) !== section) continue;
      if (selectAll) next.delete(testCase.id);
      else next.add(testCase.id);
    }
    return new CaseSelection(next);
  }

  /** Checks exactly the given cases and unchecks every other case in `cases`. */
  static onlyChecking(caseIds: ReadonlySet<string>, cases: readonly TestCase[]): CaseSelection
  {
    return new CaseSelection(cases.filter(c => !caseIds.has(c.id)).map(c => c.id));
  }
}

interface SectionCheckboxProps
{
  section: string;
  state: SectionCheckState;
  disabled: boolean;
  onToggle: () => void;
}

// Checkbox for a whole section. Shows the dash ("indeterminate") look while
// only some of the section's cases are checked.
const SectionCheckbox = ({ section, state, disabled, onToggle }: SectionCheckboxProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null);

  // `indeterminate` exists only as a DOM property, not as a React prop.
  useEffect(() =>
  {
    if (inputRef.current) inputRef.current.indeterminate = state === 'some';
  }, [state]);

  return (
    <label className="flex items-center gap-1 cursor-pointer select-none">
      <input
        ref={inputRef}
        type="checkbox"
        checked={state === 'all'}
        onChange={onToggle}
        disabled={disabled}
      />
      <span>{section}</span>
    </label>
  );
};

export const TestRunnerPanel = ({
  isOpen,
  onOpenChange,
  pinnedSites,
  addPin,
  removePin,
  updatePin,
  resetFavicon,
  movePin,
  duplicatePin,
  replacePinnedSites,
  appendPinnedSites,
}: TestRunnerPanelProps) =>
{
  const spacesCtx = useSpacesContext();
  const bookmarkTabsCtx = useBookmarkTabsContext();
  const bookmarksCtx = useBookmarks();
  const findSpaceForFolder = useFindSpaceForFolder(bookmarksCtx.getBookmarkSegments, spacesCtx.spaces);

  const refsMapRef = useRef<Map<string, unknown>>(new Map());
  const ctxRef = useRef<TestContext | null>(null);

  ctxRef.current = spacesCtx.windowId === null ? null : {
    windowId: spacesCtx.windowId,
    spaces: spacesCtx.spaces,
    pinnedSites,
    refs: refsMapRef.current,
    switchToSpace: spacesCtx.switchToSpace,
    createSpace: spacesCtx.createSpace,
    getSpaceById: spacesCtx.getSpaceById,
    deleteSpace: spacesCtx.deleteSpace,
    // SpacesContext types updateSpace as returning void even though its
    // implementation is async (syncs the Chrome group's title/color before
    // resolving) - await the real underlying promise here so callers that
    // need the Chrome-group sync to finish (e.g. D.1) can rely on it.
    updateSpace: async (id, updates) => { await spacesCtx.updateSpace(id, updates); },
    activeSpaceId: spacesCtx.activeSpaceId,
    createFolder: (parentId, title) => chrome.bookmarks.create({ parentId, title }),
    createBookmark: async (parentId, title, url) =>
    {
      const { node, error } = await bookmarksCtx.createBookmark(parentId, title, url);
      if (error || !node) throw new Error(error ?? 'createBookmark failed');
      return node;
    },
    moveBookmark: bookmarksCtx.moveBookmark,
    getBookmarkSegments: bookmarksCtx.getBookmarkSegments,
    findSpaceForFolder,
    openBookmarkTab: bookmarkTabsCtx.openBookmarkTab,
    openPinnedTab: bookmarkTabsCtx.openPinnedTab,
    isBookmarkLoaded: bookmarkTabsCtx.isBookmarkLoaded,
    isPinnedLoaded: bookmarkTabsCtx.isPinnedLoaded,
    getTabIdForBookmark: bookmarkTabsCtx.getTabIdForBookmark,
    getTabIdForPinned: bookmarkTabsCtx.getTabIdForPinned,
    getItemKeyForTab: bookmarkTabsCtx.getItemKeyForTab,
    restoreItemAssociation: bookmarkTabsCtx.restoreItemAssociation,
    associateExistingTab: bookmarkTabsCtx.associateExistingTab,
    deassociateBookmarkTab: bookmarkTabsCtx.deassociateBookmarkTab,
    addPin,
    removePin,
    updatePin,
    resetFavicon,
    movePin,
    duplicatePin,
    replacePinnedSites,
    appendPinnedSites,
  };

  const [pausedState, setPausedState] = useState<ResumeState | null>(null);
  // What the tester typed at a 'confirm' pause. Cleared on resume so the next
  // question starts blank rather than inheriting the previous answer's text.
  const [confirmNote, setConfirmNote] = useState('');
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  // Per-case, not a single flat log - each case keeps its own last (or
  // in-progress) step results, so running case B doesn't erase case A's
  // history from view. Keyed by TestCase.id.
  const [caseResults, setCaseResults] = useState<Record<string, TestResult[]>>({});
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());
  const [panelError, setPanelError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  // Case ids still to run after whichever case is currently paused/running as
  // part of a "Run All" batch - null when there's no batch in progress. See
  // runQueue()/runner.ts's writeBatchQueue for why this needs to be
  // persisted rather than just a local variable in runAll()'s loop.
  const [batchQueue, setBatchQueue] = useState<string[] | null>(null);
  // Every case id the in-progress batch started with, as opposed to
  // batchQueue's "still to run". Lets the completion popup count the whole
  // batch after a pause/resume. null when there's no batch in progress.
  const [batchCaseIds, setBatchCaseIds] = useState<string[] | null>(null);
  // Set once a "Run Tests" batch finishes cleanly (see runQueue) - the only
  // proactive signal that the whole batch is done, since the button reverting
  // from "Running tests…" back to "Run Tests" is easy to miss. Shown as a
  // popup over the panel until dismissed. Not persisted: it's a one-off
  // notice for the run you just watched, not state to restore across a
  // remount (unlike ResumeState/CaseResultsMap/BATCH_QUEUE).
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  // Whether the title bar's [...] overflow menu is open - local UI state, not
  // persisted.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Whether the failures summary is showing. Opened from the [...] menu, and
  // deliberately not persisted: it is a way to read the run you just watched,
  // not a mode the panel should come back in.
  const [showFailures, setShowFailures] = useState(false);
  // Which cases "Run Tests" queues. Persisted (unlike a view filter) so the
  // same hand-picked subset survives the panel remounting and can be re-run
  // as-is. The list always shows every case; this only decides what runs.
  const [deselectedCaseIds, setDeselectedCaseIds] = useChromeLocalStorage<string[]>(DESELECTED_CASES_STORAGE_KEY, []);
  const selection = useMemo(() => new CaseSelection(deselectedCaseIds), [deselectedCaseIds]);

  function updateSelection(next: CaseSelection)
  {
    setDeselectedCaseIds(next.toStored());
  }

  function toggleExpanded(caseId: string)
  {
    setExpandedCaseIds(prev =>
    {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }

  // Runs on every mount of the sidebar (this component is always mounted in
  // DEV, regardless of `isOpen`) - restores every case's last persisted
  // result (see CaseResultsMap's doc comment in runner.ts) and detects a
  // checkpoint left by a manual-pause step in a previous session.
  useEffect(() =>
  {
    (async () =>
    {
      const [resume, allResults, queue, batchIds] = await Promise.all([
        readResumeState(),
        readAllCaseResults(),
        readBatchQueue(),
        readBatchCaseIds(),
      ]);

      const merged = { ...allResults };
      if (resume) merged[resume.caseId] = resume.results;
      setCaseResults(merged);

      const failedCaseIds = Object.entries(allResults)
        .filter(([, results]) => results.some(r => !r.passed))
        .map(([id]) => id);

      if (resume)
      {
        setPausedState(resume);
        setBatchQueue(queue ?? null);
        setBatchCaseIds(batchIds ?? null);
        setExpandedCaseIds(new Set([resume.caseId, ...failedCaseIds]));
        onOpenChange(true);
      }
      else if (failedCaseIds.length > 0)
      {
        // Only force the dialog open for a failure; a clean pass can just
        // wait to be seen next time you open the panel yourself.
        setExpandedCaseIds(new Set(failedCaseIds));
        onOpenChange(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returns whether a caller running a batch (runAll) should continue on to
  // the next case - false on a pause (needs your manual step before anything
  // else can run) or an error, true otherwise.
  async function runCase(testCase: TestCase, resume?: ResumeState): Promise<boolean>
  {
    const ctx = ctxRef.current;
    if (!ctx)
    {
      setPanelError('Window not ready yet - try again in a moment.');
      return false;
    }

    setPanelError(null);
    setRunningCaseId(testCase.id);
    setPausedState(null);
    setBatchSummary(null);
    setCaseResults(prev => ({ ...prev, [testCase.id]: resume?.results ?? [] }));
    setExpandedCaseIds(prev => new Set(prev).add(testCase.id));

    const getCtx = () => ctxRef.current ?? ctx;

    try
    {
      if (resume)
      {
        Object.entries(resume.refs).forEach(([key, value]) => ctx.refs.set(key, value));
      }
      else
      {
        await resetTestData(getCtx);
        await testCase.setup?.(getCtx);
      }

      const fromIndex = resume ? resume.stepIndex + 1 : 0;
      const priorResults = resume ? resume.results : [];

      const outcome = await runFrom(
        testCase,
        fromIndex,
        priorResults,
        getCtx,
        (result) => setCaseResults(prev => ({ ...prev, [testCase.id]: [...(prev[testCase.id] ?? []), result] }))
      );

      if (outcome.pausedAt)
      {
        const stored = await readResumeState();
        setPausedState(stored ?? null);
        return false;
      }

      await clearResumeState();
      await writeCaseResult(testCase.id, outcome.results);
      setCaseResults(prev => ({ ...prev, [testCase.id]: outcome.results }));
      return true;
    }
    catch (err)
    {
      setPanelError(err instanceof Error ? err.message : String(err));
      return false;
    }
    finally
    {
      setRunningCaseId(null);
    }
  }

  // Runs the given case ids in order, from scratch, persisting the
  // remaining queue before each one so a pause (which closes the whole
  // panel, unmounting this component and any in-memory loop state with it)
  // can pick the batch back up afterward - see the mount effect and
  // handleResume(), the other two places that touch the persisted queue.
  //
  // `resumedBatchCaseIds` is only passed when continuing a batch that already
  // started (from handleResume): `caseIds` is then just what's left, and this
  // is the full list the batch began with, so the completion popup can count
  // all of it. A fresh batch omits it and `caseIds` is the whole batch.
  async function runQueue(caseIds: string[], resumedBatchCaseIds?: string[])
  {
    setRunningAll(true);
    setBatchSummary(null);
    const wholeBatchCaseIds = resumedBatchCaseIds ?? caseIds;
    try
    {
      if (!resumedBatchCaseIds)
      {
        await writeBatchCaseIds(caseIds);
        setBatchCaseIds(caseIds);
      }

      for (let i = 0; i < caseIds.length; i++)
      {
        const testCase = ALL_CASES.find(c => c.id === caseIds[i]);
        if (!testCase) continue;

        const remaining = caseIds.slice(i + 1);
        await writeBatchQueue(remaining);
        setBatchQueue(remaining);

        const completed = await runCase(testCase);
        if (!completed) return; // paused or errored - queue stays persisted, resumed from handleResume() or a fresh Run All
      }
      await clearBatchQueue();
      setBatchQueue(null);
      setBatchCaseIds(null);

      // The queue ran to completion (no pause, no error) - this is the only
      // point that counts as "the batch is done", so it's where the
      // completion popup's summary gets computed. Read back the
      // just-persisted per-case results rather than the caseResults state
      // (which each runCase call updates independently) so this doesn't race
      // a state update that hasn't landed yet. ALL_CASES.some(...) guards
      // against the same "id not found" case the loop above already skips.
      const allResults = await readAllCaseResults();
      const ranCaseIds = wholeBatchCaseIds.filter(id => ALL_CASES.some(c => c.id === id));
      const casesFailed = ranCaseIds.filter(id => (allResults[id] ?? []).some(r => !r.passed)).length;
      setBatchSummary({ casesRun: ranCaseIds.length, casesFailed });
    }
    finally
    {
      setRunningAll(false);
    }
  }

  // Runs the checked cases, in registry order (see CaseSelection.selectedCases).
  function runAll()
  {
    return runQueue(selectedCases.map(c => c.id));
  }

  // Resumes the paused case, then - if it was part of a "Run All" batch and
  // didn't pause/error again - continues the rest of that batch. Without
  // this, resuming only ever advanced the one case the run happened to
  // pause on, leaving every later case in the batch un-run until you
  // manually clicked Run All again.
  /**
   * Resumes the paused case. `verdict` and `note` are only passed from a
   * 'confirm' pause, where the tester answers a question the runner cannot
   * check itself; a plain pause resumes with neither.
   *
   * The verdict is turned into a TestResult here rather than in runFrom
   * because the run restarts at the step AFTER the pause and so never
   * revisits it - see runCase's fromIndex.
   */
  async function handleResume(verdict?: boolean, note?: string)
  {
    if (!pausedCase || !pausedState) return;

    let state = pausedState;
    if (verdict !== undefined)
    {
      // Derived here rather than read off pausedConfirm below, which is
      // declared further down the component and would be a forward reference.
      const step = pausedCase.steps[pausedState.stepIndex];
      const result: TestResult = {
        name: step.kind === 'pause' && step.confirm ? step.confirm : step.label,
        passed: verdict,
      };
      if (note) result.note = note;
      // Without a note there'd be nothing under a red line explaining it, so
      // say plainly that a person called it rather than an assertion.
      if (!verdict && !note) result.error = 'Reported as failed by the tester, with no note.';

      state = { ...pausedState, results: [...pausedState.results, result] };
    }
    setConfirmNote('');

    // setRunningAll (not runningCaseId - runCase hasn't started yet) so the
    // buttons are already disabled during the settle wait below, not just
    // once runCase begins.
    setRunningAll(true);
    try
    {
      await sleep(RESUME_SETTLE_MS);

      if (batchQueue === null)
      {
        await runCase(pausedCase, state);
        return;
      }

      const completed = await runCase(pausedCase, state);
      if (completed) await runQueue(batchQueue, batchCaseIds ?? undefined);
    }
    finally
    {
      setRunningAll(false);
    }
  }

  async function discardPausedRun()
  {
    await clearResumeState();
    await clearBatchQueue();
    setPausedState(null);
    setBatchQueue(null);
    setBatchCaseIds(null);
  }

  async function clearResults()
  {
    await clearAllCaseResults();
    setCaseResults({});
    setExpandedCaseIds(new Set());
  }

  // Serializes the currently-held results (whatever's in caseResults, same
  // data the list renders) to a JSON file and triggers a browser download.
  // Ordered by ALL_CASES rather than Object.keys(caseResults) so the file
  // reads top-to-bottom the same way the panel's list does, regardless of
  // which order cases happened to run in. `onlyFailed` narrows the file to
  // cases with at least one failing result - see downloadFailedResults below.
  function downloadResults(onlyFailed = false)
  {
    const cases = ALL_CASES
      .filter(testCase => caseResults[testCase.id])
      .map(testCase =>
      {
        const results = caseResults[testCase.id];
        const summary = summarize(results);
        return {
          id: testCase.id,
          title: testCase.title,
          section: sectionOf(testCase),
          passed: summary.failed === 0,
          total: summary.total,
          failed: summary.failed,
          results,
        };
      })
      .filter(testCase => !onlyFailed || !testCase.passed);

    const payload = {
      generatedAt: new Date().toISOString(),
      cases,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `test-results${onlyFailed ? '-failed' : ''}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadFailedResults()
  {
    downloadResults(true);
  }

  // The checked cases - what "Run Tests" queues up. The rendered list is
  // always the full ALL_CASES, checked or not.
  const selectedCases = selection.selectedCases(ALL_CASES);
  // Cases whose last recorded result has at least one failing step - what
  // "Select failed" re-checks.
  const failedCaseIds = new Set(
    ALL_CASES.filter(c => caseResults[c.id]?.some(r => !r.passed)).map(c => c.id)
  );
  const isBusy = runningCaseId !== null || runningAll;

  const pausedCase = pausedState ? ALL_CASES.find(c => c.id === pausedState.caseId) : undefined;
  const pausedStep = pausedCase && pausedState ? pausedCase.steps[pausedState.stepIndex] : undefined;
  const pausedInstruction = pausedStep?.kind === 'pause' ? pausedStep.instruction : '';
  // Set only on a pause that asks the tester to judge something. Its presence
  // is what swaps the banner's single Resume button for Pass/Fail.
  const pausedConfirm = pausedStep?.kind === 'pause' ? pausedStep.confirm : undefined;
  const hasAnyResults = Object.keys(caseResults).length > 0;
  const hasAnyFailedResults = Object.values(caseResults).some(results => results.some(r => !r.passed));

  // Every failing step of every failing case, in the list's own order, for the
  // summary the [...] menu opens. Built here rather than inside the JSX so the
  // render below stays a plain map over it.
  const failures = ALL_CASES
    .filter(testCase => caseResults[testCase.id]?.some(result => !result.passed))
    .map(testCase => ({
      testCase,
      steps: caseResults[testCase.id].filter(result => !result.passed),
    }));

  if (!isOpen) return null;

  return (
    <div
      className="relative flex-shrink-0 flex flex-col border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      style={{ height: '45vh' }}
    >
      <div className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">Test Runner (dev)</h3>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(prev => !prev)}
              aria-label="More actions"
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
            >
              <MoreVertical size={16} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[10rem] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1">
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => { downloadResults(); setIsMenuOpen(false); }}
                  disabled={!hasAnyResults}
                  title="Download the results shown below as a JSON file"
                >
                  Download Results
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => { downloadFailedResults(); setIsMenuOpen(false); }}
                  disabled={!hasAnyFailedResults}
                  title="Download only the cases with at least one failing result, as a JSON file"
                >
                  Download Failed Results Only
                </button>
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => { setShowFailures(prev => !prev); setIsMenuOpen(false); }}
                  disabled={!hasAnyFailedResults}
                  title="List every failing case and the steps that failed, without scrolling the list below"
                >
                  {showFailures ? 'Hide Failed Tests and Steps' : 'Show Failed Tests and Steps'}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close test runner"
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-3 space-y-3 text-sm text-gray-900 dark:text-gray-100">
        {panelError && (
          <div className="p-2 rounded bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">
            {panelError}
          </div>
        )}

        {showFailures && failures.length > 0 && (
          <div className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-red-200 dark:border-red-800">
              <span className="font-medium text-red-800 dark:text-red-200">
                {failures.length} failed {failures.length === 1 ? 'case' : 'cases'}
              </span>
              <button
                onClick={() => setShowFailures(false)}
                aria-label="Hide failed tests"
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-2 space-y-2">
              {failures.map(({ testCase, steps }) => (
                <div key={`failure-${testCase.id}`}>
                  {/* The case id opens the case below, so reading a failure
                      and jumping to its full step list is one click. */}
                  <button
                    className="text-left font-medium text-red-800 dark:text-red-200 hover:underline"
                    onClick={() =>
                    {
                      setShowFailures(false);
                      setExpandedCaseIds(new Set([testCase.id]));
                      document.getElementById(`test-case-${testCase.id}`)?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {testCase.id} {testCase.title}
                  </button>
                  <ul className="mt-0.5 ml-3 space-y-0.5 text-gray-700 dark:text-gray-300">
                    {steps.map((step, index) => (
                      <li key={`failure-${testCase.id}-${index}`}>
                        {step.name}
                        {step.error && (
                          <span className="block text-gray-500 dark:text-gray-400">{step.error}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-2">
          {/* Select-all toggles for a section's cases - they don't hide anything, the list below always shows every case. */}
          <div className="flex items-center gap-2">
            {ALL_SECTIONS.map(section => (
              <SectionCheckbox
                key={section}
                section={section}
                state={selection.sectionState(section, ALL_CASES)}
                onToggle={() => updateSelection(selection.withSectionToggled(section, ALL_CASES))}
                disabled={isBusy}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              onClick={() => updateSelection(CaseSelection.onlyChecking(failedCaseIds, ALL_CASES))}
              disabled={isBusy || failedCaseIds.size === 0}
              title="Check only the cases whose last result has a failing step, and uncheck everything else"
            >
              Select failed
            </button>
            <button
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              onClick={clearResults}
              disabled={isBusy || !hasAnyResults}
              title="Several cases have a known-gap assertion that's expected to currently fail - clear results here once you've seen it, so the panel stops auto-opening for it on every sidebar open."
            >
              Clear Results
            </button>
            <button
              className="px-2 py-1 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
              onClick={runAll}
              disabled={isBusy || selectedCases.length === 0}
            >
              {runningAll ? `Running tests… (${runningCaseId ?? ''})` : `Run Tests (${selectedCases.length})`}
            </button>
          </div>
        </div>

        <div className="space-y-0.5">
          {ALL_CASES.map(testCase =>
          {
            const results = caseResults[testCase.id];
            const summary = results ? summarize(results) : null;
            const isExpanded = expandedCaseIds.has(testCase.id);
            const isPausedHere = pausedState?.caseId === testCase.id;

            return (
              // id is the scroll target the failures summary jumps to.
              <div key={testCase.id} id={`test-case-${testCase.id}`} className="border-b border-gray-100 dark:border-gray-700 py-1">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="checkbox"
                    className="flex-shrink-0"
                    checked={selection.isSelected(testCase.id)}
                    onChange={() => updateSelection(selection.withCaseToggled(testCase.id))}
                    disabled={isBusy}
                    aria-label={`Include ${testCase.id} in Run Tests`}
                  />
                  <div
                    className={`flex-1 flex items-center gap-1 ${results ? 'cursor-pointer select-none' : ''}`}
                    onClick={() => results && toggleExpanded(testCase.id)}
                    role={results ? 'button' : undefined}
                    tabIndex={results ? 0 : undefined}
                  >
                    <span className="text-gray-400 w-3 inline-block flex-shrink-0">
                      {results ? (isExpanded ? '▾' : '▸') : ''}
                    </span>
                    <span className="font-mono text-xs text-gray-500 mr-1">{testCase.id}</span>
                    <span>{testCase.title}</span>
                    {requiresManualSteps(testCase) && (
                      <span
                        className="ml-1 px-1 rounded text-[10px] leading-4 flex-shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                        title="Pauses partway and needs you to do something in Chrome (usually with the panel closed), then reopen to resume"
                      >
                        ✋
                      </span>
                    )}
                    {isPausedHere ? (
                      <span className="ml-2 text-amber-600">paused</span>
                    ) : summary && (
                      <span className={summary.failed === 0 ? 'ml-2 text-green-600' : 'ml-2 text-red-600'}>
                        {summary.failed === 0 ? `${summary.total}/${summary.total} passed` : `${summary.failed}/${summary.total} failed`}
                      </span>
                    )}
                  </div>
                  <button
                    className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
                    onClick={() => runCase(testCase)}
                    disabled={runningCaseId !== null || runningAll}
                  >
                    {runningCaseId === testCase.id ? 'Running…' : 'Run'}
                  </button>
                </div>
                {isExpanded && results && results.length > 0 && (
                  <ul className="mt-1 ml-4 space-y-0.5 font-mono text-xs max-h-48 overflow-y-auto">
                    {results.map((result, i) => (
                      <li key={i} className={result.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                        {result.passed ? '✓' : '✗'} {result.name}
                        {result.error && <span className="block pl-4 text-gray-500">{result.error}</span>}
                        {result.note && <span className="block pl-4 text-gray-500 italic">{result.note}</span>}
                      </li>
                    ))}
                    {/* Only shown once the case has actually stopped running (not mid-run, not paused on a manual step) - marks the log as complete rather than possibly still in progress. */}
                    {!isPausedHere && runningCaseId !== testCase.id && (
                      <li className="text-gray-400">— done —</li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Floats over the panel rather than sitting in the scrolling list: a
        paused run halts everything until you act on it, but the case it
        belongs to can be anywhere in a list that's now long enough to scroll
        (all of Section C sits well below the fold), so an in-flow banner
        scrolls out of sight exactly when it's the only thing that matters.
        Rendered after the scroll container so it paints on top.
      */}
      {pausedState && pausedCase && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 z-10 max-h-[85%] overflow-y-auto p-2 rounded border border-amber-400 bg-amber-50 dark:bg-amber-900/95 shadow-lg text-sm text-gray-900 dark:text-gray-100">
          <div className="font-medium mb-1">
            Paused at step {pausedState.stepIndex + 1} of {pausedCase.id} - {pausedCase.title}
          </div>
          {batchQueue !== null && (
            <div className="mb-1 text-xs text-amber-700 dark:text-amber-400">
              Part of a Run All batch - {batchQueue.length} more case{batchQueue.length === 1 ? '' : 's'} queued after this one.
            </div>
          )}
          <div className="mb-2 text-gray-700 dark:text-gray-300">
            {pausedInstruction.split('\n').map((line, i) => renderPausedLine(line, i))}
          </div>
          {/*
            A confirm pause is the only place a person's own judgement enters
            the results, so it gets the question spelled out again next to the
            answer rather than left buried in the numbered instructions above.
          */}
          {pausedConfirm && (
            <div className="mb-2">
              <div className="font-medium mb-1">{pausedConfirm}</div>
              <textarea
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="Optional note - what you actually saw. Worth filling in on a Fail."
                rows={2}
                className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            {pausedConfirm ? (
              <>
                <button
                  className="px-2 py-1 rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-50"
                  onClick={() => handleResume(true, confirmNote.trim())}
                  disabled={runningCaseId !== null || runningAll}
                >
                  Pass
                </button>
                <button
                  className="px-2 py-1 rounded bg-red-700 text-white hover:bg-red-800 disabled:opacity-50"
                  onClick={() => handleResume(false, confirmNote.trim())}
                  disabled={runningCaseId !== null || runningAll}
                >
                  Fail
                </button>
              </>
            ) : (
              <button
                className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                onClick={() => handleResume()}
                disabled={runningCaseId !== null || runningAll}
              >
                I've done it - Resume{batchQueue !== null ? ' & Continue Batch' : ''}
              </button>
            )}
            <button
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              onClick={discardPausedRun}
              disabled={runningCaseId !== null || runningAll}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/*
        The "batch finished" signal. A popup over the whole panel (dimmed
        backdrop, stays until dismissed) rather than a slim banner, since the
        banner was too easy to miss when you're looking at Chrome or a tab
        instead of the panel. Never shows together with the paused box above:
        batchSummary is only set when a batch ran to completion.

        The keyframes are declared inline (not in tailwind.config.js) because
        only this popup uses them: a quick pop-in, then a ring that pulses out
        three times to catch the eye.
      */}
      {batchSummary && (
        <div
          role="alertdialog"
          aria-label="All tests done"
          className="absolute inset-0 z-20 flex items-center justify-center p-3 bg-black/40"
        >
          <style>{`
            @keyframes testRunnerDonePopIn {
              from { opacity: 0; transform: scale(0.85); }
              to { opacity: 1; transform: scale(1); }
            }
            @keyframes testRunnerDoneRing {
              from { box-shadow: 0 0 0 0 var(--test-runner-done-ring); }
              to { box-shadow: 0 0 0 16px transparent; }
            }
            .test-runner-done-card {
              animation: testRunnerDonePopIn 200ms ease-out, testRunnerDoneRing 800ms ease-out 200ms 3;
            }
            @media (prefers-reduced-motion: reduce) {
              .test-runner-done-card { animation: none; }
            }
          `}</style>
          <div
            className={`test-runner-done-card w-full max-w-xs p-4 rounded-lg border-2 shadow-xl text-center ${
              batchSummary.casesFailed === 0
                ? 'border-green-600 bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100'
                : 'border-red-600 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100'
            }`}
            style={{
              '--test-runner-done-ring': batchSummary.casesFailed === 0 ? 'rgba(22, 163, 74, 0.6)' : 'rgba(220, 38, 38, 0.6)',
            } as CSSProperties}
          >
            <div className="text-base font-semibold">All tests done</div>
            <div className="mt-2 text-2xl font-bold">
              {batchSummary.casesRun - batchSummary.casesFailed} of {batchSummary.casesRun} cases passed
            </div>
            {batchSummary.casesFailed > 0 && (
              <div className="mt-1 text-sm font-medium">{batchSummary.casesFailed} failed</div>
            )}
            <div className="mt-3 flex justify-center gap-2">
              {batchSummary.casesFailed > 0 && (
                <button
                  className="px-3 py-1 rounded border border-red-600 hover:bg-red-100 dark:hover:bg-red-900"
                  onClick={() =>
                  {
                    updateSelection(CaseSelection.onlyChecking(failedCaseIds, ALL_CASES));
                    setBatchSummary(null);
                  }}
                >
                  Select failed
                </button>
              )}
              <button
                className={`px-3 py-1 rounded text-white ${
                  batchSummary.casesFailed === 0 ? 'bg-green-700 hover:bg-green-800' : 'bg-red-700 hover:bg-red-800'
                }`}
                onClick={() => setBatchSummary(null)}
                autoFocus
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
