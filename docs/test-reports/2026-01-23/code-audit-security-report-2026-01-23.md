# Code Audit: Security

**Date:** 2026-01-23

## Purpose

Examines the ChromeSideBar extension for security vulnerabilities including XSS, input validation gaps, message authentication, and Chrome API security patterns.

## Summary Table

| Fix Status | Issue # | Description | Priority | Recommended | Dev Notes |
|------------|---------|-------------|----------|-------------|-----------|
| Open | 1 | Missing message sender validation | Medium | Yes | |
| Open | 2 | Unvalidated data from backup import | Medium | Yes | |
| Open | 3 | URL validation inconsistency (normalizeUrl) | Medium | Yes | |
| Open | 4 | External fetch without response validation | Low | Maybe | |
| Open | 5 | Chrome storage data not validated on load | Low | Maybe | |
| Open | 6 | External URL drop accepts all HTTP/HTTPS | Low | No | Positive finding |
| Open | 7 | Tab creation without URL validation | Low | Maybe | |
| Open | 8 | Type coercion in message handlers | Low | No | |

---

## Issue #1: Missing Message Sender Validation

### Problem
The `chrome.runtime.onMessage` listener does not validate `sender.id` to ensure messages originate from the extension itself. A malicious page could potentially send crafted messages if content scripts are added in the future.

