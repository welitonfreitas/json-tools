import { useMemo } from 'react';
import JsonEditor from '../components/JsonEditor';
import { usePersistentState, loadPersisted } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { DEFAULT_TAB_ID } from '../components/Tabs';

const SAMPLE_A = `{ "nome": "Ana", "idade": 30, "cidade": "SP", "tags": ["a", "b"] }`;
const SAMPLE_B = `{ "nome": "Ana", "idade": 31, "pais": "BR", "tags": ["a", "c", "d"] }`;

type DiffKind = 'added' | 'removed' | 'changed';

interface DiffEntry {
  path: string;
  kind: DiffKind;
  a?: unknown;
  b?: unknown;
}

function diff(a: unknown, b: unknown, path = '$', out: DiffEntry[] = []): DiffEntry[] {
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
    else diff(aRec[k], bRec[k], childPath, out);
  }
  return out;
}

const KIND_LABEL: Record<DiffKind, string> = { added: 'adicionado', removed: 'removido', changed: 'alterado' };

const fmt = (v: unknown) => {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > 120 ? s.slice(0, 117) + '…' : s;
};

export default function DiffTool({ tabId }: { tabId: string }) {
  const isFirst = tabId === DEFAULT_TAB_ID;
  const [textA, setTextA] = usePersistentState(`diff:${tabId}:a`, isFirst ? loadPersisted('diff:a', '') : '');
  const [textB, setTextB] = usePersistentState(`diff:${tabId}:b`, isFirst ? loadPersisted('diff:b', '') : '');

  const parsedA = useMemo(() => tryParseJson(textA), [textA]);
  const parsedB = useMemo(() => tryParseJson(textB), [textB]);
  const entries = useMemo(
    () => (parsedA.ok && parsedB.ok ? diff(parsedA.value, parsedB.value) : null),
    [parsedA, parsedB],
  );

  const counts = useMemo(() => {
    if (!entries) return null;
    return {
      added: entries.filter((e) => e.kind === 'added').length,
      removed: entries.filter((e) => e.kind === 'removed').length,
      changed: entries.filter((e) => e.kind === 'changed').length,
    };
  }, [entries]);

  return (
    <div className="tool">
      <div className="toolbar">
        <button
          className="btn"
          onClick={() => {
            setTextA(SAMPLE_A);
            setTextB(SAMPLE_B);
          }}
        >
          Exemplo
        </button>
        <button
          className="btn"
          onClick={() => {
            setTextA(textB);
            setTextB(textA);
          }}
          title="Inverter A e B"
        >
          ⇄ Inverter
        </button>
        <span className="toolbar-spacer" />
        {counts && (
          <span className="hint">
            <span className="diff-count diff-added">+{counts.added}</span>{' '}
            <span className="diff-count diff-removed">−{counts.removed}</span>{' '}
            <span className="diff-count diff-changed">~{counts.changed}</span>
          </span>
        )}
      </div>

      <div className="split">
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">A (original)</span>
            <span className="pane-note">{textA !== '' && !parsedA.ok ? '✗ inválido' : ''}</span>
          </div>
          <div className="editor-fill">
            <JsonEditor value={textA} onChange={setTextA} placeholder="JSON A…" />
          </div>
        </div>
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">B (novo)</span>
            <span className="pane-note">{textB !== '' && !parsedB.ok ? '✗ inválido' : ''}</span>
          </div>
          <div className="editor-fill">
            <JsonEditor value={textB} onChange={setTextB} placeholder="JSON B…" />
          </div>
        </div>
      </div>

      <div className="diff-results">
        {entries === null ? (
          <div className="placeholder">Cole dois JSONs válidos para comparar.</div>
        ) : entries.length === 0 ? (
          <div className="placeholder">✓ Os documentos são estruturalmente idênticos.</div>
        ) : (
          <table className="diff-table">
            <thead>
              <tr>
                <th>Caminho</th>
                <th>Tipo</th>
                <th>A</th>
                <th>B</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className={`diff-row diff-${e.kind}`}>
                  <td className="mono">{e.path}</td>
                  <td>{KIND_LABEL[e.kind]}</td>
                  <td className="mono">{e.kind === 'added' ? '—' : fmt(e.a)}</td>
                  <td className="mono">{e.kind === 'removed' ? '—' : fmt(e.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
