/**
 * Normalize a URL for comparing a live tab URL against a saved pin/bookmark URL.
 * Trailing slashes on non-root paths are ignored so minor navigations do not
 * look like a drift.
 */
export function normalizeUrlForCompare(url: string): string
{
  try
  {
    const parsed = new URL(url);
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/'))
    {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}${parsed.hash}`;
  }
  catch
  {
    return url;
  }
}

/** True when the live tab URL differs from the saved pin/bookmark URL. */
export function isUrlDrifted(savedUrl: string | undefined, liveUrl: string | undefined): boolean
{
  if (!savedUrl || !liveUrl) return false;
  return normalizeUrlForCompare(savedUrl) !== normalizeUrlForCompare(liveUrl);
}
