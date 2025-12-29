import { useState, useCallback } from 'react';

type Parser<T> = (value: string) => T;
type Serializer<T> = (value: T) => string;

export function useLocalStorage<T>(
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

  const [value, setValue] = useState<T>(() =>
  {
    const saved = localStorage.getItem(key);
    if (saved === null) return initialValue;
    try
    {
      return parse(saved);
    }
    catch
    {
      return initialValue;
    }
  });

  const setStoredValue = useCallback((newValue: T) =>
  {
    setValue(newValue);
    localStorage.setItem(key, serialize(newValue));
  }, [key, serialize]);

  return [value, setStoredValue];
}
