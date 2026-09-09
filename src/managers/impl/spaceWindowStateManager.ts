// SpaceWindowStateManager - owns SpaceWindowState per window.
//
// Background-side implementation of shared/spaceWindowStateApi.ts. The
// sidebar reaches it through proxies/spaceWindowStateProxy.ts; the routing
// vocabulary is in proxies/messageRouting.ts.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { SpaceWindowStateApi, SPACE_WINDOW_STATE_CHANGED } from '../shared/spaceWindowStateApi';
import { SpaceWindowState, DEFAULT_WINDOW_STATE } from '../../utils/spaceMessages';

export class SpaceWindowStateManager implements RoutedManager, SpaceWindowStateApi
{
  static STORAGE_KEY_PREFIX = 'spaceWindowState_';

  readonly managerId = ManagerId.SPACE_WINDOW_STATE;

  #states = new Map<number, SpaceWindowState>();  // windowId -> state

  private getStorageKey(windowId: number): string
  {
    return `${SpaceWindowStateManager.STORAGE_KEY_PREFIX}${windowId}`;
  }

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    switch (method)
    {
      case 'getState':
        return this.getState(message.windowId as number);

      case 'setActiveSpace':
        return this.setActiveSpace(message.windowId as number, message.spaceId as string);

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Access
  // ─────────────────────────────────────────────────────────────────────────

  getState(windowId: number): SpaceWindowState
  {
    return this.#states.get(windowId) || { ...DEFAULT_WINDOW_STATE };
  }

  getActiveSpace(windowId: number): string
  {
    return this.getState(windowId).activeSpaceId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Mutations
  // ─────────────────────────────────────────────────────────────────────────

  setActiveSpace(windowId: number, spaceId: string): SpaceWindowState
  {
    const state = this.getState(windowId);
    const newState = { ...state, activeSpaceId: spaceId };
    this.saveState(windowId, newState);
    return newState;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence & Notification
  // ─────────────────────────────────────────────────────────────────────────

  private saveState(windowId: number, state: SpaceWindowState): void
  {
    this.#states.set(windowId, state);
    chrome.storage.session.set({ [this.getStorageKey(windowId)]: state });

    // Notify sidebar of state change
    chrome.runtime.sendMessage({
      action: SPACE_WINDOW_STATE_CHANGED,
      windowId,
      state
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });
  }

  removeWindow(windowId: number): void
  {
    this.#states.delete(windowId);
  }

  async load(): Promise<void>
  {
    // Load all window states from session storage
    const result = await chrome.storage.session.get(null);

    for (const [key, value] of Object.entries(result))
    {
      if (key.startsWith(SpaceWindowStateManager.STORAGE_KEY_PREFIX))
      {
        const windowId = parseInt(key.replace(SpaceWindowStateManager.STORAGE_KEY_PREFIX, ''), 10);
        if (!isNaN(windowId))
        {
          this.#states.set(windowId, value as SpaceWindowState);
        }
      }
    }
  }
}
