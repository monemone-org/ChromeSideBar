// PinnedSitesManager - owns the pinned site list (load, mutate, save).
//
// Background-side implementation of shared/pinnedSitesApi.ts. The sidebar
// reaches it through proxies/pinnedSitesManagerProxy.ts; the routing
// vocabulary is in proxies/messageRouting.ts.
//
// This is the single writer of the `pinnedSites` storage key - Case 2 in
// docs/decisions/2026-07-30-shared-storage-multiple-writers.md. Before this,
// background's favicon patching, the sidebar's CRUD, the sidebar's lazy icon
// resolver and DeletePinnedSiteAction each did their own read-modify-write of
// the whole array, so any two of them overlapping could drop the other's
// change.

import { ManagerId, RoutedManager } from '../proxies/messageRouting';
import {
  PinnedSite,
  PinnedSiteDropPosition,
  PinnedSiteDuplicateOverrides,
  PinnedSiteEdit,
  PinnedSiteFaviconPatch,
  PinnedSitePlacement,
  PinnedSitesApi,
  PINNED_SITES_CHANGED,
  PINNED_SITES_STORAGE_KEY,
  applyAddPins,
  applyDuplicatePin,
  applyInsertPins,
  applyMovePin,
  applyRemovePins,
  applyResetFavicon,
  applySetFavicons,
  applyUpdatePin,
} from '../shared/pinnedSitesApi';

export class PinnedSitesManager implements RoutedManager, PinnedSitesApi
{
  readonly managerId = ManagerId.PINNED_SITES;

  #sites: PinnedSite[] = [];

  /** See RoutedManager.dispatch. */
  async dispatch(method: string, message: Record<string, unknown>): Promise<unknown>
  {
    // originId is the calling context's CONTEXT_ID, stamped by callManager. It
    // rides along on the broadcast each mutation sends, so the context that
    // asked for the change can recognise its own echo. Pulled out once here
    // rather than in every case below.
    const originId = message.senderId as string | undefined;

    switch (method)
    {
      case 'getPinnedSites':
        return this.getPinnedSites();

      case 'addPins':
        return this.addPins(message.pins as PinnedSite[], message.atIndex as number | undefined, originId);

      case 'removePins':
        return this.removePins(message.ids as string[], originId);

      case 'insertPins':
        return this.insertPins(message.placements as PinnedSitePlacement[], originId);

      case 'updatePin':
        return this.updatePin(message.id as string, message.edit as PinnedSiteEdit, originId);

      case 'resetFavicon':
        return this.resetFavicon(message.id as string, message.favicon as string | undefined, originId);

      case 'movePin':
        return this.movePin(
          message.activeId as string,
          message.overId as string,
          message.position as PinnedSiteDropPosition,
          originId
        );

      case 'duplicatePin':
        return this.duplicatePin(
          message.id as string,
          message.newId as string,
          message.overrides as PinnedSiteDuplicateOverrides | undefined,
          originId
        );

      case 'replaceAll':
        return this.replaceAll(message.sites as PinnedSite[], originId);

      case 'setFavicons':
        return this.setFavicons(message.patches as PinnedSiteFaviconPatch[], originId);

      default:
        throw new Error(`${this.managerId}: unknown method "${method}"`);
    }
  }

  async load(): Promise<void>
  {
    const result = await chrome.storage.local.get([PINNED_SITES_STORAGE_KEY]);
    this.#sites = result[PINNED_SITES_STORAGE_KEY] || [];
  }

  getPinnedSites(): PinnedSite[]
  {
    return this.#sites;
  }

  addPins(pins: PinnedSite[], atIndex?: number, originId?: string): PinnedSite[]
  {
    return this.#commit(applyAddPins(this.#sites, pins, atIndex), originId);
  }

  removePins(ids: string[], originId?: string): PinnedSite[]
  {
    return this.#commit(applyRemovePins(this.#sites, ids), originId);
  }

  insertPins(placements: PinnedSitePlacement[], originId?: string): PinnedSite[]
  {
    return this.#commit(applyInsertPins(this.#sites, placements), originId);
  }

  updatePin(id: string, edit: PinnedSiteEdit, originId?: string): PinnedSite[]
  {
    return this.#commit(applyUpdatePin(this.#sites, id, edit), originId);
  }

  resetFavicon(id: string, favicon?: string, originId?: string): PinnedSite[]
  {
    return this.#commit(applyResetFavicon(this.#sites, id, favicon), originId);
  }

  movePin(
    activeId: string,
    overId: string,
    position: PinnedSiteDropPosition,
    originId?: string
  ): PinnedSite[]
  {
    return this.#commit(applyMovePin(this.#sites, activeId, overId, position), originId);
  }

  duplicatePin(
    id: string,
    newId: string,
    overrides?: PinnedSiteDuplicateOverrides,
    originId?: string
  ): PinnedSite[]
  {
    return this.#commit(applyDuplicatePin(this.#sites, id, newId, overrides), originId);
  }

  replaceAll(sites: PinnedSite[], originId?: string): PinnedSite[]
  {
    return this.#commit(sites, originId);
  }

  setFavicons(patches: PinnedSiteFaviconPatch[], originId?: string): PinnedSite[]
  {
    return this.#commit(applySetFavicons(this.#sites, patches), originId);
  }

  /**
   * Stores one already-computed list: in memory, then to storage, then out to
   * every listening context. Every mutation above ends here, so persisting
   * and broadcasting have exactly one implementation.
   *
   * originId identifies the context that asked for this change, so the
   * broadcast can be recognised as an echo by whoever sent it. Absent for
   * background-internal callers (favicon patching), whose broadcasts are news
   * to everyone.
   */
  #commit(sites: PinnedSite[], originId?: string): PinnedSite[]
  {
    this.#sites = sites;

    chrome.storage.local.set({ [PINNED_SITES_STORAGE_KEY]: sites });

    // Notify every sidebar of the change. senderId is echoed back so the
    // context that requested it can ignore its own echo - see CONTEXT_ID in
    // proxies/messageRouting.ts.
    chrome.runtime.sendMessage({
      action: PINNED_SITES_CHANGED,
      sites,
      senderId: originId,
    }).catch(() =>
    {
      // Sidepanel may not be open - ignore error
    });

    return sites;
  }
}
