// Iconify API utilities for dynamic icon loading

const ICONIFY_API_BASE = 'https://api.iconify.design';
const ICONIFY_COLLECTION_API = `${ICONIFY_API_BASE}/collection?prefix=lucide`;

// Convert PascalCase or camelCase to kebab-case (for Iconify API)
// e.g., "LayoutGrid" -> "layout-grid", "ShoppingCart" -> "shopping-cart"
function toKebabCase(name: string): string
{
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// Get icon URL from Iconify CDN
export function getIconUrl(name: string): string
{
  const kebabName = toKebabCase(name);
  return `${ICONIFY_API_BASE}/lucide/${kebabName}.svg`;
}

// Fetch icon names from Iconify API
export async function fetchIconNames(): Promise<string[]>
{
  const response = await fetch(ICONIFY_COLLECTION_API);
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
  return names;
}

// Fetch icon SVG from CDN and convert to data URL with color
export async function iconToDataUrl(
  iconName: string,
  color: string = '#6b7280'
): Promise<string>
{
  try
  {
    const response = await fetch(getIconUrl(iconName));
    let svg = await response.text();
    // Replace stroke color in the SVG
    svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  catch
  {
    return '';
  }
}

// Shared icon cache for multiple components
let cachedIconNames: string[] | null = null;
let iconLoadPromise: Promise<string[]> | null = null;

export async function getIconNames(): Promise<string[]>
{
  if (cachedIconNames)
  {
    return cachedIconNames;
  }

  if (iconLoadPromise)
  {
    return iconLoadPromise;
  }

  iconLoadPromise = fetchIconNames().then((names) =>
  {
    cachedIconNames = names;
    return names;
  });

  return iconLoadPromise;
}
