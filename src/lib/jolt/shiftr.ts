// Operação "shift": remapeia dados da entrada para novos caminhos na saída.
// Suporta: chaves literais, `a|b`, `*`, padrões `foo*`, `&`/`&(n)`/`&(n,k)` (LHS e RHS),
// `$`/`$(n)`/`$(n,k)`, `#literal`, `@`/`@(n,path)`, e no RHS `[]`, `[&n]`, `[#n]`, `[3]`.

import {
  Json,
  JoltError,
  WalkLevel,
  isPlainObject,
  deepCopy,
  levelUp,
  resolveAmp,
  resolveAt,
  matchKey,
  orderSpecKeys,
  containerKeys,
  containerGet,
} from './common';

type OutputHolder = { root: Json | undefined };

/** Contadores globais de correspondência por nó da spec (para `[#n]`). */
type MatchCounters = WeakMap<Record<string, Json>, Map<string, number>>;

function nextMatchIndex(counters: MatchCounters, specNode: Record<string, Json>, specKey: string): number {
  let map = counters.get(specNode);
  if (!map) {
    map = new Map();
    counters.set(specNode, map);
  }
  const count = map.get(specKey) ?? 0;
  map.set(specKey, count + 1);
  return count;
}

type PathStep =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number }
  | { type: 'append' };

/** Converte um caminho RHS (string) em passos, resolvendo &, # e @. */
function parseRhsPath(path: string, walked: WalkLevel[]): PathStep[] {
  const steps: PathStep[] = [];
  if (path === '') return steps;
  for (const rawSeg of path.split('.')) {
    const m = rawSeg.match(/^([^[\]]*)((?:\[[^\]]*\])*)$/);
    if (!m) throw new JoltError(`Segmento de caminho inválido no RHS: "${rawSeg}"`);
    const [, namePart, bracketPart] = m;
    if (namePart !== '') {
      let name: string;
      if (namePart.startsWith('@')) {
        const v = resolveAt(namePart, walked);
        name = v === undefined || v === null ? '' : String(v);
      } else {
        name = resolveAmp(namePart, walked);
      }
      steps.push({ type: 'key', key: name });
    }
    if (bracketPart) {
      for (const bm of bracketPart.matchAll(/\[([^\]]*)\]/g)) {
        const inner = bm[1].trim();
        if (inner === '') {
          steps.push({ type: 'append' });
        } else if (inner.startsWith('#')) {
          // [#n]: sobe n níveis a partir do nó que contém o RHS (n=1 → o próprio nó)
          const n = inner.length > 1 ? parseInt(inner.slice(1), 10) : 1;
          steps.push({ type: 'index', index: levelUp(walked, Math.max(0, n - 1)).matchIndex });
        } else if (inner.includes('&')) {
          const resolved = resolveAmp(inner, walked);
          const idx = parseInt(resolved, 10);
          if (Number.isNaN(idx)) throw new JoltError(`Índice de array não numérico: "[${inner}]" → "${resolved}"`);
          steps.push({ type: 'index', index: idx });
        } else {
          const idx = parseInt(inner, 10);
          if (Number.isNaN(idx)) throw new JoltError(`Índice de array inválido: "[${inner}]"`);
          steps.push({ type: 'index', index: idx });
        }
      }
    }
  }
  return steps;
}

/** Escreve `value` no holder seguindo os passos; valores repetidos viram array (semântica Jolt). */
function writeOutput(holder: OutputHolder, steps: PathStep[], value: Json): void {
  if (steps.length === 0) {
    if (holder.root === undefined) holder.root = deepCopy(value);
    else if (Array.isArray(holder.root)) holder.root.push(deepCopy(value));
    else holder.root = [holder.root, deepCopy(value)];
    return;
  }

  let parent: Json[] | Record<string, Json> | OutputHolder = holder;
  let parentKey: string | number = 'root';

  const getCur = (): Json | undefined =>
    Array.isArray(parent) ? parent[parentKey as number] : (parent as Record<string, Json>)[parentKey as string];
  const setCur = (v: Json): void => {
    if (Array.isArray(parent)) parent[parentKey as number] = v;
    else (parent as Record<string, Json>)[parentKey as string] = v;
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const isLast = i === steps.length - 1;
    let cur = getCur();

    const needArray = step.type !== 'key';
    if (cur === undefined || cur === null || typeof cur !== 'object' || Array.isArray(cur) !== needArray) {
      if (cur === undefined || cur === null || typeof cur !== 'object') {
        cur = needArray ? [] : {};
        setCur(cur);
      } else {
        // contêiner do tipo errado já existe — mantém e força coerção de chave
        if (needArray && isPlainObject(cur)) {
          // escreve índice como chave string em objeto existente
        } else if (!needArray && Array.isArray(cur)) {
          // escreve chave como índice se numérica, senão erro
        }
      }
    }

    let nextKey: string | number;
    if (step.type === 'key') {
      nextKey = step.key;
    } else if (step.type === 'index') {
      nextKey = step.index;
    } else {
      nextKey = Array.isArray(cur) ? (cur as Json[]).length : 0;
    }

    if (isLast) {
      const container = cur as Json[] | Record<string, Json>;
      const existing = Array.isArray(container)
        ? container[nextKey as number]
        : (container as Record<string, Json>)[String(nextKey)];
      const copied = deepCopy(value);
      if (existing === undefined) {
        if (Array.isArray(container)) container[nextKey as number] = copied;
        else (container as Record<string, Json>)[String(nextKey)] = copied;
      } else if (Array.isArray(existing)) {
        existing.push(copied);
      } else {
        const wrapped: Json = [existing, copied];
        if (Array.isArray(container)) container[nextKey as number] = wrapped;
        else (container as Record<string, Json>)[String(nextKey)] = wrapped;
      }
    } else {
      parent = cur as Json[] | Record<string, Json>;
      parentKey = nextKey;
    }
  }
}

