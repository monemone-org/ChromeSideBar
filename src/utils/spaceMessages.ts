// =============================================================================
// Space-related messages between background.ts and SpacesContext.tsx
// =============================================================================

// chrome.storage.local key for the array of Space definitions
export const SPACES_STORAGE_KEY = 'spaces';

// =============================================================================
// Space Definition (source of truth - shared between background and sidebar)
// =============================================================================

export interface Space
{
  id: string;
  name: string;
  icon: string;                           // Lucide icon name or emoji
  color: string;                          // Chrome color name or hex (e.g. 'blue', '#FF5733')
  bookmarkFolderPath: string;             // e.g. "Bookmarks Bar/Work" (legacy, may contain '/')
  bookmarkFolderSegments?: string[];      // structured path e.g. ["Bookmarks Bar", "A/B"] - unambiguous
}

// Special "All" space - not stored, always prepended to allSpaces at runtime
export const ALL_SPACE: Space = {
  id: 'all',
  name: 'All',
  icon: 'LayoutGrid',
  color: 'grey',
  bookmarkFolderPath: '',
};

// =============================================================================
// Message Actions
// =============================================================================

/**
 * Message action types for space-related communication.
 *
 * SpaceWindowState is managed in background.ts (source of truth).
 * Space definitions are managed by SpaceManager in background.ts.
 * SpacesContext.tsx holds read-only copies that sync via messages.
 *
 * Communication flow:
 *   sidebar → background: GET_WINDOW_STATE, SET_ACTIVE_SPACE, GET_SPACES, UPDATE_SPACES
 *   background → sidebar: STATE_CHANGED
 */
export const SpaceMessageAction = {
  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar → Background
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * SpacesContext.tsx → background.ts
   *
   * Request current SpaceWindowState on sidebar mount.
   *
   * Payload: { windowId: number }
   * Response: SpaceWindowState
   */
  GET_WINDOW_STATE: 'get-window-state',

  /**
   * SpacesContext.tsx → background.ts
   *
   * User switched to a different space in the sidebar.
   *
   * Payload: { windowId: number, spaceId: string }
   */
  SET_ACTIVE_SPACE: 'set-active-space',

  /**
   * SpacesContext.tsx → background.ts
   *
   * Request all Space definitions on sidebar mount.
   *
   * Response: { spaces: Space[] }
   */
  GET_SPACES: 'get-spaces',

  /**
   * SpacesContext.tsx → background.ts
   *
   * Persist updated Space definitions (any CRUD operation).
   *
   * Payload: { spaces: Space[] }
   */
  UPDATE_SPACES: 'update-spaces',

  // ─────────────────────────────────────────────────────────────────────────
  // Background → Sidebar
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * background.ts → SpacesContext.tsx
   *
   * Notify sidebar of SpaceWindowState changes (activeSpaceId changed).
   * Sidebar updates its read-only copy and re-renders.
   *
   * Payload: { windowId: number, state: SpaceWindowState }
   */
  STATE_CHANGED: 'state-changed',
} as const;

// Type for the action values
export type SpaceMessageActionType = typeof SpaceMessageAction[keyof typeof SpaceMessageAction];

// =============================================================================
// Shared Types
// =============================================================================

/**
 * Per-window space state managed by background.ts.
 *
 * Space ↔ Chrome tab group linking:
 * - Spaces link to Chrome tab groups by matching Space.name to group.title
 * - This allows automatic reconnection after Chrome restart
 * - Each window can have its own group for the same Space
 */
export interface SpaceWindowState
{
  activeSpaceId: string;
}

export const DEFAULT_WINDOW_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
};
