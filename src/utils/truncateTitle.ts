/**
 * Truncate a title to a max character length, adding "..." if trimmed.
 * Used in toast descriptions to keep messages compact.
 */
export function truncateTitle(title: string, maxLen: number = 25): string
{
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen) + '...';
}
