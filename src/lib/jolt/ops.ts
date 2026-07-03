// Operações Jolt: default, remove, sort e cardinality.

import { Json, JoltError, isPlainObject, deepCopy, starToRegex } from './common';

// ---------------------------------------------------------------- defaultr

function inferContainer(spec: Record<string, Json>): Json {
  const keys = Object.keys(spec).filter((k) => k !== '*');
  const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
  return allNumeric ? [] : {};
}

function defaultWalk(spec: Record<string, Json>, target: Json): void {
  const isArr = Array.isArray(target);
  const isObj = isPlainObject(target);
  if (!isArr && !isObj) return;

  for (const [specKey, specVal] of Object.entries(spec)) {
    const keys: string[] = [];
    if (specKey === '*') {
      if (isArr) keys.push(...(target as Json[]).map((_v, i) => String(i)));
      else keys.push(...Object.keys(target as Record<string, Json>));
    } else if (specKey.includes('|')) {
      keys.push(...specKey.split('|').map((s) => s.trim()));
    } else {
      keys.push(specKey);
    }

    for (const key of keys) {
      const idx = isArr ? parseInt(key, 10) : -1;
      if (isArr && Number.isNaN(idx)) continue;
      const existing: Json | undefined = isArr ? (target as Json[])[idx] : (target as Record<string, Json>)[key];

      if (isPlainObject(specVal)) {
        let container = existing;
        if (container === undefined || container === null) {
          if (specKey === '*') continue; // '*' só se aplica a chaves existentes
          container = inferContainer(specVal);
          if (isArr) (target as Json[])[idx] = container;
          else (target as Record<string, Json>)[key] = container;
        }
        defaultWalk(specVal, container);
      } else if (existing === undefined) {
        if (specKey === '*') continue;
        if (isArr) (target as Json[])[idx] = deepCopy(specVal);
        else (target as Record<string, Json>)[key] = deepCopy(specVal);
      }
    }
  }
}

export function applyDefault(spec: Json, input: Json): Json {
  if (!isPlainObject(spec)) throw new JoltError('A spec de "default" deve ser um objeto');
  let out: Json = deepCopy(input);
  if (out === null || typeof out !== 'object') out = inferContainer(spec);
  defaultWalk(spec, out);
  return out;
}

// ---------------------------------------------------------------- removr

function matchingKeys(specKey: string, target: Json): string[] {
  const all = Array.isArray(target)
    ? target.map((_v, i) => String(i))
    : isPlainObject(target)
      ? Object.keys(target)
      : [];
  if (specKey === '*') return all;
  if (specKey.includes('|')) {
    const alts = new Set(specKey.split('|').map((s) => s.trim()));
    return all.filter((k) => alts.has(k));
  }
  if (specKey.includes('*')) {
    const re = starToRegex(specKey);
    return all.filter((k) => re.test(k));
  }
  return all.filter((k) => k === specKey);
}

function removeWalk(spec: Record<string, Json>, target: Json): void {
  if (target === null || typeof target !== 'object') return;
  for (const [specKey, specVal] of Object.entries(spec)) {
    const keys = matchingKeys(specKey, target);
    if (isPlainObject(specVal)) {
      for (const k of keys) {
        const child = Array.isArray(target) ? target[parseInt(k, 10)] : (target as Record<string, Json>)[k];
        removeWalk(specVal, child);
      }
    } else {
      if (Array.isArray(target)) {
        const idxs = keys.map((k) => parseInt(k, 10)).sort((a, b) => b - a);
        for (const i of idxs) target.splice(i, 1);
      } else {
        for (const k of keys) delete (target as Record<string, Json>)[k];
      }
    }
  }
}

export function applyRemove(spec: Json, input: Json): Json {
  if (!isPlainObject(spec)) throw new JoltError('A spec de "remove" deve ser um objeto');
  const out = deepCopy(input);
  removeWalk(spec, out);
  return out;
}

// ---------------------------------------------------------------- sortr

export function applySort(input: Json): Json {
  if (Array.isArray(input)) return input.map(applySort);
  if (isPlainObject(input)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(input).sort()) out[k] = applySort(input[k]);
    return out;
  }
  return input;
}

// ---------------------------------------------------------------- cardinality

function cardinalityWalk(spec: Record<string, Json>, target: Json): void {
  if (target === null || typeof target !== 'object') return;
  for (const [specKey, specVal] of Object.entries(spec)) {
    const keys = matchingKeys(specKey, target);
    for (const k of keys) {
      const container = target as Record<string, Json> & Json[];
      const cur: Json | undefined = Array.isArray(target) ? target[parseInt(k, 10)] : container[k];
      const set = (v: Json) => {
        if (Array.isArray(target)) target[parseInt(k, 10)] = v;
        else container[k] = v;
      };
      if (specVal === 'ONE') {
        if (Array.isArray(cur)) set(cur.length > 0 ? cur[0] : null);
      } else if (specVal === 'MANY') {
        if (!Array.isArray(cur)) set(cur === undefined ? [] : [cur]);
      } else if (isPlainObject(specVal)) {
        cardinalityWalk(specVal, cur ?? null);
      } else {
        throw new JoltError(`Valor de cardinality deve ser "ONE", "MANY" ou objeto — recebido: ${JSON.stringify(specVal)}`);
      }
    }
  }
}

export function applyCardinality(spec: Json, input: Json): Json {
  if (!isPlainObject(spec)) throw new JoltError('A spec de "cardinality" deve ser um objeto');
  const out = deepCopy(input);
  cardinalityWalk(spec, out);
  return out;
}
