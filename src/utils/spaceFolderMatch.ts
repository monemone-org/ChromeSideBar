import { Space } from './spaceMessages';

// Find the Space that owns a bookmark folder, given the folder's full title path
// (root-to-leaf, as returned by useBookmarks().getBookmarkSegments).
//
// A bookmark folder is assumed to belong to at most one Space (see CLAUDE.md
// "Design Assumptions") - if more than one Space's folder segments match, the
// first one found wins.
export function findSpaceForFolderSegments(folderSegments: string[], spaces: Space[]): Space | undefined
{
  return spaces.find(space =>
  {
    const spaceSegments = space.bookmarkFolderSegments;
    if (!spaceSegments || spaceSegments.length === 0 || spaceSegments.length > folderSegments.length)
    {
      return false;
    }
    return spaceSegments.every((segment, i) => segment === folderSegments[i]);
  });
}
