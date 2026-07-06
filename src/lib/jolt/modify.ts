// Operações "modify-overwrite-beta" e "modify-default-beta" com as funções mais comuns.

import { Json, JoltError, isPlainObject, deepCopy, starToRegex, lookupPath } from './common';

interface ModifyLevel {
  key: string;
  value: Json | undefined;
}

function levelValue(walked: ModifyLevel[], n: number): Json | undefined {
  const idx = walked.length - 1 - n;
  if (idx < 0) throw new JoltError(`Referência @(${n},...) aponta acima da raiz`);
  return walked[idx].value;
}

/** Resolve referências `&`, `&n`, `&(n)` num caminho de modify (n=0 → chave atual). */
function resolveAmpInPath(path: string, walked: ModifyLevel[]): string {
  if (!path.includes('&')) return path;
  return path.replace(/&(?:\((\d+)\)|(\d+))?/g, (_m, pN, bareN) => {
    const n = pN !== undefined ? parseInt(pN, 10) : bareN !== undefined ? parseInt(bareN, 10) : 0;
    const idx = walked.length - 1 - n;
    if (idx < 0) throw new JoltError(`Referência &(${n}) aponta acima da raiz`);
    return walked[idx].key;
  });
}

/** Divide argumentos por vírgula no nível 0 (respeitando parênteses e aspas simples). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (const ch of s) {
    if (inStr) {
      cur += ch;
      if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") {
      inStr = true;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function parseArg(arg: string, walked: ModifyLevel[]): Json | undefined {
  if (arg.startsWith('@')) {
    const m = arg.match(/^@\((\d+)(?:\s*,\s*(.+?)\s*)?\)$/);
    if (m) {
      return lookupPath(levelValue(walked, parseInt(m[1], 10)), resolveAmpInPath(m[2] ?? '', walked)) as
        | Json
        | undefined;
    }
    return lookupPath(levelValue(walked, 0), resolveAmpInPath(arg.slice(1), walked)) as Json | undefined;
  }
  if (arg.startsWith("'") && arg.endsWith("'")) return arg.slice(1, -1);
  if (arg === 'true') return true;
  if (arg === 'false') return false;
  if (arg === 'null') return null;
  const n = Number(arg);
  if (!Number.isNaN(n) && arg.trim() !== '') return n;
  return arg;
}

/**
 * Emula o tipo Double do Java para funções que retornam double no Jolt:
 * em concatenações, 95000 vira "95000.0" (Double.toString), como no Jolt real.
 * Serializa como número e é normalizado para número puro ao fim da operação.
 */
class JavaDouble {
  constructor(readonly n: number) {}
  valueOf(): number {
    return this.n;
  }
  toString(): string {
    return Number.isInteger(this.n) ? `${this.n}.0` : String(this.n);
  }
  toJSON(): number {
    return this.n;
  }
}

const jdouble = (n: number | undefined): Json | undefined =>
  n === undefined || Number.isNaN(n) ? undefined : (new JavaDouble(n) as unknown as Json);

const asArray = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);
const nums = (vs: (Json | undefined)[]): number[] =>
  vs.flatMap((v) => (Array.isArray(v) ? v : [v])).map(Number).filter((n) => !Number.isNaN(n));

type Fn = (args: (Json | undefined)[]) => Json | undefined;

