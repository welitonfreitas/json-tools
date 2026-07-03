import { memo, useEffect, useMemo, useState } from 'react';
import { copyToClipboard } from '../lib/jsonUtils';

interface TreeProps {
  data: unknown;
  search: string;
  /** Sinal de expandir/recolher tudo: muda a cada clique. */
  expandSignal: { version: number; expand: boolean };
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function containsTerm(v: unknown, term: string): boolean {
  if (term === '') return false;
  const t = term.toLowerCase();
  const visit = (x: unknown): boolean => {
    if (x === null) return 'null'.includes(t);
    if (Array.isArray(x)) return x.some(visit);
    if (typeof x === 'object') {
      return Object.entries(x as Record<string, unknown>).some(([k, val]) => k.toLowerCase().includes(t) || visit(val));
    }
    return String(x).toLowerCase().includes(t);
  };
  return visit(v);
}

function highlight(text: string, term: string) {
  if (term === '') return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

interface NodeProps {
  name: string | null;
  value: unknown;
  path: string;
  depth: number;
  search: string;
  expandSignal: { version: number; expand: boolean };
}

const TreeNode = memo(function TreeNode({ name, value, path, depth, search, expandSignal }: NodeProps) {
  const kind = typeOf(value);
  const isContainer = kind === 'object' || kind === 'array';
  const [open, setOpen] = useState(depth < 2);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (expandSignal.version > 0) setOpen(expandSignal.expand);
  }, [expandSignal]);

  const matchesSelf =
    search !== '' &&
    ((name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (!isContainer && String(value).toLowerCase().includes(search.toLowerCase())));
  const matchesBelow = useMemo(
    () => (isContainer && search !== '' ? containsTerm(value, search) : false),
    [isContainer, value, search],
  );
  const effectiveOpen = open || (search !== '' && matchesBelow);

  const copy = async (what: 'path' | 'value') => {
    const text = what === 'path' ? path : isContainer ? JSON.stringify(value, null, 2) : String(value);
    if (await copyToClipboard(text)) {
      setFlash(what);
      setTimeout(() => setFlash(null), 1200);
    }
  };

  const entries: [string, unknown][] = useMemo(() => {
    if (kind === 'array') return (value as unknown[]).map((v, i) => [String(i), v]);
    if (kind === 'object') return Object.entries(value as Record<string, unknown>);
    return [];
  }, [kind, value]);

  const childPath = (key: string): string =>
    kind === 'array' ? `${path}[${key}]` : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}['${key.replace(/'/g, "\\'")}']`;

  return (
    <div className="tree-node" style={{ marginLeft: depth === 0 ? 0 : 16 }}>
      <div className={`tree-row ${matchesSelf ? 'tree-match' : ''}`}>
        {isContainer ? (
          <button className="tree-toggle" onClick={() => setOpen(!effectiveOpen)} aria-label={effectiveOpen ? 'Recolher' : 'Expandir'}>
            {effectiveOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-leaf">•</span>
        )}
        {name !== null && <span className="tree-key">{highlight(name, search)}:</span>}
        {isContainer ? (
          <span className="tree-preview" onClick={() => setOpen(!effectiveOpen)}>
            {kind === 'array' ? `[…] ${entries.length} ${entries.length === 1 ? 'item' : 'itens'}` : `{…} ${entries.length} ${entries.length === 1 ? 'chave' : 'chaves'}`}
          </span>
        ) : (
          <span className={`tree-value tree-${kind}`}>
            {kind === 'string' ? <>&quot;{highlight(String(value), search)}&quot;</> : highlight(String(value), search)}
          </span>
        )}
        <span className="tree-actions">
          <button className="tree-action" onClick={() => copy('path')} title={`Copiar caminho: ${path}`}>
            {flash === 'path' ? '✓' : 'caminho'}
          </button>
          <button className="tree-action" onClick={() => copy('value')} title="Copiar valor">
            {flash === 'value' ? '✓' : 'valor'}
          </button>
        </span>
      </div>
      {isContainer && effectiveOpen && (
        <div className="tree-children">
          {entries.map(([k, v]) => (
            <TreeNode key={k} name={k} value={v} path={childPath(k)} depth={depth + 1} search={search} expandSignal={expandSignal} />
          ))}
          {entries.length === 0 && <div className="tree-empty">(vazio)</div>}
        </div>
      )}
    </div>
  );
});

export default function TreeView({ data, search, expandSignal }: TreeProps) {
  return (
    <div className="tree-root">
      <TreeNode name={null} value={data} path="$" depth={0} search={search} expandSignal={expandSignal} />
    </div>
  );
}
