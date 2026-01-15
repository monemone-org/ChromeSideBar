import React from 'react';
import { SpaceEditDialog } from './SpaceEditDialog';
import { SpaceDeleteDialog } from './SpaceDeleteDialog';
import { Space, useSpacesContext } from '../contexts/SpacesContext';

interface SpaceDialogsProps
{
  showEditDialog: boolean;
  spaceToEdit: Space | null;
  onCloseEditDialog: () => void;

  showDeleteDialog: boolean;
  spaceToDelete: Space | null;
  onCloseDeleteDialog: () => void;
}

export const SpaceDialogs: React.FC<SpaceDialogsProps> = ({
  showEditDialog,
  spaceToEdit,
  onCloseEditDialog,
  showDeleteDialog,
  spaceToDelete,
  onCloseDeleteDialog,
}) =>
{
  const { spaces, createSpace, updateSpace, deleteSpace, setActiveSpaceId, getTabGroupForSpace, clearStateForSpace } = useSpacesContext();

  const handleSaveSpace = async (spaceData: {
    name: string;
    icon: string;
    color: chrome.tabGroups.ColorEnum;
    bookmarkFolderPath: string;
  }) =>
  {
    if (spaceToEdit)
    {
      // Edit mode
      updateSpace(spaceToEdit.id, spaceData);

      // Also update the corresponding tab group if it exists
      const groupId = getTabGroupForSpace(spaceToEdit.id);
      if (groupId !== undefined)
      {
        try
        {
          await chrome.tabGroups.update(groupId, {
            title: spaceData.name,
            color: spaceData.color,
          });
        }
        catch (error)
        {
          // Tab group might no longer exist, ignore the error
          console.warn('Failed to update tab group:', error);
        }
      }
    }
    else
    {
      // Create mode
      const newSpace = createSpace(
        spaceData.name,
        spaceData.icon,
        spaceData.color,
        spaceData.bookmarkFolderPath
      );
      // Switch to the newly created space
      setActiveSpaceId(newSpace.id);
    }
  };

  const handleDeleteSpace = () =>
  {
    if (spaceToDelete)
    {
      // Cleanup per-window state before deleting the space
      clearStateForSpace(spaceToDelete.id);
      deleteSpace(spaceToDelete.id);
      // Switch to "All" space after deletion
      setActiveSpaceId('all');
    }
  };

  return (
    <>
      <SpaceEditDialog
        isOpen={showEditDialog}
        space={spaceToEdit}
        existingSpaces={spaces}
        onClose={onCloseEditDialog}
        onSave={handleSaveSpace}
      />

      <SpaceDeleteDialog
        isOpen={showDeleteDialog}
        space={spaceToDelete}
        onClose={onCloseDeleteDialog}
        onConfirm={handleDeleteSpace}
      />
    </>
  );
};
