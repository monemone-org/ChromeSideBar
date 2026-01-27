function scrollToDataElement(dataAttribute: string, id: string, delay: number): void
{
  setTimeout(() =>
  {
    const element = document.querySelector(`[${dataAttribute}="${id}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, delay);
}

const DEFAULT_DELAY = 100;

export function scrollToBookmark(bookmarkId: string, delay: number = DEFAULT_DELAY): void
{
  scrollToDataElement('data-bookmark-id', bookmarkId, delay);
}

export function scrollToTab(tabId: string | number, delay: number = DEFAULT_DELAY): void
{
  scrollToDataElement('data-tab-id', String(tabId), delay);
}
