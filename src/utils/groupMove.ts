import { DropPosition } from '../hooks/useDragDrop';

export interface GroupMoveResult
{
  index: number;  // Index after the group's last tab
}

export interface MoveSingleGroupParams
{
  groupId: number;
  sourceFirstIndex: number;   // First tab index of source group
  sourceTabCount: number;     // Number of tabs in source group
  dropTargetId: string;
  dropPosition: DropPosition;
  visibleTabs: chrome.tabs.Tab[];
  moveGroup: (groupId: number, index: number) => void;
}

export interface MoveGroupAfterParams
{
  groupId: number;
  sourceFirstIndex: number;
  sourceTabCount: number;
  targetIndex: number;        // Move group to start at this index
  moveGroup: (groupId: number, index: number) => void;
}

// Move a single group to a target location
// Returns the index after the group's last tab for chaining
export const moveSingleGroup = (params: MoveSingleGroupParams): GroupMoveResult | null =>
{
  const {
    groupId,
    sourceFirstIndex,
    sourceTabCount,
    dropTargetId,
    dropPosition,
    visibleTabs,
    moveGroup
  } = params;

  // Adjust target index when source moves forward (source tabs are removed first)
  const adjustForSourceRemoval = (targetIndex: number): number =>
    sourceFirstIndex < targetIndex ? targetIndex - sourceTabCount : targetIndex;

  const isGroupHeaderTarget = dropTargetId.startsWith('group-');
  let targetIndex = -1;

  if (dropTargetId === 'end-of-list')
  {
    // Move group to very end
    if (visibleTabs.length === 0) return null;

    const lastTab = visibleTabs[visibleTabs.length - 1];
    targetIndex = adjustForSourceRemoval(lastTab.index + 1);
  }
  else if (isGroupHeaderTarget)
  {
    // Dropping relative to another group
    const targetGroupId = parseInt(dropTargetId.replace('group-', ''), 10);
    const targetGroupTabs = visibleTabs.filter(t => (t.groupId ?? -1) === targetGroupId);

    if (targetGroupTabs.length === 0) return null;

    if (dropPosition === 'before')
    {
      // Move before target group's first tab
      targetIndex = adjustForSourceRemoval(targetGroupTabs[0].index);
    }
    else
    {
      // 'after' or 'into': Move after target group's last tab
      const lastTab = targetGroupTabs[targetGroupTabs.length - 1];
      targetIndex = adjustForSourceRemoval(lastTab.index + 1);
    }
  }
  else
  {
    // Dropping relative to a tab
    const targetTabId = parseInt(dropTargetId, 10);
    const targetTab = visibleTabs.find(t => t.id === targetTabId);

    if (!targetTab) return null;

    const baseIndex = dropPosition === 'before' ? targetTab.index : targetTab.index + 1;
    targetIndex = adjustForSourceRemoval(baseIndex);
  }

  if (targetIndex < 0) return null;

  moveGroup(groupId, targetIndex);
  return { index: targetIndex + sourceTabCount };
};

// Move a group after a previous group's position (for chaining)
export const moveGroupAfter = (params: MoveGroupAfterParams): GroupMoveResult =>
{
  const {
    groupId,
    sourceFirstIndex,
    sourceTabCount,
    targetIndex,
    moveGroup
  } = params;

  // Adjust for source removal: if source was before target, target shifts down
  const finalIndex = sourceFirstIndex < targetIndex
    ? targetIndex - sourceTabCount
    : targetIndex;

  moveGroup(groupId, finalIndex);
  return { index: finalIndex + sourceTabCount };
};
