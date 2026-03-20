# Safari Migration Proposal

## Chrome API Audit Summary

35+ Chrome API calls across 8 API families. Here's the Safari compatibility picture:

| API Family         | Methods / Listeners     | Safari Support                     |
| ------------------ | ----------------------- | ---------------------------------- |
| `chrome.tabs`      | 8 methods + 7 listeners | Full - via `browser.tabs`          |
| `chrome.tabGroups` | 4 methods + 4 listeners | **None**                           |
| `chrome.bookmarks` | 7 methods + 5 listeners | Full - via `browser.bookmarks`     |
| `chrome.storage`   | 6 methods + 2 listeners | Full (local + session)             |
| `chrome.runtime`   | 4 methods + 1 listener  | Full - via `browser.runtime`       |
| `chrome.windows`   | 3 methods + 1 listener  | Full - via `browser.windows`       |
| `chrome.sidePanel` | 1 method                | **None**                           |
| `chrome.commands`  | 2 methods + 1 listener  | Partial - limited shortcut support |

### Blockers

1. **`chrome.sidePanel`** — Safari has no sidebar API. The entire UI surface needs a different host.
2. **`chrome.tabGroups`** — Safari has Tab Groups but exposes zero API to extensions.
3. **`chrome.commands`** — Safari supports basic commands but with restrictions on key combos.
4. **Favicon URL scheme** — `chrome-extension://{id}/_favicon/` doesn't exist in Safari. Need an alternative (fetch + cache, or content-script-based extraction).

### No Issues Expected

- **Drag & drop** — uses @dnd-kit (pure JS/React), no browser API dependency
- **`chrome.tabs`** — fully supported as `browser.tabs`
- **`chrome.bookmarks`** — fully supported as `browser.bookmarks`
- **`chrome.storage`** — fully supported (both local and session)
- **`chrome.runtime`** — messaging, manifest access all work
- **`chrome.windows`** — fully supported
- **React / TypeScript / Tailwind** — all browser-agnostic

---

## Feature Impact

| Feature             | Chrome                    | Safari     | Notes                            |
| ------------------- | ------------------------- | ---------- | -------------------------------- |
| Sidebar panel       | `chrome.sidePanel`        | N/A        | Need alternative UI host         |
| Tab list + reorder  | Works                     | Works      | `browser.tabs` equivalent        |
| Tab groups          | Full CRUD                 | **Gone**   | Must hide or stub entire feature |
| Bookmarks           | Full CRUD + tree          | Works      | `browser.bookmarks` equivalent   |
| Spaces              | Works (storage-based)     | Works      | Pure storage, no blocked APIs    |
| Pinned sites        | Works                     | Works      | Storage-based                    |
| Keyboard shortcuts  | 4 commands                | Partial    | May lose some combos             |
| Favicons            | `chrome-extension://` URL | **Broken** | Need fetch-and-cache approach    |
| Drag & drop         | @dnd-kit                  | Works      | Pure JS library                  |
| Cross-window sync   | `storage.onChanged`       | Works      | Same API                         |
| Tab history nav     | Works                     | Works      | Message-passing based            |
| Audio tab detection | `tab.audible`             | Works      | Standard tab property            |

---

## Option A: Single Codebase (Both Browsers)

### Architecture

```
src/
├── platform/
│   ├── types.ts              # Shared interfaces
│   ├── chrome/
│   │   ├── adapter.ts        # Chrome API wrapper
│   │   ├── sidePanel.ts      # chrome.sidePanel setup
│   │   ├── tabGroups.ts      # chrome.tabGroups wrapper
│   │   └── favicon.ts        # chrome-extension:// favicon
│   └── safari/
│       ├── adapter.ts        # Safari (browser.*) wrapper
│       ├── popover.ts        # Popover/tab-based UI host
│       ├── tabGroups.ts      # Stub (no-op or hidden)
│       └── favicon.ts        # Fetch-based favicon
├── hooks/
│   └── (existing hooks, import from platform/)
├── components/
│   └── (existing components, conditionally render tab groups)
└── background.ts             # Uses platform adapter
```

### Key Changes

**1. Browser abstraction layer** (`src/platform/`)

- Wrap every `chrome.*` call behind an adapter interface
- At build time, resolve to `chrome/adapter.ts` or `safari/adapter.ts`
- Safari adapter maps `chrome.*` → `browser.*` (mostly 1:1, Safari uses promise-based `browser.*` API)

**2. Side panel → popover or tab**

- Safari option 1: **Popover** — opens from toolbar icon, closes on click-away. Poor fit for a persistent sidebar.
- Safari option 2: **Dedicated tab** — extension opens in a pinned tab. Persistent, but lives in the tab strip.
- Safari option 3: **Content-script injected sidebar** — inject a `<div>` into every page. Most Chrome-sidebar-like experience, but complex (CSP issues, page interaction, z-index battles).
- Recommendation: **Dedicated pinned tab** for Safari. Simplest, most reliable. Loses the "always visible beside content" UX but keeps all functionality.

**3. Tab groups — conditional feature**

