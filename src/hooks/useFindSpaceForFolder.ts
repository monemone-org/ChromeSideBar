import { useCallback } from 'react';
import { Space } from '../utils/spaceMessages';
import { findSpaceForFolderSegments } from '../utils/spaceFolderMatch';

// Resolve which Space owns a bookmark folder, given its id. Takes the caller's
// existing getBookmarkSegments (from useBookmarks()) and spaces (from
// useSpacesContext()) instead of fetching them itself, so callers that already
// hold both don't end up with a second set of listeners/state for the same data.
export const useFindSpaceForFolder = (
  getBookmarkSegments: (bookmarkId: string) => Promise<string[]>,
  spaces: readonly Space[]
) =>
{
  return useCallback(async (folderId: string): Promise<Space | undefined> =>
  {
    const segments = await getBookmarkSegments(folderId);
    return findSpaceForFolderSegments(segments, spaces);
  }, [getBookmarkSegments, spaces]);
};
