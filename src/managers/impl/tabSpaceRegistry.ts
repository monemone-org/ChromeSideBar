// TabSpaceRegistry - tracks the home space for tabs opened from bookmarks.
//
// Background-side implementation of shared/tabSpaceRegistryApi.ts. Only
// register() is reachable from the sidebar (via
// proxies/tabSpaceRegistryProxy.ts); everything else is background-internal.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import { TabSpaceRegistryApi } from '../shared/tabSpaceRegistryApi';

export class TabSpaceRegistry implements RoutedManager, TabSpaceRegistryApi
{
  static STORAGE_KEY = 'bg_tabSpaces';

  readonly managerId = ManagerId.TAB_SPACE_REGISTRY;

  // Map<windowId, Map<tabId, spaceId>>
  #registry: Map<number, Map<number, string>> = new Map();

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    switch (method)
    {
      case 'register':
        this.register(message.windowId as number, message.tabId as number, message.spaceId as string);
        return undefined;

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  register(windowId: number, tabId: number, spaceId: string): void
  {
    if (!this.#registry.has(windowId))
    {
      this.#registry.set(windowId, new Map());
    }
    this.#registry.get(windowId)!.set(tabId, spaceId);
    this.save();
  }

  getSpace(windowId: number, tabId: number): string | undefined
  {
    return this.#registry.get(windowId)?.get(tabId);
  }

  unregister(windowId: number, tabId: number): void
  {
    this.#registry.get(windowId)?.delete(tabId);
    this.save();
  }

  private save(): void
  {
    const data: Array<[number, Array<[number, string]>]> = [];
    for (const [windowId, tabMap] of this.#registry)
    {
      data.push([windowId, Array.from(tabMap.entries())]);
    }
    chrome.storage.session.set({ [TabSpaceRegistry.STORAGE_KEY]: data });
  }

  removeWindow(windowId: number): void
  {
    this.#registry.delete(windowId);
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.session.get([TabSpaceRegistry.STORAGE_KEY]);
    const data = result[TabSpaceRegistry.STORAGE_KEY];
    if (data)
    {
      for (const [windowId, entries] of data)
      {
        this.#registry.set(windowId, new Map(entries));
      }
    }
  }
}
