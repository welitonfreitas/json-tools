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

/** Remove todas as chaves persistidas com o prefixo dado (ex.: ao fechar uma aba). */
export function removePersistedByPrefix(prefix: string): void {
  try {
    const full = PREFIX + prefix;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(full)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    // localStorage indisponível — nada a limpar
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
