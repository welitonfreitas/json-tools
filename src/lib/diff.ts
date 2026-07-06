// Diff estrutural entre dois valores JSON — usado pela ferramenta Comparar
// e pelo modo Diff do navegador de passos do Jolt.

export type DiffKind = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  path: string;
  kind: DiffKind;
  a?: unknown;
  b?: unknown;
}

export function diffJson(a: unknown, b: unknown, path = '$', out: DiffEntry[] = []): DiffEntry[] {
  if (a === b) return out;
  const aIsObj = a !== null && typeof a === 'object';
  const bIsObj = b !== null && typeof b === 'object';
  if (!aIsObj || !bIsObj || Array.isArray(a) !== Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, kind: 'changed', a, b });
    return out;
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
  for (const k of keys) {
    const childPath = Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
    if (!(k in aRec)) out.push({ path: childPath, kind: 'added', b: bRec[k] });
    else if (!(k in bRec)) out.push({ path: childPath, kind: 'removed', a: aRec[k] });
    else diffJson(aRec[k], bRec[k], childPath, out);
  }
  return out;
}

export const DIFF_KIND_LABEL: Record<DiffKind, string> = {
  added: 'adicionado',
  removed: 'removido',
  changed: 'alterado',
};

export function diffCounts(entries: DiffEntry[]): { added: number; removed: number; changed: number } {
  return {
    added: entries.filter((e) => e.kind === 'added').length,
    removed: entries.filter((e) => e.kind === 'removed').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
  };
}

export function fmtDiffValue(v: unknown): string | undefined {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > 120 ? s.slice(0, 117) + '…' : s;
}
