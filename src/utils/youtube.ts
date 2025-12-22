export interface Chapter {
  title: string;
  timestamp: string;
  url: string;
}

// Extract video ID from YouTube URL
export const getYouTubeVideoId = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
  return match ? match[1] : null;
};

// Fetch chapters by executing script in tab (extracts from DOM)
export const fetchYouTubeChapters = async (tabId: number): Promise<Chapter[]> => {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function getVideoFromHref(urlStr: string): string | null {
        const urlObj = new URL(urlStr, document.baseURI);
        return urlObj.searchParams.get('v');
      }

      function zeroPad(num: number, places: number): string {
        const zero = places - num.toString().length + 1;
        return Array(+(zero > 0 && zero)).join("0") + num;
      }

      function getTimestampFromHref(urlObj: URL): string {
        const t = urlObj.searchParams.get('t');
        if (t) {
          const num = parseInt(t.replace(/s$/, ""));
          let min = Math.floor(num / 60);
          const sec = num % 60;
          if (min >= 60) {
            const hr = Math.floor(min / 60);
            min = min % 60;
            return `${zeroPad(hr, 2)}:${zeroPad(min, 2)}:${zeroPad(sec, 2)}`;
          } else {
            return `${zeroPad(min, 2)}:${zeroPad(sec, 2)}`;
          }
        }
        return "00:00";
      }

      // Get current video id
      const currentVid = getVideoFromHref(document.URL);
      const chapters: { title: string; timestamp: string; url: string }[] = [];

      // Find all chapter links (a#endpoint elements)
      document.querySelectorAll('a#endpoint').forEach(el => {
        const href = el.getAttribute('href');
        const elmTitle = el.querySelector('[title]');

        if (href && elmTitle) {
          const elmVid = getVideoFromHref(href);
          if (elmVid === currentVid) {
            const title = elmTitle.getAttribute('title') || '';
            const urlObj = new URL(href, document.baseURI);

            // Clean URL to only keep v and t params
            const cleanUrl = new URL(urlObj.origin + urlObj.pathname);
            cleanUrl.searchParams.set('v', elmVid!);
            const t = urlObj.searchParams.get('t');
            if (t) cleanUrl.searchParams.set('t', t);

            const fullUrl = cleanUrl.toString();
            const timestamp = getTimestampFromHref(urlObj);

            // Avoid duplicates
            if (!chapters.some(c => c.url === fullUrl)) {
              chapters.push({ title, timestamp, url: fullUrl });
            }
          }
        }
      });

      return chapters;
    }
  });
  return results[0]?.result || [];
};

// Jump to chapter by navigating to URL
export const jumpToChapter = async (tabId: number, url: string): Promise<void> => {
  await chrome.tabs.update(tabId, { url });
};
