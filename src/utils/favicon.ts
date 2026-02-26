// Get favicon URL using Chrome's internal favicon cache
export const getFaviconUrl = (pageUrl: string): string => {
  try {
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
  } catch {
    return '';
  }
};

// Fetch a URL and convert the response to a base64 data URL.
// Works in both extension pages and service workers (no FileReader needed).
export const fetchAsBase64 = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Process in chunks to avoid call stack limits on large images
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192)
    {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    return `data:${mimeType};base64,${btoa(chunks.join(''))}`;
  } catch {
    return undefined;
  }
};

// Cached default favicon base64 (Chrome's globe icon for unknown sites)
let defaultFaviconBase64: string | undefined;

// Fetch Chrome's default favicon by requesting an invalid domain.
// Cached after the first call.
const fetchDefaultFavicon = async (): Promise<string | undefined> => {
  if (defaultFaviconBase64 !== undefined) return defaultFaviconBase64;

  const invalidUrl = getFaviconUrl('https://invalid.monemone.org');
  defaultFaviconBase64 = await fetchAsBase64(invalidUrl);

  if (import.meta.env.DEV)
  {
    console.log('[Favicon] cached default favicon',
      defaultFaviconBase64 ? `(${defaultFaviconBase64.length} chars)` : '(none)');
  }

  return defaultFaviconBase64;
};

// Fetch favicon and convert to base64 for storage.
// Returns undefined if the result matches Chrome's default globe icon.
export const fetchFaviconAsBase64 = async (url: string): Promise<string | undefined> => {
  // Run favicon fetch and default favicon fetch concurrently
  const [base64, defaultFavicon] = await Promise.all([
    fetchAsBase64(url),
    fetchDefaultFavicon(),
  ]);

  if (!base64) return undefined;

  // Filter out Chrome's default globe icon
  if (defaultFavicon && base64 === defaultFavicon)
  {
    if (import.meta.env.DEV)
    {
      console.log('[Favicon] filtered out default globe icon for:', url);
    }
    return undefined;
  }

  return base64;
};
