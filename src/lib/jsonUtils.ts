export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string; line?: number; column?: number };

/** Faz parse de JSON com localização amigável do erro (linha/coluna). */
export function tryParseJson(text: string): ParseResult {
  if (text.trim() === '') return { ok: false, error: 'Entrada vazia' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const posMatch = msg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const column = pos - before.lastIndexOf('\n');
      return { ok: false, error: msg, line, column };
    }
    const lineMatch = msg.match(/line (\d+) column (\d+)/);
    if (lineMatch) {
      return { ok: false, error: msg, line: parseInt(lineMatch[1], 10), column: parseInt(lineMatch[2], 10) };
    }
    return { ok: false, error: msg };
  }
}

/** Ordena as chaves de objetos recursivamente. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export interface JsonStats {
  bytes: number;
  lines: number;
  nodes: number;
  maxDepth: number;
  keys: number;
  arrays: number;
  objects: number;
}

export function computeStats(text: string, value: unknown): JsonStats {
  let nodes = 0;
  let keys = 0;
  let arrays = 0;
  let objects = 0;
  let maxDepth = 0;
  const visit = (v: unknown, depth: number): void => {
    nodes++;
    if (depth > maxDepth) maxDepth = depth;
    if (Array.isArray(v)) {
      arrays++;
      for (const item of v) visit(item, depth + 1);
    } else if (v !== null && typeof v === 'object') {
      objects++;
      const entries = Object.entries(v as Record<string, unknown>);
      keys += entries.length;
      for (const [, item] of entries) visit(item, depth + 1);
    }
  };
  visit(value, 1);
  return {
    bytes: new TextEncoder().encode(text).length,
    lines: text === '' ? 0 : text.split('\n').length,
    nodes,
    maxDepth,
    keys,
    arrays,
    objects,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Escapa o texto como conteúdo de string JSON (sem as aspas externas). */
export function escapeJsonString(text: string): string {
  const quoted = JSON.stringify(text);
  return quoted.slice(1, -1);
}

/** Desfaz o escape de uma string JSON. Aceita com ou sem aspas externas. */
export function unescapeJsonString(text: string): string {
  const trimmed = text.trim();
  const candidate =
    trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2 ? trimmed : `"${text}"`;
  const parsed = JSON.parse(candidate);
  if (typeof parsed !== 'string') throw new Error('O conteúdo não é uma string JSON');
  return parsed;
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
