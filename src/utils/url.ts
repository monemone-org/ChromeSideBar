/**
 * Check if a string is a valid HTTP/HTTPS URL
 */
export function isValidUrl(text: string): boolean
{
  try
  {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  catch
  {
    return false;
  }
}
