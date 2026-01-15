# Welcome Dialog

## Goal

Show a one-time welcome dialog when the extension runs for the first time to introduce key features to new users.

**Target personas:**
- New users who just installed the extension
- Users unfamiliar with Arc browser concepts


## Feature Overview

A modal dialog that appears once (on first run) to briefly explain three key features:
1. **Pinned Sites** - Quick-access icon bar for favorite sites
2. **Arc-style Live Bookmarks** - Bookmarks that act as persistent tabs
3. **Arc-style Spaces** - Organize browsing by context

After dismissing, the dialog never shows again.


## User Workflow

1. User installs extension and opens sidebar for the first time
2. Welcome dialog appears with brief feature explanations
3. User clicks "Get Started" button
4. Dialog closes, never appears again
5. User can replay the welcome tour via "Show Welcome" button in About dialog


## Dialog Content

Multi-page carousel with 3 pages, one per feature. Each page has a screenshot and brief description.

```
┌─────────────────────────────────────────────────────────────┐
│ Welcome to SideBar For Arc Users                        [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │              [Screenshot of feature]                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Pinned Sites                                               │
│  Quick-access icons at the top. Pin your favorite sites     │
│  for one-click access.                                      │
│                                                             │
│                         ● ○ ○                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [ ← Prev ]                                  [ Next → ]      │
└─────────────────────────────────────────────────────────────┘
```

**Page 1: Pinned Sites**
- Screenshot: PinnedBar with a few pinned icons
- Text: "Quick-access icons at the top. Pin your favorite sites for one-click access."

**Page 2: Live Bookmarks**
- Screenshot: Bookmark with loaded indicator (cyan/close button)
- Text: "Bookmarks act as persistent tabs. Click to open, click again to switch. Closing the tab keeps the bookmark."

**Page 3: Spaces**
- Screenshot: SpaceBar with a few space icons
- Text: "Focus on what matters. Each space shows only its bookmarks and tabs, reducing clutter."

**Navigation:**
- Page indicator: 3 dots showing current page (● ○ ○)
- "← Prev" button (pages 2-3): goes to previous page
- "Next →" button (pages 1-2): advances to next page
- "Get Started" button (page 3): closes dialog

**Screenshot images:**
```
public/welcome/pinned-sites.png
public/welcome/live-bookmarks.png
public/welcome/spaces.png
```

- Recommended size: ~350px × 260px (4:3 aspect ratio)
- Images use `object-contain` so larger images will scale down to fit


## Data Model

**First-run detection** using `localStorage`:

```typescript
// Key: 'sidebar-has-seen-welcome'
// Value: boolean (default: false)
// After dialog dismissed: true
```

Uses existing `useLocalStorage` hook for consistency.


## Implementation Notes

- Create new `WelcomeDialog.tsx` component based on existing `Dialog.tsx` pattern
- Add `hasSeenWelcome` state to `App.tsx` using `useLocalStorage`
- Show dialog on mount if `hasSeenWelcome` is false
- Set `hasSeenWelcome` to true when dialog is closed
- Use Lucide icons for visual appeal: `Pin`, `BookOpen`, `Layout` (or similar)


## Edge Cases

| Case | Handling |
|------|----------|
| User closes dialog via X button | Mark as seen, don't show again |
| User closes dialog via "Get Started" | Mark as seen, don't show again |
| User presses Escape | Mark as seen, don't show again |
| Extension reinstalled | localStorage persists, dialog won't show |
| Different browser profile | New profile has fresh localStorage, dialog shows |


## About Dialog Integration

Add a "Show Welcome" button in the About dialog so users can replay the welcome tour anytime.

```
About Dialog:
┌─────────────────────────────────────────────────────────────┐
│ About                                                   [X] │
├─────────────────────────────────────────────────────────────┤
│ Sidebar for Arc Users                                       │
│ Version x.x.x                                               │
│ by monehsieh                                                │
│                                                             │
│ GitHub                                                      │
│ Chrome Web Store                                            │
├─────────────────────────────────────────────────────────────┤
│ [ Show Welcome ]                                   [ Close ]│
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Clicking "Show Welcome" closes About dialog and opens Welcome dialog
- Welcome dialog works normally (can skip or go through all pages)


## Future Enhancements

- Add feature highlight tooltips for first-time use of each feature
