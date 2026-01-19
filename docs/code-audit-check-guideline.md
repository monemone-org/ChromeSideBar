# Code Audit Checklist for Coding Agents

Guidelines for reviewing code quality during development.

## How to Run

Launch a **separate agent for each audit area** below. Each agent should:

1. Perform the checks for its assigned area
2. Create a report file with options of suggested fix under `docs/test-reports/` with naming convention:
   ```
   code-audit-{area}-report-{YYYY-MM-DD}.md
   ```

Area names for reports:
- `performance`
- `code-organization`
- `security`
- `memory-resources`
- `error-handling`
- `async-concurrency`
- `testing`

Example: `code-audit-security-report-2026-01-19.md`

## 1. Performance

- [ ] Check for O(n²) or worse complexity in loops
  - Nested loops over the same or related collections
  - Repeated array searches (`.find()`, `.filter()`, `.includes()`) inside loops
  - Consider using Maps/Sets for O(1) lookups
- [ ] Watch for unnecessary re-renders in React components
  - Missing or incorrect dependency arrays in `useEffect`/`useMemo`/`useCallback`
  - Creating new objects/arrays in render that could be memoized
- [ ] Ensure rapid-fire events are debounced or throttled
  - Scroll, resize, input events that trigger expensive operations
  - Chrome API calls triggered by frequent user actions
- [ ] Batch multiple state updates when possible
  - Multiple `setState` calls that could be combined
  - Multiple Chrome storage writes that could be batched
- [ ] Avoid synchronous storage reads in hot paths
  - Prefer caching values read from `chrome.storage`
  - Use async patterns for storage access during rendering
- [ ] Minimize DOM updates and layout thrashing
  - Reading layout properties (offsetHeight, getBoundingClientRect) between writes
  - Multiple sequential DOM modifications that could be batched
- [ ] Consider Web Workers for CPU-intensive tasks
  - Heavy data processing that blocks the main thread
  - Operations that cause visible UI jank
