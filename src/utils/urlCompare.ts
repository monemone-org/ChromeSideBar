/**
 * Normalize a URL for comparing a live tab URL against a saved pin/bookmark URL.
 * Trailing slashes on non-root paths and a leading "www." on the host are
 * ignored so minor navigations and redirects do not look like a drift.
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
    // Ignore a leading "www." so figma.com and www.figma.com compare equal
    const host = parsed.host.toLowerCase().replace(/^www\./, '');
    return `${parsed.protocol}//${host}${pathname}${parsed.search}${parsed.hash}`;
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

/**
 * Normalize a URL's hostname for domain comparison: lowercase and drop a
 * leading "www.". Subdomains are otherwise significant, so mail.google.com
 * and accounts.google.com are different domains.
 */
export function normalizeHostForCompare(url: string): string | undefined
{
  try
  {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  }
  catch
  {
    return undefined;
  }
}

/** True when the live tab URL is on a different domain than the saved pin/bookmark URL. */
export function isDomainDrifted(savedUrl: string | undefined, liveUrl: string | undefined): boolean
{
  if (!savedUrl || !liveUrl) return false;
  const savedHost = normalizeHostForCompare(savedUrl);
  const liveHost = normalizeHostForCompare(liveUrl);
  if (!savedHost || !liveHost) return false;
  return savedHost !== liveHost;
}
