import { useState, useEffect, useCallback, useRef } from 'react';

const LATEST_VERSION_URL =
  'https://raw.githubusercontent.com/monemone-org/ChromeSideBar/main/docs/news/latest.version';
const NEWS_URL =
  'https://github.com/monemone-org/ChromeSideBar/blob/main/docs/news/news.md';

const STORAGE_KEY_NEWS_VERSION = 'sidebar-last-seen-news-version';
const STORAGE_KEY_NEWS_CHECK_TIME = 'sidebar-last-news-check-time';
const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

function parseStoredNumber(value: unknown): number
{
  if (value === undefined || value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Periodically checks for news announcements hosted on GitHub.
 * Fetches `latest.version` at most once per week.
 * Returns whether there's unread news and a function to mark it read.
 */
export function useNewsCheck(): {
  hasUnreadNews: boolean;
  markNewsRead: () => void;
  openNews: () => void;
}
{
  const [hasUnreadNews, setHasUnreadNews] = useState(false);

  // Refs to hold latest stored values (avoid stale closures)
  const lastSeenVersionRef = useRef<number>(0);
  const latestVersionRef = useRef<number>(0);

  // Load stored values and check on mount
  useEffect(() =>
  {
    let mounted = true;

    chrome.storage.local.get(
      [STORAGE_KEY_NEWS_VERSION, STORAGE_KEY_NEWS_CHECK_TIME],
      (result) =>
      {
        if (!mounted) return;

        const lastSeenVersion = parseStoredNumber(result[STORAGE_KEY_NEWS_VERSION]);
        const lastCheckTime = parseStoredNumber(result[STORAGE_KEY_NEWS_CHECK_TIME]);
        lastSeenVersionRef.current = lastSeenVersion;

        const now = Date.now();
        if (now - lastCheckTime >= CHECK_INTERVAL_MS)
        {
          fetchLatestVersion(lastSeenVersion, mounted);
        }
      }
    );

    // Re-check when sidebar becomes visible (e.g. reopened after a while)
    const handleVisibility = () =>
    {
      if (document.visibilityState !== 'visible') return;
      if (!mounted) return;

      chrome.storage.local.get(
        [STORAGE_KEY_NEWS_VERSION, STORAGE_KEY_NEWS_CHECK_TIME],
        (result) =>
        {
          if (!mounted) return;

          const lastSeenVersion = parseStoredNumber(result[STORAGE_KEY_NEWS_VERSION]);
          const lastCheckTime = parseStoredNumber(result[STORAGE_KEY_NEWS_CHECK_TIME]);
          lastSeenVersionRef.current = lastSeenVersion;

          // Re-evaluate badge from cached fetch result
          if (latestVersionRef.current > lastSeenVersion)
          {
            setHasUnreadNews(true);
          }

          const now = Date.now();
          if (now - lastCheckTime >= CHECK_INTERVAL_MS)
          {
            fetchLatestVersion(lastSeenVersion, mounted);
          }
        }
      );
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () =>
    {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Fetch latest.version from GitHub and update badge state
  function fetchLatestVersion(lastSeenVersion: number, mounted: boolean): void
  {
    fetch(LATEST_VERSION_URL)
      .then((res) =>
      {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) =>
      {
        if (!mounted) return;

        const fetched = parseInt(text.trim(), 10);
        if (isNaN(fetched)) return;

        latestVersionRef.current = fetched;

        if (import.meta.env.DEV)
        {
          console.log(`[useNewsCheck] Fetched news version: ${fetched}, lastSeen: ${lastSeenVersion}`);
        }

        // Record check time
        chrome.storage.local.set({
          [STORAGE_KEY_NEWS_CHECK_TIME]: Date.now()
        });

        // Show badge if there's new content
        if (fetched > lastSeenVersion)
        {
          setHasUnreadNews(true);
        }
      })
      .catch(() =>
      {
        // Silently skip — try again next week
      });
  }

  // Dismiss red dot without opening the page
  const markNewsRead = useCallback(() =>
  {
    const version = latestVersionRef.current;
    if (version > 0)
    {
      chrome.storage.local.set({ [STORAGE_KEY_NEWS_VERSION]: version });
      lastSeenVersionRef.current = version;
    }
    setHasUnreadNews(false);
  }, []);

  // Open news page and mark as read
  const openNews = useCallback(() =>
  {
    chrome.tabs.create({ url: NEWS_URL });
    markNewsRead();
  }, [markNewsRead]);

  return { hasUnreadNews, markNewsRead, openNews };
}
