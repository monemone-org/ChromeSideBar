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
 *   sidebar → background: GET_WINDOW_STATE, SET_ACTIVE_SPACE
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
