import { useEffect, useRef, useState } from 'react';

const PREFIX = 'jsontools:';

export function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage cheio ou indisponível — segue sem persistir
  }
}

/** useState que sobrevive a reloads via localStorage (gravação com debounce). */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => loadPersisted(key, initial));
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => savePersisted(key, value), 250);
    return () => clearTimeout(timer.current);
  }, [key, value]);

  return [value, setValue];
}
