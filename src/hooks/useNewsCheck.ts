import { useState, useEffect, useCallback, useRef } from 'react';
import { NEWS_URL } from '../constants/urls';

// Written by background.ts NewsVersionChecker
const STORAGE_KEY_LATEST = 'sidebar-news-latest-version';
// Written by this hook when user dismisses the badge
const STORAGE_KEY_LAST_SEEN = 'sidebar-last-seen-news-version';

/**
 * Checks for unread news announcements.
 * The background script fetches and caches the latest news version on a weekly
 * schedule (triggered by Chrome tab events). This hook reads from
 * chrome.storage.local and reacts to changes.
 */
export function useNewsCheck(): {
  hasUnreadNews: boolean;
  markNewsRead: () => void;
  openNews: () => void;
}
{
  const [hasUnreadNews, setHasUnreadNews] = useState(false);
  const latestVersionRef = useRef<number>(0);

  useEffect(() =>
  {
    let mounted = true;

    // Compare latest vs last-seen from storage
    function checkForNews(): void
    {
      chrome.storage.local.get([STORAGE_KEY_LATEST, STORAGE_KEY_LAST_SEEN], (result) =>
      {
        if (!mounted) return;

        const latest = parseInt(String(result[STORAGE_KEY_LATEST] ?? 0), 10) || 0;
        const lastSeen = parseInt(String(result[STORAGE_KEY_LAST_SEEN] ?? 0), 10) || 0;
        latestVersionRef.current = latest;

        if (import.meta.env.DEV)
        {
          console.log(`[useNewsCheck] latest: ${latest}, lastSeen: ${lastSeen}`);
        }

        setHasUnreadNews(latest > lastSeen);
      });
    }

    // Read on mount
    checkForNews();

    // React when background writes a new version or user dismisses in another window
    const handleStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }) =>
    {
      if (!mounted) return;
      if (STORAGE_KEY_LATEST in changes || STORAGE_KEY_LAST_SEEN in changes)
      {
        checkForNews();
      }
    };

    chrome.storage.local.onChanged.addListener(handleStorageChanged);
    return () =>
    {
      mounted = false;
      chrome.storage.local.onChanged.removeListener(handleStorageChanged);
    };
  }, []);

  // Dismiss red dot and persist
  const markNewsRead = useCallback(() =>
  {
    const version = latestVersionRef.current;
    // Only persist if we know the latest version
    if (version > 0)
    {
      chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN]: version });
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
