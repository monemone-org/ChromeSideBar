import { useState, useEffect, useCallback, useRef } from 'react';

type Parser<T> = (value: string) => T;
type Serializer<T> = (value: T) => string;

/**
 * Similar to useLocalStorage but uses chrome.storage.local for real-time cross-window sync.
 * The chrome.storage.onChanged event fires in ALL windows including the one that made the change,
 * unlike browser localStorage's storage event which only fires in other windows.
 *
 * On first use, automatically migrates data from localStorage to chrome.storage.local.
 */
export function useChromeLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    parse?: Parser<T>;
    serialize?: Serializer<T>;
  }
): [T, (value: T) => void]
{
  const parse = options?.parse ?? ((v: string) => JSON.parse(v) as T);
  const serialize = options?.serialize ?? ((v: T) => JSON.stringify(v));

  // Use refs for parse/serialize/initialValue to avoid them triggering effect re-runs.
  // These are inline functions/values recreated every render, but their logic is stable.
  const parseRef = useRef(parse);
  const serializeRef = useRef(serialize);
  const initialValueRef = useRef(initialValue);
  parseRef.current = parse;
  serializeRef.current = serialize;
  initialValueRef.current = initialValue;

  const [value, setValue] = useState<T>(initialValue);

  // Load on mount - check chrome.storage.local first, then migrate from localStorage if needed
  useEffect(() =>
  {
    let mounted = true;

    chrome.storage.local.get(key).then(result =>
    {
      if (!mounted) return;

      if (result[key] !== undefined)
      {
        // Value exists in chrome.storage.local, use it
        try
        {
          setValue(parseRef.current(result[key]));
        }
        catch
        {
          setValue(initialValueRef.current);
        }
      }
      else
      {
        // Check localStorage for migration
        const localValue = localStorage.getItem(key);
        if (localValue !== null)
        {
          // Migrate: read from localStorage, write to chrome.storage.local, delete old key
          try
          {
            const parsed = parseRef.current(localValue);
            setValue(parsed);
            chrome.storage.local.set({ [key]: localValue }).catch(error =>
            {
              if (import.meta.env.DEV)
              {
                console.error(`useChromeLocalStorage: Failed to migrate "${key}":`, error);
              }
            });
            localStorage.removeItem(key);
            if (import.meta.env.DEV)
            {
              console.log(`Migrated ${key} from localStorage to chrome.storage.local`);
            }
          }
          catch
          {
            setValue(initialValueRef.current);
          }
        }
        // else: no value anywhere, keep initialValue
      }
    }).catch(error =>
    {
      if (import.meta.env.DEV)
      {
        console.error(`useChromeLocalStorage: Failed to get "${key}":`, error);
      }
      // Keep initialValue on error (already the default state)
    });

    return () => { mounted = false; };
  }, [key]);

  // Listen for changes from other windows (and this window)
  useEffect(() =>
  {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) =>
    {
      if (areaName !== 'local') return;
      if (changes[key] && changes[key].newValue !== undefined)
      {
        try
        {
          setValue(parseRef.current(changes[key].newValue));
        }
        catch
        {
          // Ignore parse errors from external changes
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  // Setter - updates both local state and chrome.storage.local
  const setStoredValue = useCallback((newValue: T) =>
  {
    setValue(newValue);
    chrome.storage.local.set({ [key]: serializeRef.current(newValue) }).catch(error =>
    {
      if (import.meta.env.DEV)
      {
        console.error(`useChromeLocalStorage: Failed to set "${key}":`, error);
      }
    });
  }, [key]);

  return [value, setStoredValue];
}
