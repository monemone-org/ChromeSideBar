// Sidebar-side client for SpaceTabManager. The sidebar never reads the
// grouping queue, so like tabSpaceRegistryProxy there is no mirror store and
// no broadcast listener here - see shared/spaceTabManagerApi.ts.

import { ManagerId, callManager, Remote } from './messageRouting';
import { CreatedTabs, NewTab, SpaceTabManagerApi, TabPlacement } from '../shared/spaceTabManagerApi';

export const spaceTabManagerProxy: Remote<SpaceTabManagerApi> = {
  async createTabs(windowId: number, tabs: NewTab[], placement: TabPlacement): Promise<CreatedTabs>
  {
    return await callManager<CreatedTabs>(ManagerId.SPACE_TAB, 'createTabs', { windowId, tabs, placement });
  },

  async assignTabToSpace(windowId: number, tabId: number, spaceId: string): Promise<void>
  {
    await callManager<void>(ManagerId.SPACE_TAB, 'assignTabToSpace', { windowId, tabId, spaceId });
  },

  async requestGrouping(windowId: number, tabId: number): Promise<void>
  {
    await callManager<void>(ManagerId.SPACE_TAB, 'requestGrouping', { windowId, tabId });
  },
};
