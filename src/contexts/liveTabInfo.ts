import { normalizeHostForCompare } from '../utils/urlCompare';

/** Live title/url/favicon of a managed (pinned or bookmarked) tab, as Chrome reports them. */
export type LiveTabInfo = Pick<chrome.tabs.Tab, 'title' | 'url' | 'favIconUrl'>;

/**
 * Live info for managed tabs, keyed by tabId.
 * Immutable: every update returns a new instance, so it can be held in React state
 * and updated with `setState(prev => prev.withX(...))`.
 */
export class LiveTabInfoMap
{
  private readonly infos: ReadonlyMap<number, LiveTabInfo>;

  constructor(infos: ReadonlyMap<number, LiveTabInfo> = new Map())
  {
    this.infos = infos;
  }

  get(tabId: number): LiveTabInfo | undefined
  {
    return this.infos.get(tabId);
  }

  /** Seed (or refresh) a tab's info from a full chrome.tabs.Tab. */
  withTab(tabId: number, tab: chrome.tabs.Tab): LiveTabInfoMap
  {
    return this.withInfo(tabId, {
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
    });
  }

  /**
   * Apply a chrome.tabs.onUpdated change. Moving to another domain clears the
   * stored favicon (unless the same change reports a new one), since the old
   * site's icon is stale until Chrome reports the new site's.
   */
  withChanges(tabId: number, changeInfo: chrome.tabs.TabChangeInfo): LiveTabInfoMap
  {
    if (changeInfo.title === undefined
      && changeInfo.url === undefined
      && changeInfo.favIconUrl === undefined)
    {
      return this;
    }

    const prev = this.infos.get(tabId) ?? {};
    const next: LiveTabInfo = { ...prev };

    if (changeInfo.title !== undefined)
    {
      next.title = changeInfo.title;
    }

    // URL change: drop the favicon if the domain changed
    if (changeInfo.url !== undefined)
    {
      const domainChanged = !prev.url
        || normalizeHostForCompare(prev.url) !== normalizeHostForCompare(changeInfo.url);
      if (domainChanged)
      {
        next.favIconUrl = undefined;
      }
      next.url = changeInfo.url;
    }

    if (changeInfo.favIconUrl !== undefined)
    {
      next.favIconUrl = changeInfo.favIconUrl || undefined;
    }

    return this.withInfo(tabId, next);
  }

  /** Set a tab's url directly (e.g. optimistic update after navigating back to the saved URL). */
  withUrl(tabId: number, url: string): LiveTabInfoMap
  {
    return this.withChanges(tabId, { url });
  }

  withoutTab(tabId: number): LiveTabInfoMap
  {
    if (!this.infos.has(tabId)) return this;
    const infos = new Map(this.infos);
    infos.delete(tabId);
    return new LiveTabInfoMap(infos);
  }

  private withInfo(tabId: number, info: LiveTabInfo): LiveTabInfoMap
  {
    const infos = new Map(this.infos);
    infos.set(tabId, info);
    return new LiveTabInfoMap(infos);
  }
}
