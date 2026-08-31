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

// ---------------------------------------------------------------- ordem de chaves
//
// O Jolt (Java) usa LinkedHashMap: a ordem de inserção das chaves é preservada.
// Objetos JS reordenam chaves inteiras ("81" aparece antes de "91" mesmo inserida
// depois), então registramos a ordem real de inserção à parte, num WeakMap.

const KEY_ORDER = new WeakMap<object, string[]>();

/** Define `obj[key] = value` registrando a ordem de inserção (LinkedHashMap). */
export function setObjKey(obj: Record<string, Json>, key: string, value: Json): void {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    let order = KEY_ORDER.get(obj);
    if (!order) {
      order = Object.keys(obj);
      KEY_ORDER.set(obj, order);
    }
    order.push(key);
  }
  obj[key] = value;
}

/** Substitui a ordem registrada de um objeto (ex.: sortr). */
export function setKeyOrder(obj: Record<string, Json>, order: string[]): void {
  KEY_ORDER.set(obj, [...order]);
}

/** Chaves do objeto na ordem de inserção registrada (fallback: Object.keys). */
export function objKeys(obj: Record<string, Json>): string[] {
  const order = KEY_ORDER.get(obj);
  if (!order) return Object.keys(obj);
  const own = new Set(Object.keys(obj));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of order) {
    if (own.has(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of own) if (!seen.has(k)) out.push(k);
  return out;
}

/**
 * Cópia profunda que preserva a ordem registrada das chaves e normaliza valores
 * com toJSON (ex.: JavaDouble → número), com a mesma semântica do round-trip por
 * JSON que existia antes: `undefined` em objeto some, em array vira null.
 */
export function deepCopy<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  return copyJson(v as unknown as Json) as unknown as T;
}

function copyJson(x: Json): Json {
  if (x === null || typeof x !== 'object') return x;
  const withToJson = x as { toJSON?: () => Json };
  if (typeof withToJson.toJSON === 'function') return withToJson.toJSON();
  if (Array.isArray(x)) {
    const out: Json[] = [];
    for (let i = 0; i < x.length; i++) {
      const el = x[i];
      out.push(el === undefined ? null : copyJson(el));
    }
    return out;
  }
  const src = x as Record<string, Json>;
  const out: Record<string, Json> = {};
  const order: string[] = [];
  for (const k of objKeys(src)) {
    const val = src[k];
    if (val === undefined) continue;
    out[k] = copyJson(val);
    order.push(k);
  }
  KEY_ORDER.set(out, order);
  return out;
}

/** JSON.stringify que respeita a ordem de chaves registrada (indentação de 2). */
export function joltStringify(v: Json | undefined, indent = 2): string {
  const pad = (n: number) => ' '.repeat(n * indent);
  const go = (x: Json | undefined, depth: number): string => {
    if (x === undefined || x === null) return 'null';
    if (typeof x !== 'object') return JSON.stringify(x) ?? 'null';
    const withToJson = x as { toJSON?: () => Json };
    if (typeof withToJson.toJSON === 'function') return go(withToJson.toJSON(), depth);
    if (Array.isArray(x)) {
      if (x.length === 0) return '[]';
      const items = Array.from({ length: x.length }, (_v, i) => pad(depth + 1) + go(x[i], depth + 1));
      return `[\n${items.join(',\n')}\n${pad(depth)}]`;
    }
    const obj = x as Record<string, Json>;
    const keys = objKeys(obj).filter((k) => obj[k] !== undefined);
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => `${pad(depth + 1)}${JSON.stringify(k)}: ${go(obj[k], depth + 1)}`);
    return `{\n${items.join(',\n')}\n${pad(depth)}}`;
  };
  return go(v, 0);
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

/** Navega `path` (notação com pontos e colchetes, ex.: `a.b[0].c`) a partir de `value`. */
export function lookupPath(value: Json | undefined, path: string): Json | undefined {
  if (path === '') return value;
  let cur: Json | undefined = value;
  for (const rawSeg of path.split('.')) {
    const m = rawSeg.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) return undefined;
    const parts: string[] = [];
    if (m[1] !== '') parts.push(m[1]);
    if (m[2]) for (const bm of m[2].matchAll(/\[(\d+)\]/g)) parts.push(bm[1]);
    for (const seg of parts) {
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
  }
  return cur;
}

/** Resolve um token `@`, `@(n)`, `@(n,path)` ou `@path` contra a pilha.
 *  O caminho pode conter referências `&` (resolvidas para as chaves visitadas). */
export function resolveAt(token: string, walked: WalkLevel[]): Json | undefined {
  if (token === '@') return levelUp(walked, 0).value;
  const resolvePath = (p: string): string => (p.includes('&') ? resolveAmp(p, walked) : p);
  // O caminho é literal (sem aparar espaços), como no Jolt
  const paren = token.match(/^@\((\d+)(?:,(.*))?\)$/s);
  if (paren) {
    const level = levelUp(walked, parseInt(paren[1], 10));
    return lookupPath(level.value, resolvePath(paren[2] ?? ''));
  }
  // Forma abreviada @foo.bar → nível 0
  const short = token.match(/^@(.+)$/);
  if (short) return lookupPath(levelUp(walked, 0).value, resolvePath(short[1]));
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

/** Lista chaves de um contêiner (objeto ou array) como strings, na ordem de inserção. */
export function containerKeys(v: Json): string[] {
  if (Array.isArray(v)) return v.map((_x, i) => String(i));
  if (isPlainObject(v)) return objKeys(v);
  return [];
}

export function containerGet(v: Json, key: string): Json | undefined {
  if (Array.isArray(v)) return v[parseInt(key, 10)];
  if (isPlainObject(v)) return v[key];
  return undefined;
}
