import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Dialog } from './Dialog';
import { FolderPickerDialog } from './FolderPickerDialog';
import { IconColorPicker, ColorOption } from './IconColorPicker';
import { useBookmarks } from '../hooks/useBookmarks';
import { Space } from '../hooks/useSpaces';
import { GROUP_COLOR_OPTIONS } from '../utils/groupColors';
import { getIconUrl } from '../utils/iconify';
import { Folder, FolderOpen } from 'lucide-react';

interface SpaceEditDialogProps
{
  isOpen: boolean;
  space: Space | null; // null = create mode, Space = edit mode
  existingSpaces: Space[]; // all spaces for duplicate name validation
  onClose: () => void;
  onSave: (spaceData: {
    name: string;
    icon: string;
    color: chrome.tabGroups.ColorEnum;
    bookmarkFolderPath: string;
  }) => void;
}

// Convert GROUP_COLOR_OPTIONS to ColorOption format for IconColorPicker
const SPACE_COLOR_OPTIONS: ColorOption[] = GROUP_COLOR_OPTIONS.map((opt) => ({
  value: opt.value,
  name: opt.value.charAt(0).toUpperCase() + opt.value.slice(1),
  className: opt.dot,
}));

export const SpaceEditDialog: React.FC<SpaceEditDialogProps> = ({
  isOpen,
  space,
  existingSpaces,
  onClose,
  onSave,
}) =>
{
  const isCreateMode = space === null;
  const { createFolder, getBookmarkPath, findFolderByPath } = useBookmarks();

  // Form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('briefcase');
  const [color, setColor] = useState<chrome.tabGroups.ColorEnum>('blue');
  const [bookmarkFolderPath, setBookmarkFolderPath] = useState('');
  const [useExistingFolder, setUseExistingFolder] = useState(false);

  // Folder picker dialog state
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Validation state
  const [nameError, setNameError] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form when dialog opens
  useEffect(() =>
  {
    if (isOpen)
    {
      if (space)
      {
        // Edit mode - populate with space data
        setName(space.name);
        setIcon(space.icon);
        setColor(space.color);
        setBookmarkFolderPath(space.bookmarkFolderPath);
        setUseExistingFolder(true);
      }
      else
      {
        // Create mode - reset to defaults
        setName('');
        setIcon('briefcase');
        setColor('blue');
        setBookmarkFolderPath('');
        setUseExistingFolder(false);
      }
      setNameError('');
    }
  }, [isOpen, space]);

  // Validate name
  const validateName = useCallback((value: string): boolean =>
  {
    const trimmedValue = value.trim();
    if (!trimmedValue)
    {
      setNameError('Name is required');
      return false;
    }

    // Check for duplicate name (case-insensitive)
    const isDuplicate = existingSpaces.some(s =>
      s.name.trim().toLowerCase() === trimmedValue.toLowerCase() &&
      s.id !== space?.id  // Exclude current space in edit mode
    );
    if (isDuplicate)
    {
      setNameError('A space with this name already exists');
      return false;
    }

    setNameError('');
    return true;
  }, [existingSpaces, space]);

  // Debounced validation as user types
  useEffect(() =>
  {
    // Clear any existing timer
    if (debounceTimerRef.current)
    {
      clearTimeout(debounceTimerRef.current);
    }

    // Only validate if there's input (don't show error for empty field while typing)
    if (name.trim())
    {
      debounceTimerRef.current = setTimeout(() =>
      {
        validateName(name);
      }, 300);
    }
    else
    {
      // Clear error when field is emptied (will show on blur/save)
      setNameError('');
    }

    return () =>
    {
      if (debounceTimerRef.current)
      {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [name, validateName]);

  // Handle folder selection from picker
  const handleFolderSelect = useCallback(async (folderId: string) =>
  {
    setShowFolderPicker(false);
    try
    {
      const path = await getBookmarkPath(folderId);
      setBookmarkFolderPath(path);
      setUseExistingFolder(true);
    }
    catch (error)
    {
      console.error('Failed to get folder path:', error);
    }
  }, [getBookmarkPath]);

  // Handle save
  const handleSave = useCallback(async () =>
  {
    if (!validateName(name)) return;

    let finalPath = bookmarkFolderPath;

    // If creating new space without existing folder, create the folder
    if (isCreateMode && !useExistingFolder)
    {
      const folderName = name.trim();
      const parentPath = 'Other Bookmarks';

      // Create folder under Other Bookmarks
      await new Promise<void>((resolve, reject) =>
      {
        createFolder('2', folderName, (newFolder) =>
        {
          if (newFolder)
          {
            finalPath = `${parentPath}/${folderName}`;
            resolve();
          }
          else
          {
            reject(new Error('Failed to create folder'));
          }
        });
      });
    }

    // In edit mode, check if folder path is valid
    if (!isCreateMode && bookmarkFolderPath)
    {
      const folder = findFolderByPath(bookmarkFolderPath);
      if (!folder)
      {
        setNameError('Selected folder no longer exists');
        return;
      }
    }

    onSave({
      name: name.trim(),
      icon,
      color,
      bookmarkFolderPath: finalPath,
    });
    onClose();
  }, [
    name,
    icon,
    color,
    bookmarkFolderPath,
    isCreateMode,
    useExistingFolder,
    validateName,
    createFolder,
    findFolderByPath,
    onSave,
    onClose
  ]);

  // Display text for folder section
  const getFolderDisplayText = (): string =>
  {
    if (useExistingFolder && bookmarkFolderPath)
    {
      return bookmarkFolderPath;
    }
    if (name.trim())
    {
      return `Other Bookmarks/${name.trim()}`;
    }
    return 'Other Bookmarks/{name}';
  };

  // Current icon preview for IconColorPicker
  const currentIconPreview = useMemo(() =>
  {
    if (!icon) return null;
    return (
      <img
        src={getIconUrl(icon)}
        alt={icon}
        width={20}
        height={20}
        className="dark:invert"
      />
    );
  }, [icon]);

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={isCreateMode ? 'Create Space' : 'Edit Space'}
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col">
          {/* Form content */}
          <div className="p-3 space-y-4">
            {/* Name input */}
            <div>
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => validateName(name)}
                placeholder="Enter space name"
                className={clsx(
                  "w-full px-2 py-1.5 border rounded",
                  "dark:bg-gray-900 dark:text-white",
                  "focus:ring-1 focus:ring-blue-500 outline-none",
                  nameError
                    ? "border-red-500 dark:border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                )}
                autoFocus
              />
              {nameError && (
                <p className="mt-1 text-[0.85em] text-red-500">{nameError}</p>
              )}
            </div>

            {/* Icon and Color picker */}
            <IconColorPicker
              selectedIcon={icon}
              selectedColor={color}
              currentIconPreview={currentIconPreview}
              onIconSelect={setIcon}
              onColorSelect={(c) => setColor(c as chrome.tabGroups.ColorEnum)}
              colorOptions={SPACE_COLOR_OPTIONS}
              iconGridHeight={90}
            />

            {/* Bookmark folder */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bookmark Folder
              </label>
              <p className="text-[0.85em] text-gray-500 dark:text-gray-400 mb-2">
                Bookmarks saved in this space will be stored in this folder.
              </p>
              <div className="flex items-center gap-2 px-2 py-1.5 border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-600">
                {useExistingFolder ? (
                  <FolderOpen size={14} className="text-yellow-500 flex-shrink-0" />
                ) : (
                  <Folder size={14} className="text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={clsx(
                    "truncate",
                    useExistingFolder
                      ? "text-gray-700 dark:text-gray-300"
                      : "text-gray-400 dark:text-gray-500 italic"
                  )}
                  title={getFolderDisplayText()}
                >
                  {getFolderDisplayText()}
                </span>
              </div>
              {isCreateMode && !useExistingFolder && (
                <p className="mt-1 text-[0.85em] text-gray-500 dark:text-gray-400">
                  This folder will be created when saved
                </p>
              )}
              <button
                onClick={() => setShowFolderPicker(true)}
                className="mt-1 px-2 py-1 text-[0.85em] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded border border-blue-300 dark:border-blue-600"
              >
                Pick existing folder
              </button>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 p-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreateMode ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Folder picker dialog */}
      <FolderPickerDialog
        isOpen={showFolderPicker}
        title="Select Bookmark Folder"
        onSelect={handleFolderSelect}
        onClose={() => setShowFolderPicker(false)}
      />
    </>
  );
};