- [ ] Memoize expensive computations appropriately
  - `useMemo` for derived data that's costly to compute
  - Avoid memoizing trivial operations (overhead isn't worth it)
- [ ] Watch bundle size for production builds
  - Large dependencies that could be replaced with lighter alternatives
  - Unused exports from imported libraries

## 2. Code Organization

- [ ] Reusable logic can be extracted into separate components or hooks
- [ ] Duplicated code to be removed
  - Similar logic appearing in multiple places
  - Copy-pasted code with minor variations
- [ ] Functions/classes should focus on a single responsibility
- [ ] Remove dead code and unused imports
  - Commented-out code blocks that are no longer needed
  - Unused variables, functions, or components
- [ ] Ensure proper TypeScript typing
  - Avoid excessive use of `any` type
  - Missing type definitions for function parameters and return values
- [ ] Keep components and functions at reasonable size
  - Components over 200-300 lines may need splitting
  - Functions with too many responsibilities
- [ ] Check for circular dependencies between modules
  - Import cycles that could cause runtime issues
  - Tightly coupled modules that should be refactored
- [ ] Use constants for magic numbers and repeated strings
  - Hardcoded values that appear multiple times
  - Configuration values that should be centralized
- [ ] Ensure consistent error handling patterns
  - Mix of try/catch, `.catch()`, and unhandled promises
  - Errors that are silently swallowed
- [ ] Follow React hooks rules and patterns
  - Hooks called conditionally or in loops
  - Custom hooks that don't follow naming conventions

## 3. Security

- [ ] Use /security-review command
- [ ] Sanitize user inputs before use
- [ ] Avoid `eval()`, `innerHTML`, or `dangerouslySetInnerHTML` with untrusted content
- [ ] Validate data from external sources (APIs, storage, messages)
- [ ] Check for potential XSS vulnerabilities in dynamic content
- [ ] Validate message origins in Chrome runtime messaging
  - Check `sender.id` matches expected extension ID
  - Validate message structure before processing
- [ ] Secure `postMessage` communication
  - Specify exact target origin instead of `*`
  - Validate origin of received messages
- [ ] Protect sensitive data in storage
  - Avoid storing secrets in plain text in `chrome.storage`
  - Consider what data is accessible to content scripts
- [ ] Validate URLs before navigation or fetching
  - Check protocol (avoid `javascript:` URLs)
  - Sanitize user-provided URLs used in `fetch()` or `chrome.tabs.create()`
- [ ] Review extension permissions for least privilege
  - Remove unused permissions from manifest
  - Use optional permissions where appropriate
- [ ] Isolate content scripts from page context
  - Be cautious of data from page's DOM or window object
  - Don't trust page-injected elements or attributes
- [ ] Avoid constructing code from strings
  - Template literals used in ways that could inject code
  - String concatenation that builds executable content

## 4. Memory & Resource Management

- [ ] Are subscriptions and listeners in `useEffect` getting cleaned up properly
- [ ] Check for global collections that grow unbounded
  - Maps, Sets, or arrays that add entries but never remove them
  - Event listeners that accumulate without removal
- [ ] Verify Chrome API listeners are properly removed when no longer needed
- [ ] Watch for closures holding references to large objects
- [ ] Look for persisted data that grows unbounded and never gets cleaned up
- [ ] Handle service worker lifecycle correctly
  - State that needs to persist across service worker restarts
  - Timers or intervals that assume continuous execution
- [ ] Clean up resources when tabs or windows are closed
  - Data structures keyed by tab/window IDs
  - Listeners registered for specific tabs
- [ ] Avoid unnecessary object cloning and deep copies
  - Spread operators creating copies when not needed
  - JSON.parse(JSON.stringify()) for objects that don't need deep cloning
- [ ] Consider WeakMap/WeakSet for object-keyed caches
  - Caches that should release entries when keys are garbage collected
  - Metadata attached to DOM elements or other objects
- [ ] Verify timers and intervals are cleared
  - `setTimeout`/`setInterval` without corresponding clear calls
  - Timers created in loops or event handlers
- [ ] Check for stale closures in async code
  - Callbacks that capture outdated state values
  - Event handlers that reference old component state
- [ ] Implement storage cleanup strategies
  - Old cache entries that should expire
  - Orphaned data from deleted tabs or sessions

## 5. Error Handling & User Feedback

- [ ] User-facing errors are meaningful (not raw exceptions)
  - Transform technical errors into user-friendly messages
  - Avoid exposing stack traces or internal details
- [ ] Loading states shown during async operations
  - Spinner or skeleton UI for data fetching
  - Disabled buttons during form submission
- [ ] Graceful degradation when Chrome APIs fail
  - Fallback behavior when permissions are revoked
  - Handle API unavailability (e.g., in non-extension context)
- [ ] Network failure handling
  - Timeout handling for fetch requests
  - Offline state detection and messaging
- [ ] Empty states handled (no data, no results)
  - Helpful messaging when lists are empty
  - Guidance on how to populate empty states
- [ ] Recovery paths exist (retry buttons, refresh options)
  - Allow users to retry failed operations
  - Provide manual refresh when auto-sync fails

## 6. Async & Concurrency

- [ ] Race conditions in state updates across contexts
  - Multiple contexts updating the same storage key
  - State changes from different sources conflicting
- [ ] Proper handling of stale async responses
  - Ignore responses from outdated requests
  - Cancel or discard results when component unmounts
- [ ] Chrome API call ordering issues (e.g., tab operations)
  - Sequential operations that assume previous completed
  - Operations on tabs/windows that may no longer exist
- [ ] State sync between sidebar, background, and content scripts
  - Consistent data across all extension contexts
  - Proper message passing and acknowledgment
- [ ] AbortController usage for cancellable operations
  - Fetch requests that should be cancelled on cleanup
  - Long-running operations that user can cancel

## 7. Testing Coverage

- [ ] Critical paths have test coverage
  - Core user workflows tested
  - Data processing and transformation logic
- [ ] Edge cases covered (empty states, large data sets)
  - Boundary conditions tested
  - Error scenarios and recovery paths
- [ ] Chrome API mocking patterns consistent
  - Standardized approach to mocking chrome.* APIs
  - Mock setup and teardown properly handled
- [ ] Integration tests for cross-context messaging
  - Background <-> sidebar communication
  - Content script <-> background messaging
