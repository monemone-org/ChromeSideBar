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
  const { spaces, createSpace, updateSpace, deleteSpace, setActiveSpaceId } = useSpacesContext();

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
