import { DropPosition } from '../hooks/useDragDrop';

export interface MoveResult
{
  index: number;
  groupId: number;
}

export interface MoveTabAfterParams
{
  tabId: number;
  sourceIndex: number;
  sourceGroupId: number;
  targetTab: { index: number; groupId: number };
  moveTab: (tabId: number, index: number) => Promise<void>;
  groupTab: (tabId: number, groupId: number) => Promise<void>;
  ungroupTab: (tabId: number) => Promise<void>;
}

// Move a tab after a target tab (handles group membership and index adjustment)
export const moveTabAfter = async (params: MoveTabAfterParams): Promise<MoveResult> =>
{
  const {
    tabId,
    sourceIndex,
    sourceGroupId,
    targetTab,
    moveTab,
    groupTab,
    ungroupTab
  } = params;

  const targetGroupId = targetTab.groupId;

  // Handle group membership change first, then move
  if (targetGroupId !== sourceGroupId)
  {
    if (targetGroupId === -1)
    {
      if (sourceGroupId !== -1)
      {
        await ungroupTab(tabId);
      }
    }
    else
    {
      await groupTab(tabId, targetGroupId);
    }
  }

  // Reorder - always 'after'
  let targetIndex = targetTab.index + 1;
  if (sourceIndex < targetIndex)
  {
    targetIndex--;
  }
  await moveTab(tabId, targetIndex);

  return { index: targetIndex, groupId: targetGroupId };
};

export interface MoveSingleTabParams
{
  tabId: number;
  sourceIndex: number;
  sourceGroupId: number;
  dropTargetId: string;
  dropPosition: DropPosition;
  isGroupHeaderTarget: boolean;
  visibleTabs: chrome.tabs.Tab[];
  moveTab: (tabId: number, index: number) => Promise<void>;
  groupTab: (tabId: number, groupId: number) => Promise<void>;
  ungroupTab: (tabId: number) => Promise<void>;
}

// Move a single tab to a target location
// Handles group membership and index adjustment
// Returns null if the move could not be performed
export const moveSingleTab = async (params: MoveSingleTabParams): Promise<MoveResult | null> =>
{
  const {
    tabId,
    sourceIndex,
    sourceGroupId,
    dropTargetId,
    dropPosition,
    isGroupHeaderTarget,
    visibleTabs,
    moveTab,
    groupTab,
    ungroupTab
  } = params;

  // Adjust target index when source moves forward
  const adjustForSourceRemoval = (targetIndex: number): number =>
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

  if (isGroupHeaderTarget)
  {
    const targetGroupId = parseInt(dropTargetId.replace('group-', ''));
    const groupTabsList = visibleTabs.filter(t => (t.groupId ?? -1) === targetGroupId);

    if (groupTabsList.length === 0) return null;

    if (dropPosition === 'into')
    {
      // Move tab into group at the end
      if (sourceGroupId !== targetGroupId)
      {
        await groupTab(tabId, targetGroupId);
      }
      const lastTabIndex = groupTabsList[groupTabsList.length - 1].index;
      const finalIndex = adjustForSourceRemoval(lastTabIndex + 1);
      await moveTab(tabId, finalIndex);
      return { index: finalIndex, groupId: targetGroupId };
    }
    else if (dropPosition === 'before')
    {
      // Place before the group (as sibling, outside)
      if (sourceGroupId !== -1)
      {
        await ungroupTab(tabId);
      }
      const finalIndex = adjustForSourceRemoval(groupTabsList[0].index);
      await moveTab(tabId, finalIndex);
      return { index: finalIndex, groupId: -1 };
    }
    else if (dropPosition === 'intoFirst')
    {
      // Insert inside group at index 0
      const finalIndex = adjustForSourceRemoval(groupTabsList[0].index);
      await moveTab(tabId, finalIndex);
      if (sourceGroupId !== targetGroupId)
      {
        await groupTab(tabId, targetGroupId);
      }
      return { index: finalIndex, groupId: targetGroupId };
    }
    else
    {
      // 'after': sibling after group
      if (sourceGroupId !== -1)
      {
        await ungroupTab(tabId);
      }
      const lastTabIndex = groupTabsList[groupTabsList.length - 1].index;
      const finalIndex = adjustForSourceRemoval(lastTabIndex + 1);
      await moveTab(tabId, finalIndex);
      return { index: finalIndex, groupId: -1 };
    }
  }
  else if (dropTargetId === 'end-of-list')
  {
    if (visibleTabs.length === 0) return null;

    const lastTab = visibleTabs[visibleTabs.length - 1];
    if (sourceGroupId !== -1)
    {
      await ungroupTab(tabId);
    }
    const finalIndex = adjustForSourceRemoval(lastTab.index + 1);
    await moveTab(tabId, finalIndex);
    return { index: finalIndex, groupId: -1 };
  }
  else
  {
    // Target is a tab
    const targetTabId = parseInt(dropTargetId);
    const targetTab = visibleTabs.find(t => t.id === targetTabId);
    if (!targetTab) return null;

    const targetGroupId = targetTab.groupId ?? -1;

    // Handle group membership change first, then move
    if (targetGroupId !== sourceGroupId)
    {
      if (targetGroupId === -1)
      {
        if (sourceGroupId !== -1)
        {
          await ungroupTab(tabId);
        }
      }
      else
      {
        await groupTab(tabId, targetGroupId);
      }
    }

    // Reorder
    const baseIndex = dropPosition === 'before' ? targetTab.index : targetTab.index + 1;
    const finalIndex = adjustForSourceRemoval(baseIndex);
    await moveTab(tabId, finalIndex);
    return { index: finalIndex, groupId: targetGroupId };
  }
};
