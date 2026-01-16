import React from 'react';
import * as ContextMenu from './ContextMenu';
import { Pencil, X, Trash2 } from 'lucide-react';

interface SpaceContextMenuContentProps
{
  isAllSpace: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onCloseAllTabs?: () => void;
}

export const SpaceContextMenuContent: React.FC<SpaceContextMenuContentProps> = ({
  isAllSpace,
  onEdit,
  onDelete,
  onCloseAllTabs,
}) =>
{
  if (isAllSpace)
  {
    return (
      <ContextMenu.Item onSelect={onCloseAllTabs}>
        <X size={14} className="mr-2 flex-shrink-0" /> Close All Tabs
      </ContextMenu.Item>
    );
  }

  return (
    <>
      <ContextMenu.Item onSelect={onEdit}>
        <Pencil size={14} className="mr-2 flex-shrink-0" /> Edit
      </ContextMenu.Item>

      <ContextMenu.Separator />

      <ContextMenu.Item onSelect={onCloseAllTabs}>
        <X size={14} className="mr-2 flex-shrink-0" /> Close All Tabs In Space
      </ContextMenu.Item>

      <ContextMenu.Separator />

      <ContextMenu.Item danger onSelect={onDelete}>
        <Trash2 size={14} className="mr-2 flex-shrink-0" /> Delete
      </ContextMenu.Item>
    </>
  );
};
