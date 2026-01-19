// =============================================================================
// Space-related messages between background.ts and SpacesContext.tsx
// =============================================================================

/**
 * Message action types for space-related communication.
 *
 * SpaceWindowState is managed in background.ts (source of truth).
 * SpacesContext.tsx holds a read-only copy that syncs via messages.
 *
 * Communication flow:
 *   sidebar → background: GET_WINDOW_STATE, SET_ACTIVE_SPACE, MOVE_TAB_TO_SPACE
 *   background → sidebar: STATE_CHANGED, HISTORY_TAB_ACTIVATED
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
   * User moved a tab to a different space via UI.
   *
   * Payload: { windowId: number, tabId: number, toSpaceId: string }
   */
  MOVE_TAB_TO_SPACE: 'move-tab-to-space',

  /**
   * SpacesContext.tsx → background.ts
   *
   * Clear all state for a space (when space is deleted).
   *
   * Payload: { windowId: number, spaceId: string }
   */
  CLEAR_SPACE_STATE: 'clear-space-state',

  // ─────────────────────────────────────────────────────────────────────────
  // Background → Sidebar
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * background.ts → SpacesContext.tsx
   *
   * Notify sidebar of SpaceWindowState changes (tab created, removed, etc.).
   * Sidebar updates its read-only copy and re-renders.
   *
   * Payload: { windowId: number, state: SpaceWindowState }
   */
  STATE_CHANGED: 'state-changed',

  /**
   * background.ts → SpacesContext.tsx
   *
   * Sent when history navigation (back/forward) activates a tab that belongs
   * to a different space. Triggers the sidebar to switch to that space.
   *
   * Payload: { spaceId: string, tabId: number }
   */
  HISTORY_TAB_ACTIVATED: 'history-tab-activated',
} as const;

// Type for the action values
export type SpaceMessageActionType = typeof SpaceMessageAction[keyof typeof SpaceMessageAction];

// =============================================================================
// Shared Types
// =============================================================================

/**
 * Per-window space state managed by background.ts.
 */
export interface SpaceWindowState
{
  activeSpaceId: string;
  spaceTabs: Record<string, number[]>;     // space ID → array of tab IDs
  lastActiveTabs: Record<string, number>;  // space ID → last active tab ID
}

export const DEFAULT_WINDOW_STATE: SpaceWindowState = {
  activeSpaceId: 'all',
  spaceTabs: {},
  lastActiveTabs: {},
};
