// Iconify API utilities for dynamic icon loading

const ICONIFY_API_BASE = 'https://api.iconify.design';
const ICONIFY_COLLECTION_API = `${ICONIFY_API_BASE}/collection?prefix=lucide`;

// Get icon URL from Iconify CDN
// Icon names are expected in kebab-case (e.g., "shopping-cart", "layout-grid")
export function getIconUrl(name: string): string
{
  return `${ICONIFY_API_BASE}/lucide/${name}.svg`;
}

// Iconify JSON API shape for one icon (only the fields we use)
interface IconifyIconData
{
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

// Iconify JSON API response for `/lucide.json?icons=...`
interface IconifyIconSetResponse
{
  icons?: Record<string, IconifyIconData>;
  aliases?: Record<string, { parent: string }>;
  not_found?: string[];
  width?: number;
  height?: number;
}

// Max names per batched request, keeps the URL a sane length
const ICON_BATCH_SIZE = 100;
// Wait this long after the last request() before sending, so fast scrolling coalesces
const ICON_BATCH_DELAY_MS = 80;
// Retry delay for failed batches when the server gives no Retry-After
const ICON_RETRY_DELAY_MS = 10_000;

// Loads Lucide SVGs from Iconify in batches and keeps them as data URLs in memory.
// The public Iconify API rate-limits per IP (HTTP 429 with a 5 minute Retry-After),
// so one <img> request per grid cell breaks the picker after a screen or two.
// This class fetches every icon the grid currently shows in one request instead.
class IconSvgCache
{
  private dataUrls = new Map<string, string>();
  private missingNames = new Set<string>();
  private pendingNames = new Set<string>();
  private inFlightNames = new Set<string>();
  private listeners = new Set<() => void>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private blockedUntil = 0;

  // Data URL for a loaded icon, undefined while it is not loaded yet
  getDataUrl(name: string): string | undefined
  {
    return this.dataUrls.get(name);
  }

  // Ask for the icons currently on screen. Replaces any earlier pending request,
  // so icons scrolled past before the batch is sent are not fetched.
  request(names: string[]): void
  {
    this.pendingNames.clear();
    // Queue only the names that are not loaded, not loading and not known missing
    for (const name of names)
    {
      if (!this.dataUrls.has(name) && !this.missingNames.has(name) && !this.inFlightNames.has(name))
      {
        this.pendingNames.add(name);
      }
    }
    if (this.pendingNames.size > 0)
    {
      this.scheduleFlush(ICON_BATCH_DELAY_MS);
    }
  }

  // Get notified when new icons are loaded. Returns the unsubscribe function.
  subscribe(listener: () => void): () => void
  {
    this.listeners.add(listener);
    return () =>
    {
      this.listeners.delete(listener);
    };
  }

  private scheduleFlush(delayMs: number): void
  {
    if (this.flushTimer)
    {
      clearTimeout(this.flushTimer);
    }
    const waitMs = Math.max(delayMs, this.blockedUntil - Date.now());
    this.flushTimer = setTimeout(() =>
    {
      this.flushTimer = null;
      void this.flush();
    }, waitMs);
  }

  private async flush(): Promise<void>
  {
    // Nobody is showing icons anymore (picker closed), drop the queue
    if (this.listeners.size === 0)
    {
      this.pendingNames.clear();
      return;
    }

    const names = [...this.pendingNames];
    this.pendingNames.clear();
    // Send the queue in URL-sized chunks
    for (let i = 0; i < names.length; i += ICON_BATCH_SIZE)
    {
      void this.fetchBatch(names.slice(i, i + ICON_BATCH_SIZE));
    }
  }