### Cause
**File:** `src/background.ts` (lines 818-920)

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // No sender.id validation
  if (message.action === SpaceMessageAction.GET_WINDOW_STATE) {
    // ... handles message without verifying origin
  }
});
```

### Suggested Fixes

#### Option A: Add sender ID validation
```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return;  // Ignore messages from other sources
  }
  // ... existing handlers
});
```

**Why it works**: Only processes messages from the extension itself.

**Pros/Cons**:
- Pros: Defense in depth; future-proof if content scripts are added
- Cons: Minimal code change

#### Option B: Keep current (no content scripts)
The extension doesn't use content scripts, so external messages can't reach the background.

**Why it works**: MV3 architecture inherently isolates the extension.

**Pros/Cons**:
- Pros: No change needed
- Cons: Risk if content scripts added later without updating this

### Recommendation
**Yes fix.** Option A - simple defensive measure. While the current architecture has no content scripts, adding sender validation is a one-line change that provides defense in depth and future-proofs the codebase.

---

## Issue #2: Unvalidated Data from Backup Import

### Problem
Backup import parses JSON from user files without schema validation. Malicious backup files could contain javascript: URLs or malformed data.

### Cause
**File:** `src/components/ImportDialog.tsx` (lines 110-145)

```typescript
const data = JSON.parse(e.target?.result as string);
if (isFullBackup(data)) {
  backup = data;
}
// URLs in backup used without protocol validation
```

### Suggested Fixes

#### Option A: Add URL protocol validation
```typescript
function isValidBookmarkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'file:', 'chrome:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// During import, filter or reject invalid URLs
const validBookmarks = backup.bookmarks.filter(b =>
  !b.url || isValidBookmarkUrl(b.url)
);
```

**Why it works**: Blocks javascript:, data:, and other dangerous protocols.

**Pros/Cons**:
- Pros: Prevents code execution via malicious URLs
- Cons: May reject legitimate bookmarks with unusual protocols

#### Option B: Add full schema validation with Zod
```typescript
import { z } from 'zod';
const BackupSchema = z.object({
  version: z.string(),
  spaces: z.array(SpaceSchema),
  bookmarks: z.array(BookmarkSchema),
  // ...
});
```

**Why it works**: Comprehensive validation of all data shapes.

**Pros/Cons**:
- Pros: Complete type safety; catches malformed data
- Cons: Adds dependency; more code

#### Option C: Sanitize and truncate fields
Validate URL protocols and limit string lengths.

**Why it works**: Prevents both XSS and memory issues from huge strings.

**Pros/Cons**:
- Pros: Defense against multiple attack vectors
- Cons: May alter user data

### Recommendation
**Yes fix.** Option A as minimum - URL protocol validation prevents javascript: URL injection. Option B is thorough but adds a dependency. The risk is that a user could import a maliciously crafted backup file.

---

## Issue #3: URL Validation Inconsistency (normalizeUrl)

### Problem
The `normalizeUrl` function adds https:// to URLs without protocols but doesn't block dangerous protocols like javascript:.

### Cause
**File:** `src/components/BookmarkEditModal.tsx` (lines 59-67)

```typescript
const normalizeUrl = (inputUrl: string): string => {
  const trimmed = inputUrl.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;  // Accepts any protocol!
  return `https://${trimmed}`;
};
```

### Suggested Fixes

#### Option A: Block dangerous protocols
```typescript
const normalizeUrl = (inputUrl: string): string => {
  const trimmed = inputUrl.trim();
  if (!trimmed) return trimmed;

  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:'];
  const lower = trimmed.toLowerCase();
  if (dangerousProtocols.some(p => lower.startsWith(p))) {
    return '';  // or throw an error
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};
```

**Why it works**: Explicitly blocks known dangerous protocols.

**Pros/Cons**:
- Pros: Prevents XSS via bookmark URLs
- Cons: May need to update blocklist over time

#### Option B: Allow-list approach
Only accept known-safe protocols.

**Why it works**: More secure default; unknown = blocked.

**Pros/Cons**:
- Pros: Safer by default
- Cons: May block legitimate protocols (ftp:, mailto:, etc.)

### Recommendation
**Yes fix.** Option A - block known dangerous protocols while allowing legitimate ones. This is a low-effort fix that prevents XSS if a user manually enters a javascript: URL in the bookmark editor.

---

## Issue #4: External Fetch Without Response Validation

### Problem
SVG fetched from Iconify CDN is used with string replacement without validating it's actually SVG.

### Cause
**File:** `src/utils/iconify.ts` (lines 57-75)

```typescript
const response = await fetch(getIconUrl(iconName));
let svg = await response.text();
svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
return `data:image/svg+xml,${encodeURIComponent(svg)}`;
```

### Suggested Fixes

#### Option A: Validate SVG response
```typescript
const text = await response.text();
if (!text.trim().startsWith('<svg')) {
  console.warn('Invalid SVG response');
  return DEFAULT_ICON;
}
```

**Why it works**: Basic validation that response is SVG.

**Pros/Cons**:
- Pros: Catches invalid responses
- Cons: Simple check could be bypassed

#### Option B: Add response size limit
```typescript
if (response.headers.get('content-length') > 50000) {
  return DEFAULT_ICON;
}
```

**Why it works**: Prevents memory issues from huge responses.

**Pros/Cons**:
- Pros: Resource protection
- Cons: May miss streaming responses

#### Option C: Cache icons locally
Bundle commonly used icons; fetch only unknown ones.

**Why it works**: Reduces external dependency.

**Pros/Cons**:
- Pros: Works offline; faster; more secure
- Cons: Larger bundle size

### Recommendation
**Maybe fix.** Option A is simple validation. However, Iconify is a trusted CDN that only serves SVG icons. The risk of malicious response is low, and the SVG is used in a data: URL context which limits XSS vectors. Low priority.

---

## Issue #5: Chrome Storage Data Not Validated on Load

### Problem
Data loaded from chrome.storage.local is used directly without validation.

### Cause
**File:** `src/hooks/usePinnedSites.ts` (lines 50-58)

```typescript
chrome.storage.local.get([STORAGE_KEY], (result) => {
  setPinnedSites(result[STORAGE_KEY] || []);  // No validation
});
```

### Suggested Fixes

#### Option A: Add type validation
```typescript
const loadedSites = result[STORAGE_KEY];
if (Array.isArray(loadedSites)) {
  const validSites = loadedSites.filter(site =>
    typeof site.id === 'string' &&
    typeof site.url === 'string' &&
    typeof site.title === 'string'
  );
  setPinnedSites(validSites);
}
```

**Why it works**: Only uses data matching expected shape.

**Pros/Cons**:
- Pros: Prevents runtime errors from corrupt data
- Cons: May silently drop malformed entries

#### Option B: Use schema validation library
Same as Issue #2 Option B.

**Why it works**: Comprehensive validation.

**Pros/Cons**:
- Pros: Consistent approach; reusable
- Cons: Dependency overhead

### Recommendation
**Maybe fix.** Option A is proportional to risk. Chrome storage is only accessible to the extension itself, so corruption would only come from bugs in the extension or manual tampering via DevTools. The risk is low, but validation prevents runtime errors from corrupted data.

---

## Issue #6: External URL Drop Accepts All HTTP/HTTPS (Positive Finding)

### Problem
This is actually a **positive finding** - the URL validation correctly rejects dangerous protocols.

### Cause
**File:** `src/hooks/useExternalLinkDrop.ts` (lines 315-326)

```typescript
function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
```

### Suggested Fixes

#### Option A: Keep current implementation
Already correctly blocks javascript:, data:, etc.

**Why it works**: Only allows safe web URLs.

**Pros/Cons**:
- Pros: Secure by default
- Cons: None

### Recommendation
**No fix needed.** This is a positive finding - the code already correctly validates URL protocols and blocks dangerous ones. The current implementation is secure.

---

## Issue #7: Tab Creation Without URL Validation

### Problem
Multiple locations call `chrome.tabs.create({ url })` with URLs from bookmarks without additional validation.

### Cause
**File:** `src/components/BookmarkTree.tsx` (lines 283, 371, 376, 851, etc.)

### Suggested Fixes

#### Option A: Create safe tab creation utility
```typescript
function safeCreateTab(url: string, options?: chrome.tabs.CreateProperties) {
  try {
    const parsed = new URL(url);
    const allowed = ['http:', 'https:', 'chrome:', 'chrome-extension:', 'file:'];
    if (!allowed.includes(parsed.protocol)) {
      console.warn('Blocked unsafe URL:', url);
      return;
    }
    chrome.tabs.create({ ...options, url });
  } catch {
    console.warn('Invalid URL:', url);
  }
}
```

**Why it works**: Centralized validation; consistent behavior.

**Pros/Cons**:
- Pros: Defense in depth; Chrome also validates but this is explicit
- Cons: Need to update all call sites

#### Option B: Rely on Chrome's built-in validation
Chrome itself blocks dangerous URLs from tabs.create().

**Why it works**: Browser-level protection.

**Pros/Cons**:
- Pros: No code change
- Cons: Less explicit; behavior may vary

### Recommendation
**Maybe fix.** Option B is acceptable - Chrome's tabs.create() API already blocks dangerous protocols like javascript:. Option A adds explicit defense-in-depth but Chrome's built-in protection makes this low priority.

---

## Issue #8: Type Coercion in Message Handlers

### Problem
Message handler uses `message.index` without type checking.

### Cause
**File:** `src/background.ts` (line 871)

```typescript
else if (message.action === 'navigate-to-history-index') {
  historyManager.navigateToIndex(tabs[0].windowId, message.index);
  // message.index not validated as number
}
```

### Suggested Fixes

#### Option A: Add type validation
```typescript
if (typeof message.index === 'number' && Number.isInteger(message.index)) {
  historyManager.navigateToIndex(tabs[0].windowId, message.index);
}
```

**Why it works**: Ensures expected type before use.

**Pros/Cons**:
- Pros: Prevents unexpected behavior
- Cons: Silently ignores invalid messages

#### Option B: Keep current
Messages only come from extension code which always sends correct types.

**Why it works**: Trusted source; TypeScript ensures correct usage at call site.

**Pros/Cons**:
- Pros: No overhead
- Cons: Less defensive

### Recommendation
**No fix needed.** Option B - messages only originate from extension code which TypeScript validates at compile time. With sender validation from Issue #1, external messages are blocked anyway. Runtime type checking would be defensive but adds overhead for no practical benefit.

---

## Positive Findings

The codebase demonstrates good security practices:

1. **No dangerous functions**: No use of `eval()`, `innerHTML`, or `dangerouslySetInnerHTML`
2. **React JSX escaping**: Automatic XSS protection for dynamic content
3. **No content scripts**: Reduced attack surface
4. **Minimal permissions**: Only necessary permissions requested
5. **URL validation in drops**: External drops correctly filter protocols