const FUNCTIONS: Record<string, Fn> = {
  toString: (a: (Json | undefined)[]) =>
    a[0] === undefined
      ? undefined
      : typeof a[0] === 'string'
        ? a[0]
        : a[0] instanceof JavaDouble
          ? a[0].toString()
          : JSON.stringify(a[0]),
  toInteger: (a) => {
    const n = parseInt(String(a[0]), 10);
    return Number.isNaN(n) ? undefined : n;
  },
  toLong: (a: (Json | undefined)[]) => FUNCTIONS.toInteger(a),
  toDouble: (a) => jdouble(parseFloat(String(a[0]))),
  toBoolean: (a) => {
    if (typeof a[0] === 'boolean') return a[0];
    if (a[0] === 'true') return true;
    if (a[0] === 'false') return false;
    return undefined;
  },
  toUpperCase: (a) => (typeof a[0] === 'string' ? a[0].toUpperCase() : undefined),
  toLowerCase: (a) => (typeof a[0] === 'string' ? a[0].toLowerCase() : undefined),
  // Nomes oficiais do Jolt (toUpper/toLower); os acima ficam como aliases
  toUpper: (a) => FUNCTIONS.toUpperCase(a),
  toLower: (a) => FUNCTIONS.toLowerCase(a),
  trim: (a) => (typeof a[0] === 'string' ? a[0].trim() : undefined),
  leftPad: (a) => {
    const [str, size, pad] = a;
    if (typeof str !== 'string') return undefined;
    return str.padStart(Number(size), pad === undefined ? ' ' : String(pad));
  },
  rightPad: (a) => {
    const [str, size, pad] = a;
    if (typeof str !== 'string') return undefined;
    return str.padEnd(Number(size), pad === undefined ? ' ' : String(pad));
  },
  concat: (a) => a.filter((v) => v !== undefined && v !== null).map(String).join(''),
  join: (a) => {
    const [sep, arr] = a;
    return asArray(arr)
      .filter((v) => v !== undefined && v !== null)
      .map(String)
      .join(String(sep));
  },
  split: (a) => {
    const [sep, str] = a;
    if (typeof str !== 'string') return undefined;
    const parts = str.split(new RegExp(String(sep)));
    // Semântica do String.split do Java (limit = 0): strings vazias no final são descartadas
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  },
  substring: (a) => {
    const [str, from, to] = a;
    if (typeof str !== 'string') return undefined;
    return str.substring(Number(from), to === undefined ? undefined : Number(to));
  },
  size: (a) => {
    const v = a[0];
    if (typeof v === 'string') return v.length;
    if (Array.isArray(v)) return v.length;
    if (isPlainObject(v)) return Object.keys(v).length;
    return undefined;
  },
  firstElement: (a) => asArray(a[0])[0],
  lastElement: (a) => {
    const arr = asArray(a[0]);
    return arr[arr.length - 1];
  },
  elementAt: (a) => {
    // aceita (array, idx) ou (idx) com valor atual implícito
    if (a.length >= 2 && Array.isArray(a[0])) return a[0][Number(a[1])];
    if (a.length >= 2 && Array.isArray(a[1])) return a[1][Number(a[0])];
    return undefined;
  },
  min: (a) => {
    const ns = nums(a);
    return ns.length ? Math.min(...ns) : undefined;
  },
  max: (a) => {
    const ns = nums(a);
    return ns.length ? Math.max(...ns) : undefined;
  },
  abs: (a) => {
    const n = Number(a[0]);
    return Number.isNaN(n) ? undefined : Math.abs(n);
  },
  avg: (a) => {
    const ns = nums(a);
    return ns.length ? jdouble(ns.reduce((x, y) => x + y, 0) / ns.length) : undefined;
  },
  sum: (a) => {
    const ns = nums(a);
    return ns.length ? ns.reduce((x, y) => x + y, 0) : undefined;
  },
  intSum: (a) => {
    const s = FUNCTIONS.sum(a);
    return s === undefined ? undefined : Math.trunc(Number(s));
  },
  doubleSum: (a) => jdouble(Number(FUNCTIONS.sum(a))),
  doubleSubtract: (a) => {
    const [x, y] = nums(a);
    return x === undefined || y === undefined ? undefined : jdouble(x - y);
  },
  divide: (a) => {
    const [x, y] = nums(a);
    return y ? jdouble(x / y) : undefined;
  },
  // divideAndRound(casasDecimais, numerador, denominador) — como no Jolt oficial.
  // Argumentos posicionais: ausência de qualquer um deles anula o resultado.
  divideAndRound: (a) => {
    const digits = Number(a[0]);
    const x = a[1] === undefined || a[1] === null ? NaN : Number(a[1]);
    const y = a[2] === undefined || a[2] === null ? NaN : Number(a[2]);
    if (Number.isNaN(digits) || Number.isNaN(x) || Number.isNaN(y) || y === 0) return undefined;
    const factor = Math.pow(10, Math.trunc(digits));
    return jdouble(Math.round((x / y) * factor) / factor);
  },
  intSubtract: (a) => {
    const [x, y] = nums(a);
    return x === undefined || y === undefined ? undefined : Math.trunc(x - y);
  },
  longSubtract: (a) => FUNCTIONS.intSubtract(a),
  longSum: (a) => FUNCTIONS.intSum(a),
  toList: (a) => (Array.isArray(a[0]) ? a[0] : a[0] === undefined ? undefined : [a[0]]),
  sort: (a) => {
    const arr = asArray(a[0]);
    return [...arr].sort((x, y) => {
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y));
    });
  },
  squashNulls: (a) => {
    const v = a[0];
    if (Array.isArray(v)) return v.filter((x) => x !== null);
    if (isPlainObject(v)) {
      const out: Record<string, Json> = {};
      for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = val;
      return out;
    }
    return v;
  },
  recompose: (a) => a[0],
  defaultValue: (a) => a.find((v) => v !== undefined && v !== null),
};

