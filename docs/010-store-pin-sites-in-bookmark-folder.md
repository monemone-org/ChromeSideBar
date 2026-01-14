# 010-store-pin-sites-in-bookmark-folder.md


## Goal 

To migrate the storage of pinned sites to a folder "SideBar For Arc Pinned Sites" under "Other Bookmarks" by default. Let the user choose to store those in a different folder if they prefer.

This allows pinned sites to be synced and backed up online. Also preserves links even if the extension is uninstalled.


## Migration Workflow

1. fresh install of the extension

- when the user pins a site the first time, auto-create "SideBar For Arc Pinned Sites" under "Other Bookmarks" silently
- store pinned site there
- notify user of the new bookmark folder

2. existing user of an older version of the extension

- check if there are pinned sites stored in local storage
- if so, auto-create "SideBar For Arc Pinned Sites" under "Other Bookmarks"
- migrate pinned sites there
- notify user of the new bookmark folder


## Problems to Solve

### 1. How to store pinned site's color and custom icons?

**Background**: Chrome bookmarks only store URL, title, and folder position. We need to also store `customIconName` and `iconColor`. Favicon can be fetched fresh using Chrome's `_favicon` API.

#### Possible Solutions

| Solution | Survives Uninstall | Clean Bookmarks |
|----------|-------------------|-----------------|
| A. Hybrid storage | No (metadata lost) | Yes |
| B. Encode in title | Yes | No |
| C. Metadata bookmark | Yes | Somewhat |
| D. Extension URL | Yes | No |
| E. URL fragment | Yes | Somewhat |

---

**Solution A: Hybrid Storage (Recommended)**

Store URL/title in bookmarks, metadata in `chrome.storage.sync`.

```
Bookmark: { url: "https://gmail.com", title: "Gmail" }
chrome.storage.sync: {
  "https://gmail.com": {
    customIconName: "home",      // Lucide icon name
    iconColor: "#ef4444",        // Hex color
    favicon: "data:image/svg+xml,..." // Base64 data URL of rendered icon
  }
}
```

Note: The current implementation stores `favicon` as a base64 data URL (the rendered icon with color applied). This caches the icon so we don't need to re-fetch from Iconify CDN on every load. The `customIconName` and `iconColor` are kept for the icon picker UI.

Pros:
- Bookmarks stay clean and human-readable
- `chrome.storage.sync` also syncs via Chrome account
- Simple implementation
- Order determined by folder position
- No repeated fetches for custom icons

Cons:
- Metadata lost if extension uninstalled (unless user reinstalls while signed in)
- Need to handle orphaned metadata when bookmark deleted externally
- `chrome.storage.sync` has size limits (100KB total) - may need to fall back to `chrome.storage.local` for users with many pinned sites

---

**Solution B: Extension URL as Bookmark**

Store `chrome-extension://<ext-id>/redirect?url=gmail.com&icon=home&color=ef4444`

Extension intercepts clicks and opens the real URL.

Two options for icon storage:

1. **Icon name + color only** (e.g., `&icon=home&color=ef4444`)
   - Compact URL (~30 extra chars)
   - Must re-fetch icon from CDN on every load

2. **Base64 encoded favicon** (e.g., `&icon=home&color=ef4444&favicon=PHN2ZyB4bWxucz0i...`)
   - Self-contained, no fetch needed
   - Still stores icon name + color for the icon picker UI
   - But URLs become 400-2000+ chars longer
   - Harder to debug/inspect

Pros:
- All metadata encoded in URL
- Clean solution from code perspective

Cons:
- Bookmark becomes dead link after uninstall
- URL looks ugly/confusing to users
- Defeats the purpose of "preserving links"



---

### Decision

TBD - need to decide which solution to use.


