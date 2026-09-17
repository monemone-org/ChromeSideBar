// The wire contract for LastAudibleTracker, owned by neither side.
//
// impl/lastAudibleTracker.ts implements LastAudibleTrackerApi;
// proxies/lastAudibleTrackerProxy.ts implements Remote<LastAudibleTrackerApi>.
// Both import this file, so the two signatures cannot drift apart silently -
// and neither has to import the other.

/** The audio button's two lists, as the quick-jump and the dropdown read them. */
export interface AudioTabLists
{
  /** Currently audible, in the order playback started. */
  playingTabIds: number[];
  /** Recently audible but silent now, most recently activated first. */
  historyTabIds: number[];
}

/**
 * The subset of LastAudibleTracker the sidebar can call.
 *
 * setLastAudibleTabId/clearIfMatches/load are background-internal - the
 * sidebar only ever reads the lists, so there is no mirror store or broadcast
 * for this manager.
 */
export interface LastAudibleTrackerApi
{
  /** Async because the manager queries the window's tabs itself to find out which are audible right now. */
  getAudioTabLists(windowId: number): Promise<AudioTabLists>;
}
