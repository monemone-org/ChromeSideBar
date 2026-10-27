// Native tooltips wrap at roughly this width, so each line is cut to fit on one line
const TOOLTIP_LINE_MAX = 40;

// Label before the live tab's title in a drifted item's tooltip
const DRIFT_TOOLTIP_NOW_LABEL = 'Now: ';

// Last line of a drifted item's tooltip: how to go back to the saved URL
export const PIN_GO_BACK_HINT = 'Double-click to go back';
export const BOOKMARK_GO_BACK_HINT = 'Click icon to go back';

function truncateForTooltip(text: string): string
{
  return text.length > TOOLTIP_LINE_MAX ? `${text.slice(0, TOOLTIP_LINE_MAX - 1)}…` : text;
}

/**
 * Shorten a URL for display in a tooltip: drop the http(s) scheme, a leading
 * "www." and a lone trailing "/", then cut to the tooltip line length.
 * Other schemes (chrome://, file://) are kept as-is so they stay recognisable.
 */
export function shortenUrlForTooltip(url: string): string
{
  let display = url;
  try
  {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    {
      const host = parsed.host.replace(/^www\./, '');
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      display = `${host}${path}${parsed.search}${parsed.hash}`;
    }
  }
  catch
  {
    // Not a parseable URL; show it as-is
  }
  return truncateForTooltip(display);
}

/** What a pinned site's or bookmark's tooltip describes. */
export interface DriftTooltipInfo
{
  name: string;
  savedUrl: string;
  isDrifted: boolean;
  liveTitle?: string;
  // Add a "Now: <tab title>" line when drifted; skip it when the item already shows the tab's title
  showNowLine: boolean;
  goBackHint: string;
}

/**
 * Tooltip text shared by pinned sites and bookmarks. Always the name and saved
 * URL; when drifted, optionally the tab's title, then how to go back:
 *
 *   Name
 *   saved-url
 *   Now: live tab title      (drifted, if showNowLine)
 *   Go-back hint             (drifted)
 */
export function buildDriftTooltip(info: DriftTooltipInfo): string
{
  const lines = [truncateForTooltip(info.name), shortenUrlForTooltip(info.savedUrl)];

  // Drifted: say where the tab is (unless already visible) and how to go back
  if (info.isDrifted)
  {
    if (info.showNowLine && info.liveTitle)
    {
      lines.push(truncateForTooltip(`${DRIFT_TOOLTIP_NOW_LABEL}${info.liveTitle}`));
    }
    lines.push(info.goBackHint);
  }
  return lines.join('\n');
}
