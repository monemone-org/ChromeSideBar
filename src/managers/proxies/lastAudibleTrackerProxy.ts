// Sidebar-side client for background.ts's LastAudibleTracker.
//
// No mirror store and no broadcast listener, for the same reason as
// tabHistoryManagerProxy: the lists are read on an explicit click of the
// audio button, never during render, and the sidebar never writes them.

import { ManagerId, callManager, Remote } from './messageRouting';
import { AudioTabLists, LastAudibleTrackerApi } from '../shared/lastAudibleTrackerApi';

export const lastAudibleTrackerProxy: Remote<LastAudibleTrackerApi> = {
  async getAudioTabLists(windowId: number): Promise<AudioTabLists>
  {
    return await callManager<AudioTabLists>(ManagerId.LAST_AUDIBLE, 'getAudioTabLists', { windowId });
  },
};