- Feature-flag tab groups out on Safari
- Hide group-related UI (group headers, color indicators, "group tabs" actions)
- Stub `tabGroups` adapter methods to return empty results
- ~15 files touched, but mostly conditional renders and early returns

**4. Favicon handling**

- Safari: fetch the page URL, extract `<link rel="icon">` via a lightweight content script, or use a favicon service (e.g., Google's `s2/favicons` endpoint)
- Cache results in `browser.storage.local` (same as current caching)

**5. Build system**

- Add a `BROWSER` env var (`chrome` | `safari`)
- Vite alias or conditional import to swap platform modules
- Separate manifest generation (Chrome MV3 manifest vs Safari's `Info.plist` wrapper)
- Two build targets: `npm run build:chrome` and `npm run build:safari`

**6. Manifest differences**

- Chrome: `manifest.json` with `sidePanel`, `tabGroups` permissions
- Safari: stripped manifest without unsupported permissions + Xcode wrapper project

### Effort Estimate

| Task                                         | Scope        | Files                                         |
| -------------------------------------------- | ------------ | --------------------------------------------- |
| Platform abstraction layer                   | New module   | ~5 new files                                  |
| Refactor all `chrome.*` calls to use adapter | Medium-large | ~30 files                                     |
| Side panel → pinned tab (Safari)             | Medium       | ~3 new files + background.ts                  |
| Tab groups conditional rendering             | Medium       | ~15 files                                     |
| Favicon alternative                          | Small        | ~2 files                                      |
| Build config (Vite + manifests)              | Small        | vite.config.ts, manifest templates            |
| Xcode project wrapper                        | Small        | Generated by `safari-web-extension-converter` |
| Testing both targets                         | Ongoing      | —                                             |

### Pros

- One repo, one PR workflow, one set of tests
- Features stay in sync across browsers
- Bug fixes apply to both

### Cons

- Abstraction layer adds complexity to every Chrome API call
- Conditional rendering for tab groups adds branching throughout
- Build/test matrix doubles (must verify both targets)
- Safari-specific bugs can block Chrome releases (or need feature flags)
- The "sidebar" UX will be fundamentally different on Safari, which may confuse users

---

## Option B: Fork a Safari-Specific Branch/Repo

### Approach

1. Run `safari-web-extension-converter` on the current build output
2. Create a `safari` branch (or separate repo)
3. Make Safari-specific changes directly — no abstraction layer needed
4. Maintain independently

### Key Changes

**1. Replace `chrome.*` with `browser.*`**

- Global find-replace `chrome.tabs` → `browser.tabs`, etc.
- Safari's WebExtension API uses `browser.*` namespace with native Promises (no callbacks)
- Straightforward but touches ~30 files

**2. Remove `chrome.sidePanel`**

- Delete sidePanel setup from background.ts
- Convert to pinned-tab or popover approach directly

**3. Remove `chrome.tabGroups` entirely**

- Delete `useTabGroups.ts`, group-related components, group colors utility
- Remove group rendering from `TabList.tsx`
- Remove group event handlers from `background.ts`
- Clean deletion — no stubs or feature flags needed

**4. Favicon — direct replacement**

- Swap `chrome-extension://` URL to fetch-based approach
- Simpler than abstraction — just rewrite `favicon.ts`

**5. Xcode project**

- Generated by converter tool
- Add to the Safari branch/repo
- Needs occasional updates when Safari WebExtension APIs change

### Effort Estimate

| Task                                 | Scope                        |
| ------------------------------------ | ---------------------------- |
| `chrome.*` → `browser.*` replacement | ~30 files, mostly mechanical |
| Remove tab groups                    | ~15 files, clean deletion    |
| Side panel → pinned tab              | ~3 files                     |
| Favicon rewrite                      | 1 file                       |
| Xcode project setup                  | Generated + minor tweaks     |
| Initial testing                      | Safari-specific QA pass      |

### Pros

- Simpler code — no abstraction layer, no conditionals
- Can diverge freely (Safari-specific features, UI adjustments)
- Chrome codebase stays clean and unchanged
- Faster initial port — just delete/replace, no architecture work

### Cons

- **Ongoing maintenance burden** — every feature, bug fix, and refactor must be manually ported
- Branches will diverge over time; merge conflicts grow
- Two separate release processes
- Risk of Safari version falling behind

---

## Recommendation

| Factor              | Option A (Single Codebase)     | Option B (Fork)                    |
| ------------------- | ------------------------------ | ---------------------------------- |
| Initial effort      | Higher                         | Lower                              |
| Ongoing maintenance | Lower                          | Higher                             |
| Code complexity     | Higher (abstractions)          | Lower (direct)                     |
| Feature parity      | Easier to maintain             | Tends to drift                     |
| Best if...          | Safari is a first-class target | Safari is experimental / secondary |

**If Safari is a serious, long-term target** → Option A. The upfront abstraction work pays off over time.

**If you want to test the waters** → Option B. Fork it, ship a Safari version, see if there's demand. If it takes off, refactor toward Option A later.

A pragmatic middle ground: start with **Option B** to validate demand, then migrate to **Option A** if Safari gains traction. The fork gives you a working Safari version fast, and the learnings from maintaining it will inform a better abstraction layer if/when you unify.