/** Avalia um RHS de modify (string `=fn(...)`, `@ref`, literal, ou lista de fallbacks). */
function evalRhs(rhs: Json, current: Json | undefined, walked: ModifyLevel[]): Json | undefined {
  if (Array.isArray(rhs)) {
    for (const candidate of rhs) {
      const v = evalRhs(candidate, current, walked);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  if (typeof rhs !== 'string') return rhs;
  if (rhs.startsWith('=')) {
    const m = rhs.match(/^=(\w+)(?:\((.*)\))?$/s);
    if (!m) throw new JoltError(`Expressão de função inválida: "${rhs}"`);
    const [, name, argStr] = m;
    const fn = FUNCTIONS[name];
    if (!fn) {
      throw new JoltError(`Função "=${name}" não suportada. Disponíveis: ${Object.keys(FUNCTIONS).map((f) => '=' + f).join(', ')}`);
    }
    const args = argStr === undefined || argStr.trim() === ''
      ? [current]
      : splitArgs(argStr).map((a) => parseArg(a, walked));
    return fn(args);
  }
  if (rhs.startsWith('@')) {
    const m = rhs.match(/^@\((\d+)(?:\s*,\s*(.+?)\s*)?\)$/);
    if (m) {
      return lookupPath(levelValue(walked, parseInt(m[1], 10)), resolveAmpInPath(m[2] ?? '', walked)) as
        | Json
        | undefined;
    }
    return lookupPath(levelValue(walked, 0), resolveAmpInPath(rhs.slice(1), walked)) as Json | undefined;
  }
  return rhs;
}

function modifyWalk(spec: Record<string, Json>, target: Json, walked: ModifyLevel[], overwrite: boolean): void {
  const isArr = Array.isArray(target);
  const isObj = isPlainObject(target);
  if (!isArr && !isObj) return;

  for (const [specKey, specVal] of Object.entries(spec)) {
    let keys: string[];
    if (specKey === '*') {
      keys = isArr ? (target as Json[]).map((_v, i) => String(i)) : Object.keys(target as Record<string, Json>);
    } else if (specKey.includes('|')) {
      keys = specKey.split('|').map((s) => s.trim());
    } else if (specKey.includes('*')) {
      const re = starToRegex(specKey);
      keys = (isArr ? (target as Json[]).map((_v, i) => String(i)) : Object.keys(target as Record<string, Json>)).filter((k) => re.test(k));
    } else {
      keys = [specKey];
    }

    for (const key of keys) {
      const idx = isArr ? parseInt(key, 10) : -1;
      if (isArr && Number.isNaN(idx)) continue;
      const cur: Json | undefined = isArr ? (target as Json[])[idx] : (target as Record<string, Json>)[key];
      const set = (v: Json) => {
        if (isArr) (target as Json[])[idx] = v;
        else (target as Record<string, Json>)[key] = v;
      };

      if (isPlainObject(specVal)) {
        let container = cur;
        if (container === undefined || container === null) {
          // Chaves literais com spec aninhada criam o contêiner ausente (como no Jolt)
          const isLiteral = specKey !== '*' && !specKey.includes('*') && !specKey.includes('|');
          if (!isLiteral) continue;
          const specKeys = Object.keys(specVal);
          const allNumeric = specKeys.length > 0 && specKeys.every((k) => /^\d+$/.test(k));
          container = allNumeric ? [] : {};
          set(container);
        }
        if (container !== null && typeof container === 'object') {
          modifyWalk(specVal, container, [...walked, { key, value: container }], overwrite);
        }
      } else {
        if (!overwrite && cur !== undefined && cur !== null) continue;
        const v = evalRhs(specVal, cur, [...walked, { key, value: cur }]);
        if (v !== undefined) set(v);
      }
    }
  }
}

export function applyModify(spec: Json, input: Json, overwrite: boolean): Json {
  if (!isPlainObject(spec)) throw new JoltError('A spec de "modify" deve ser um objeto');
  const out = deepCopy(input);
  modifyWalk(spec, out, [{ key: 'root', value: out }], overwrite);
  // Normaliza os JavaDouble em números puros (toJSON) — o efeito de Double só vale
  // dentro da operação (ex.: concat na mesma spec), como uma passagem por JSON no Jolt
  return deepCopy(out);
}