/** Escreve em um ou mais caminhos RHS (string, array de strings ou null = descartar). */
function emit(holder: OutputHolder, rhs: Json, value: Json | undefined, walked: WalkLevel[]): void {
  if (value === undefined) return;
  if (rhs === null) return; // descarte explícito
  const paths = Array.isArray(rhs) ? rhs : [rhs];
  for (const p of paths) {
    if (typeof p !== 'string') {
      throw new JoltError(`RHS de shift deve ser string, array de strings ou null — recebido: ${JSON.stringify(p)}`);
    }
    writeOutput(holder, parseRhsPath(p, walked), value);
  }
}

function walk(
  spec: Record<string, Json>,
  input: Json | undefined,
  walked: WalkLevel[],
  holder: OutputHolder,
  counters: MatchCounters,
): void {
  const keys = Object.keys(spec);
  const current = walked[walked.length - 1];

  // 1) Chaves especiais, avaliadas independentemente das chaves da entrada.
  //    Cada uma empilha um pseudo-nível próprio para manter a contagem de [#n] e & uniforme.
  for (const specKey of keys) {
    const rhs = spec[specKey];
    if (specKey.startsWith('$')) {
      const m = specKey.match(/^\$(?:\((\d+)(?:\s*,\s*(\d+))?\))?$/);
      if (!m) throw new JoltError(`Chave "$" inválida: "${specKey}"`);
      const n = m[1] !== undefined ? parseInt(m[1], 10) : 0;
      const k = m[2] !== undefined ? parseInt(m[2], 10) : 0;
      const level = levelUp(walked, n);
      const value = level.groups[k] ?? level.key;
      const pseudo: WalkLevel = {
        key: current.key,
        groups: current.groups,
        value: current.value,
        matchIndex: nextMatchIndex(counters, spec, specKey),
      };
      emit(holder, rhs, value, [...walked, pseudo]);
    } else if (specKey.startsWith('#')) {
      const pseudo: WalkLevel = {
        key: current.key,
        groups: current.groups,
        value: current.value,
        matchIndex: nextMatchIndex(counters, spec, specKey),
      };
      emit(holder, rhs, specKey.slice(1), [...walked, pseudo]);
    } else if (specKey.startsWith('@')) {
      const v = resolveAt(specKey, walked);
      const pseudo: WalkLevel = {
        key: current.key,
        groups: current.groups,
        value: v,
        matchIndex: nextMatchIndex(counters, spec, specKey),
      };
      if (isPlainObject(rhs)) {
        walk(rhs, v, [...walked, pseudo], holder, counters);
      } else {
        emit(holder, rhs, v, [...walked, pseudo]);
      }
    }
  }

  // 2) Correspondência das chaves da entrada com as chaves da spec (a mais específica vence).
  //    Valores escalares são casados como se fossem chaves (idioma de filtro do Jolt,
  //    ex.: "ReserveType": { "01": {...} } casa o valor "01").
  if (input === null || input === undefined) return;
  const isScalar = typeof input !== 'object';
  const ordered = orderSpecKeys(keys.filter((k) => !/^[$#@]/.test(k)));
  const inputKeys = isScalar ? [String(input)] : containerKeys(input);

  for (const inputKey of inputKeys) {
    for (const specKey of ordered) {
      const { matched, groups } = matchKey(specKey, inputKey, walked);
      if (!matched) continue;
      const childValue = isScalar ? null : containerGet(input, inputKey);
      const level: WalkLevel = {
        key: inputKey,
        groups,
        value: childValue,
        matchIndex: nextMatchIndex(counters, spec, specKey),
      };
      const rhs = spec[specKey];
      if (isPlainObject(rhs)) {
        walk(rhs, childValue, [...walked, level], holder, counters);
      } else {
        emit(holder, rhs, childValue, [...walked, level]);
      }
      break; // apenas a spec mais específica se aplica a cada chave
    }
  }
}

export function applyShift(spec: Json, input: Json): Json {
  if (!isPlainObject(spec)) throw new JoltError('A spec de "shift" deve ser um objeto');
  const holder: OutputHolder = { root: undefined };
  const rootLevel: WalkLevel = { key: 'root', groups: ['root'], value: input, matchIndex: 0 };
  walk(spec, input, [rootLevel], holder, new WeakMap());
  return holder.root === undefined ? null : holder.root;
}
