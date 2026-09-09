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

import { useEffect, useRef, useState } from 'react';
import { MoreVertical, X } from 'lucide-react';
import { useSpacesContext } from '../../contexts/SpacesContext';
import { useBookmarkTabsContext } from '../../contexts/BookmarkTabsContext';
import { useBookmarks } from '../../hooks/useBookmarks';
import { PinnedSite } from '../../hooks/usePinnedSites';
import { useFindSpaceForFolder } from '../../hooks/useFindSpaceForFolder';
import { ResumeState, TestCase, TestContext, TestResult } from './types';
import {
  clearAllCaseResults,
  clearBatchQueue,
  clearResumeState,
  readAllCaseResults,
  readBatchQueue,
  readResumeState,
  runFrom,
  writeBatchQueue,
  writeCaseResult,
} from './runner';
import { resetTestData } from './fixtures';
import { sleep } from './stepHelpers';
import { ALL_CASES } from './cases';

// SpacesContext (and the other contexts this panel depends on) start with
// empty/default state and only populate via an async chrome.runtime message
// round-trip fired on mount (see SpacesContext.tsx's GET_SPACES effect) -
// every pause->close->reopen cycle is a fresh mount, racing that load
// against whatever the resumed run does next. Give it a moment to settle
// before driving anything, so resetTestData()/setup() don't read
// still-empty context state right after a remount.
const RESUME_SETTLE_MS = 800;

interface TestRunnerPanelProps
{
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // Passed down from App.tsx's own usePinnedSites() instance rather than
  // calling the hook again here - usePinnedSites is plain useState-backed,
  // not a shared context, and this panel is mounted unconditionally in DEV,
  // so a second instance would run its favicon-resolution effect and
  // storage writes in parallel with App's, able to race and clobber each
  // other (see usePinnedSites.ts's removePin/addPin, both snapshot-writing
  // the full pinnedSites array back to storage).
  pinnedSites: PinnedSite[];
  addPin: (url: string, title: string) => Promise<void>;
  removePin: (id: string) => void;
}

interface CaseSummary
{
  total: number;
  failed: number;
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

// Fixed section letters shown as checkboxes, not derived from ALL_CASES -
// keeps the checkbox order stable (A before B before C...) regardless of
// case registration order.
const ALL_SECTIONS = ['A', 'B', 'C', 'D', 'E'];

export const TestRunnerPanel = ({ isOpen, onOpenChange, pinnedSites, addPin, removePin }: TestRunnerPanelProps) =>
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
    getItemKeyForTab: bookmarkTabsCtx.getItemKeyForTab,
    restoreItemAssociation: bookmarkTabsCtx.restoreItemAssociation,
    associateExistingTab: bookmarkTabsCtx.associateExistingTab,
    addPin,
    removePin,
  };

  const [pausedState, setPausedState] = useState<ResumeState | null>(null);
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
  // Whether the title bar's [...] overflow menu (currently just "Download
  // Results") is open - local UI state, not persisted.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Which sections' cases to show/run - defaults to all, resets on remount
  // (not persisted; unlike resume/batch state, there's no cross-session need
  // to remember a filter that's just narrowing what you're looking at).
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(ALL_SECTIONS));

  function toggleSection(section: string)
  {
    setSelectedSections(prev =>
    {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
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
      const [resume, allResults, queue] = await Promise.all([readResumeState(), readAllCaseResults(), readBatchQueue()]);

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
  async function runQueue(caseIds: string[])
  {
    setRunningAll(true);
    try
    {
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
    }
    finally
    {
      setRunningAll(false);
    }
  }

  function runAll()
  {
    return runQueue(visibleCases.map(c => c.id));
  }

  // Resumes the paused case, then - if it was part of a "Run All" batch and
  // didn't pause/error again - continues the rest of that batch. Without
  // this, resuming only ever advanced the one case the run happened to
  // pause on, leaving every later case in the batch un-run until you
  // manually clicked Run All again.
  async function handleResume()
  {
    if (!pausedCase || !pausedState) return;

    // setRunningAll (not runningCaseId - runCase hasn't started yet) so the
    // buttons are already disabled during the settle wait below, not just
    // once runCase begins.
    setRunningAll(true);
    try
    {
      await sleep(RESUME_SETTLE_MS);

      if (batchQueue === null)
      {
        await runCase(pausedCase, pausedState);
        return;
      }

      const completed = await runCase(pausedCase, pausedState);
      if (completed) await runQueue(batchQueue);
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

  // Only the checked sections' cases - drives both the rendered list and
  // what "Run All" queues up. A paused/queued case stays reachable via
  // pausedCase below even if its section gets unchecked mid-run, since that
  // lookup goes through ALL_CASES, not this filtered view.
  const visibleCases = ALL_CASES.filter(c => selectedSections.has(sectionOf(c)));

  const pausedCase = pausedState ? ALL_CASES.find(c => c.id === pausedState.caseId) : undefined;
  const pausedStep = pausedCase && pausedState ? pausedCase.steps[pausedState.stepIndex] : undefined;
  const pausedInstruction = pausedStep?.kind === 'pause' ? pausedStep.instruction : '';
  const hasAnyResults = Object.keys(caseResults).length > 0;
  const hasAnyFailedResults = Object.values(caseResults).some(results => results.some(r => !r.passed));

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

        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            {ALL_SECTIONS.map(section => (
              <label key={section} className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedSections.has(section)}
                  onChange={() => toggleSection(section)}
                  disabled={runningCaseId !== null || runningAll}
                />
                <span>{section}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50"
              onClick={clearResults}
              disabled={runningCaseId !== null || runningAll || !hasAnyResults}
              title="Several cases have a known-gap assertion that's expected to currently fail - clear results here once you've seen it, so the panel stops auto-opening for it on every sidebar open."
            >
              Clear Results
            </button>
            <button
              className="px-2 py-1 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
              onClick={runAll}
              disabled={runningCaseId !== null || runningAll || visibleCases.length === 0}
            >
              {runningAll ? `Running tests… (${runningCaseId ?? ''})` : 'Run Tests'}
            </button>
          </div>
        </div>

        <div className="space-y-0.5">
          {visibleCases.map(testCase =>
          {
            const results = caseResults[testCase.id];
            const summary = results ? summarize(results) : null;
            const isExpanded = expandedCaseIds.has(testCase.id);
            const isPausedHere = pausedState?.caseId === testCase.id;

            return (
              <div key={testCase.id} className="border-b border-gray-100 dark:border-gray-700 py-1">
                <div className="flex items-center justify-between gap-2">
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
          <div className="mb-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
            {pausedInstruction}
          </div>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              onClick={handleResume}
              disabled={runningCaseId !== null || runningAll}
            >
              I've done it - Resume{batchQueue !== null ? ' & Continue Batch' : ''}
            </button>
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
    </div>
  );
};
