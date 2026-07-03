// Tipos e utilitários compartilhados pelo motor Jolt.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export class JoltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoltError';
  }
}

export function isPlainObject(v: unknown): v is Record<string, Json> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepCopy<T>(v: T): T {
  if (v === undefined) return v;
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Nível da caminhada pela entrada: chave visitada + grupos capturados por curingas. */
export interface WalkLevel {
  key: string;
  /** groups[0] = chave inteira; groups[k] = k-ésimo curinga capturado. */
  groups: string[];
  /** Valor da entrada neste nível (para lookups com `@`). */
  value: Json | undefined;
  /** Índice sequencial desta correspondência entre os irmãos (para `[#n]`). */
  matchIndex: number;
}

/** Resolve nível `n` acima do topo da pilha (n = 0 → topo). */
export function levelUp(walked: WalkLevel[], n: number): WalkLevel {
  const idx = walked.length - 1 - n;
  if (idx < 0) {
    throw new JoltError(`Referência a ${n} níveis acima, mas a caminhada só tem ${walked.length} níveis`);
  }
  return walked[idx];
}

/** Substitui referências `&`, `&n`, `&(n)`, `&(n,k)` num token pela chave/grupo capturado. */
export function resolveAmp(token: string, walked: WalkLevel[]): string {
  return token.replace(/&(?:\((\d+)(?:\s*,\s*(\d+))?\)|(\d+))?/g, (_m, pN, pK, bareN) => {
    const n = pN !== undefined ? parseInt(pN, 10) : bareN !== undefined ? parseInt(bareN, 10) : 0;
    const k = pK !== undefined ? parseInt(pK, 10) : 0;
    const level = levelUp(walked, n);
    const group = level.groups[k];
    if (group === undefined) {
      throw new JoltError(`Grupo &(${n},${k}) não existe (chave "${level.key}" tem ${level.groups.length} grupos)`);
    }
    return group;
  });
}

/** Navega `path` (notação com pontos) a partir de `value`. */
export function lookupPath(value: Json | undefined, path: string): Json | undefined {
  if (path === '') return value;
  let cur: Json | undefined = value;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = parseInt(seg, 10);
      cur = Number.isNaN(i) ? undefined : cur[i];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, Json>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Resolve um token `@`, `@(n)`, `@(n,path)` ou `@path` contra a pilha. */
export function resolveAt(token: string, walked: WalkLevel[]): Json | undefined {
  if (token === '@') return levelUp(walked, 0).value;
  const paren = token.match(/^@\((\d+)(?:\s*,\s*(.+?)\s*)?\)$/);
  if (paren) {
    const level = levelUp(walked, parseInt(paren[1], 10));
    return lookupPath(level.value, paren[2] ?? '');
  }
  // Forma abreviada @foo.bar → nível 0
  const short = token.match(/^@(.+)$/);
  if (short) return lookupPath(levelUp(walked, 0).value, short[1]);
  return undefined;
}

/** Converte um padrão com `*` em regex com grupos de captura. */
export function starToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '(.*)');
  return new RegExp(`^${escaped}$`);
}

/** Correspondência de uma chave de entrada contra uma chave de spec (LHS). */
export function matchKey(
  specKey: string,
  inputKey: string,
  walked: WalkLevel[],
): { matched: boolean; groups: string[] } {
  // Alternativas com |
  if (specKey.includes('|')) {
    for (const alt of specKey.split('|').map((s) => s.trim())) {
      const r = matchKey(alt, inputKey, walked);
      if (r.matched) return r;
    }
    return { matched: false, groups: [] };
  }
  // Referência & no LHS (resolvida contra os níveis já caminhados)
  if (specKey.includes('&')) {
    const resolved = resolveAmp(specKey, walked);
    return { matched: resolved === inputKey, groups: [inputKey] };
  }
  if (specKey === '*') return { matched: true, groups: [inputKey, inputKey] };
  if (specKey.includes('*')) {
    const m = inputKey.match(starToRegex(specKey));
    if (m) return { matched: true, groups: [inputKey, ...m.slice(1)] };
    return { matched: false, groups: [] };
  }
  return { matched: specKey === inputKey, groups: [inputKey] };
}

/** Ordena chaves de spec por especificidade: literais > & > padrões com * > "*". */
export function orderSpecKeys(keys: string[]): string[] {
  const score = (k: string): number => {
    if (k === '*') return 0;
    if (k.includes('*')) return 1 + k.replace(/\*/g, '').length / 1000;
    if (k.includes('&')) return 2;
    return 3;
  };
  return [...keys].sort((a, b) => score(b) - score(a));
}

/** Lista chaves de um contêiner (objeto ou array) como strings. */
export function containerKeys(v: Json): string[] {
  if (Array.isArray(v)) return v.map((_x, i) => String(i));
  if (isPlainObject(v)) return Object.keys(v);
  return [];
}

export function containerGet(v: Json, key: string): Json | undefined {
  if (Array.isArray(v)) return v[parseInt(key, 10)];
  if (isPlainObject(v)) return v[key];
  return undefined;
}
