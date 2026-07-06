import { useMemo } from 'react';
import JsonEditor from '../components/JsonEditor';
import { usePersistentState, loadPersisted } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { diffJson, diffCounts, DIFF_KIND_LABEL, fmtDiffValue } from '../lib/diff';
import { DEFAULT_TAB_ID } from '../components/Tabs';

const SAMPLE_A = `{ "nome": "Ana", "idade": 30, "cidade": "SP", "tags": ["a", "b"] }`;
const SAMPLE_B = `{ "nome": "Ana", "idade": 31, "pais": "BR", "tags": ["a", "c", "d"] }`;

export default function DiffTool({ tabId }: { tabId: string }) {
  const isFirst = tabId === DEFAULT_TAB_ID;
  const [textA, setTextA] = usePersistentState(`diff:${tabId}:a`, isFirst ? loadPersisted('diff:a', '') : '');
  const [textB, setTextB] = usePersistentState(`diff:${tabId}:b`, isFirst ? loadPersisted('diff:b', '') : '');

  const parsedA = useMemo(() => tryParseJson(textA), [textA]);
  const parsedB = useMemo(() => tryParseJson(textB), [textB]);
  const entries = useMemo(
    () => (parsedA.ok && parsedB.ok ? diffJson(parsedA.value, parsedB.value) : null),
    [parsedA, parsedB],
  );

  const counts = useMemo(() => (entries ? diffCounts(entries) : null), [entries]);

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
                  <td>{DIFF_KIND_LABEL[e.kind]}</td>
                  <td className="mono">{e.kind === 'added' ? '—' : fmtDiffValue(e.a)}</td>
                  <td className="mono">{e.kind === 'removed' ? '—' : fmtDiffValue(e.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
