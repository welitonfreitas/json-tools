import { useMemo } from 'react';
import { JSONPath } from 'jsonpath-plus';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState, loadPersisted } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { DEFAULT_TAB_ID } from '../components/Tabs';

const SAMPLE = `{
  "loja": {
    "livros": [
      { "titulo": "Dom Casmurro", "autor": "Machado de Assis", "preco": 29.9 },
      { "titulo": "Grande Sertão", "autor": "Guimarães Rosa", "preco": 54.5 },
      { "titulo": "Vidas Secas", "autor": "Graciliano Ramos", "preco": 19.9 }
    ],
    "cidade": "São Paulo"
  }
}`;

const EXAMPLES = ['$.loja.livros[*].titulo', '$.loja.livros[?(@.preco < 30)]', '$..autor', '$.loja.livros[0]', '$..*'];

interface Match {
  path: string;
  pointer: string;
  value: unknown;
}

export default function JsonPathTool({ tabId }: { tabId: string }) {
  const isFirst = tabId === DEFAULT_TAB_ID;
  const [text, setText] = usePersistentState(
    `jsonpath:${tabId}:text`,
    isFirst ? loadPersisted('jsonpath:text', SAMPLE) : SAMPLE,
  );
  const [query, setQuery] = usePersistentState(
    `jsonpath:${tabId}:query`,
    isFirst ? loadPersisted('jsonpath:query', '$.loja.livros[*].titulo') : '$.loja.livros[*].titulo',
  );
  // Histórico de consultas é compartilhado entre as abas (expressões são reutilizáveis)
  const [history, setHistory] = usePersistentState<string[]>('jsonpath:history', []);

  const parsed = useMemo(() => tryParseJson(text), [text]);

  const result = useMemo((): { matches: Match[] } | { error: string } | null => {
    if (!parsed.ok || query.trim() === '') return null;
    try {
      const raw = JSONPath({ path: query, json: parsed.value as never, resultType: 'all', wrap: true }) as unknown as {
        path: string;
        pointer: string;
        value: unknown;
      }[];
      return { matches: raw.map((r) => ({ path: r.path, pointer: r.pointer, value: r.value })) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [parsed, query]);

  const rememberQuery = () => {
    const q = query.trim();
    if (q === '') return;
    setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 15));
  };

  return (
    <div className="tool">
      <div className="toolbar">
        <input
          className="input input-grow mono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={rememberQuery}
          onKeyDown={(e) => e.key === 'Enter' && rememberQuery()}
          placeholder="Expressão JSONPath, ex.: $.loja.livros[?(@.preco < 30)].titulo"
          spellCheck={false}
        />
      </div>
      <div className="chip-row">
        <span className="chip-label">Exemplos:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => setQuery(ex)}>
            {ex}
          </button>
        ))}
        {history.length > 0 && (
          <>
            <span className="chip-label">Recentes:</span>
            {history.slice(0, 5).map((h) => (
              <button key={h} className="chip chip-history" onClick={() => setQuery(h)} title={h}>
                {h.length > 40 ? h.slice(0, 37) + '…' : h}
              </button>
            ))}
            <button className="chip chip-clear" onClick={() => setHistory([])} title="Limpar histórico de consultas">
              ✕
            </button>
          </>
        )}
      </div>

      <div className="split">
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">JSON</span>
            <button className="btn btn-small" onClick={() => setText(SAMPLE)}>Exemplo</button>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setText('')} disabled={text === ''}>
              Limpar
            </button>
          </div>
          <div className="editor-fill">
            <JsonEditor value={text} onChange={setText} placeholder="Cole seu JSON aqui…" />
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">
              Resultados{result && 'matches' in result ? ` (${result.matches.length})` : ''}
            </span>
            {result && 'matches' in result && result.matches.length > 0 && (
              <CopyButton small label="Copiar tudo" text={() => JSON.stringify(result.matches.map((m) => m.value), null, 2)} />
            )}
          </div>
          <div className="pane-body">
            {!parsed.ok ? (
              <div className="placeholder">{text.trim() === '' ? 'Cole um JSON à esquerda.' : `JSON inválido: ${parsed.error}`}</div>
            ) : result === null ? (
              <div className="placeholder">Digite uma expressão JSONPath acima.</div>
            ) : 'error' in result ? (
              <div className="placeholder placeholder-error">Expressão inválida: {result.error}</div>
            ) : result.matches.length === 0 ? (
              <div className="placeholder">Nenhum resultado para esta expressão.</div>
            ) : (
              <div className="match-list">
                {result.matches.map((m, i) => (
                  <div className="match-item" key={i}>
                    <div className="match-path">
                      <code>{m.path}</code>
                      <CopyButton small label="caminho" text={m.path} title="Copiar caminho" />
                      <CopyButton
                        small
                        label="valor"
                        text={() => (typeof m.value === 'string' ? m.value : JSON.stringify(m.value, null, 2))}
                        title="Copiar valor"
                      />
                    </div>
                    <pre className="match-value">{JSON.stringify(m.value, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