  private async fetchBatch(names: string[]): Promise<void>
  {
    names.forEach((name) => this.inFlightNames.add(name));
    try
    {
      const url = `${ICONIFY_API_BASE}/lucide.json?icons=${names.map(encodeURIComponent).join(',')}`;
      const response = await fetch(url);
      if (!response.ok)
      {
        // Respect the server's back-off so we do not extend the rate limit window
        const retryAfterSec = Number(response.headers.get('retry-after'));
        const retryMs = retryAfterSec > 0 ? retryAfterSec * 1000 : ICON_RETRY_DELAY_MS;
        this.blockedUntil = Date.now() + retryMs;
        throw new Error(`HTTP ${response.status}`);
      }
      this.storeIconSet(await response.json() as IconifyIconSetResponse, names);
      this.notify();
    }
    catch (error)
    {
      if (import.meta.env.DEV)
      {
        console.warn('Failed to load icon batch, will retry:', error);
      }
      // Put the failed names back in the queue and retry later
      names.forEach((name) => this.pendingNames.add(name));
      this.scheduleFlush(Math.max(ICON_RETRY_DELAY_MS, this.blockedUntil - Date.now()));
    }
    finally
    {
      names.forEach((name) => this.inFlightNames.delete(name));
    }
  }

  // Turn the Iconify JSON response into data URLs, one per requested name
  private storeIconSet(data: IconifyIconSetResponse, requestedNames: string[]): void
  {
    const icons = data.icons ?? {};
    // Resolve each requested name, following aliases to their parent icon
    for (const name of requestedNames)
    {
      const iconName = icons[name] ? name : data.aliases?.[name]?.parent;
      const icon = iconName ? icons[iconName] : undefined;
      if (!icon)
      {
        this.missingNames.add(name);
        continue;
      }
      const width = icon.width ?? data.width ?? 24;
      const height = icon.height ?? data.height ?? 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}">${icon.body}</svg>`;
      this.dataUrls.set(name, `data:image/svg+xml,${encodeURIComponent(svg)}`);
    }
  }

  private notify(): void
  {
    this.listeners.forEach((listener) => listener());
  }
}

// Shared across all pickers so reopening a dialog does not refetch
export const iconSvgCache = new IconSvgCache();

// Result type for icon fetching
export interface IconFetchResult
{
  icons: string[];
  error: string | null;
}

// Fetch icon names from Iconify API
export async function fetchIconNames(): Promise<IconFetchResult>
{
  // Check offline status first
  if (!navigator.onLine)
  {
    return { icons: [], error: 'You appear to be offline' };
  }

  try
  {
    const response = await fetch(ICONIFY_COLLECTION_API);
    if (!response.ok)
    {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const names: string[] = [];
    if (data.uncategorized)
    {
      names.push(...data.uncategorized);
    }
    if (data.categories)
    {
      for (const category of Object.values(data.categories))
      {
        names.push(...(category as string[]));
      }
    }
    names.sort();
    return { icons: names, error: null };
  }
  catch (error)
  {
    console.warn('Failed to fetch icon names:', error);
    return { icons: [], error: 'Failed to load icons' };
  }
}

// Fetch icon SVG from CDN and convert to data URL with color
export async function iconToDataUrl(
  iconName: string,
  color: string = '#6b7280'
): Promise<string | undefined>
{
  try
  {
    const response = await fetch(getIconUrl(iconName));
    let svg = await response.text();
    // Replace stroke color in the SVG
    svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  catch (error)
  {
    console.warn(`Failed to load icon "${iconName}":`, error);
    return undefined;
  }
}

// Shared icon cache for multiple components
let cachedResult: IconFetchResult | null = null;
let iconLoadPromise: Promise<IconFetchResult> | null = null;

export async function getIconNames(): Promise<IconFetchResult>
{
  // Return cached result only if successful (has icons)
  if (cachedResult && cachedResult.icons.length > 0)
  {
    return cachedResult;
  }

  if (iconLoadPromise)
  {
    return iconLoadPromise;
  }

  iconLoadPromise = fetchIconNames().then((result) =>
  {
    // Only cache successful results
    if (result.icons.length > 0)
    {
      cachedResult = result;
    }
    iconLoadPromise = null;
    return result;
  });

  return iconLoadPromise;
}
