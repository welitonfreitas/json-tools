import { useState } from 'react';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { joltTransform, SUPPORTED_OPERATIONS, Json } from '../lib/jolt';

const SAMPLE_INPUT = `{
  "rating": {
    "primary": { "value": 3 },
    "quality": { "value": 4, "max": 5 }
  }
}`;

const SAMPLE_SPEC = `[
  {
    "operation": "shift",
    "spec": {
      "rating": {
        "primary": { "value": "Rating" },
        "*": {
          "value": "SecondaryRatings.&1.Value",
          "max": "SecondaryRatings.&1.RangeMax"
        }
      }
    }
  },
  {
    "operation": "default",
    "spec": { "Range": 5 }
  }
]`;

export interface JoltHistoryEntry {
  id: string;
  ts: number;
  input: string;
  spec: string;
  ok: boolean;
  /** Saída formatada (se ok) ou mensagem de erro. */
  result: string;
}

const MAX_HISTORY = 50;

function entryTitle(e: JoltHistoryEntry): string {
  const p = tryParseJson(e.spec);
  if (p.ok && Array.isArray(p.value)) {
    const ops = (p.value as { operation?: string }[]).map((o) => o?.operation ?? '?');
    return ops.join(' → ');
  }
  return 'spec inválida';
}

export default function JoltTool() {
  const [input, setInput] = usePersistentState('jolt:input', SAMPLE_INPUT);
  const [spec, setSpec] = usePersistentState('jolt:spec', SAMPLE_SPEC);
  const [history, setHistory] = usePersistentState<JoltHistoryEntry[]>('jolt:history', []);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const execute = () => {
    const inputParsed = tryParseJson(input);
    const specParsed = tryParseJson(spec);
    let ok = false;
    let result: string;

    if (!inputParsed.ok) {
      result = `JSON de entrada inválido: ${inputParsed.error}`;
    } else if (!specParsed.ok) {
      result = `Spec inválida: ${specParsed.error}`;
    } else {
      try {
        const out = joltTransform(specParsed.value as Json, inputParsed.value as Json);
        result = JSON.stringify(out, null, 2) ?? 'null';
        ok = true;
      } catch (e) {
        result = e instanceof Error ? e.message : String(e);
      }
    }

    setOutput(ok ? result : '');
    setError(ok ? null : result);
    const entry: JoltHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      input,
      spec,
      ok,
      result,
    };
    setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
  };

  const restore = (e: JoltHistoryEntry) => {
    setInput(e.input);
    setSpec(e.spec);
    setOutput(e.ok ? e.result : '');
    setError(e.ok ? null : e.result);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      execute();
    }
  };

  return (
    <div className="tool" onKeyDown={onKeyDown}>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={execute} title="Executar transformação (Ctrl+Enter)">
          ▶ Executar
        </button>
        <button
          className="btn"
          onClick={() => {
            setInput(SAMPLE_INPUT);
            setSpec(SAMPLE_SPEC);
          }}
        >
          Exemplo
        </button>
        <button className="btn" onClick={() => setShowHelp(!showHelp)}>
          {showHelp ? 'Ocultar ajuda' : 'Ajuda'}
        </button>
        <span className="toolbar-spacer" />
        <span className="hint">Ctrl+Enter executa · histórico sobrevive a reloads</span>
      </div>

      {showHelp && (
        <div className="help-box">
          <p>
            Implementação compatível com o <a href="https://github.com/bazaarvoice/jolt" target="_blank" rel="noreferrer">Jolt</a>,
            executada 100% no navegador. Operações suportadas: {SUPPORTED_OPERATIONS.map((op) => <code key={op}>{op}</code>)}.
          </p>
          <p>
            Sintaxe de <code>shift</code>: chaves literais, <code>a|b</code>, <code>*</code>, padrões <code>foo*</code>,{' '}
            <code>&amp;</code>/<code>&amp;(n)</code>/<code>&amp;(n,k)</code>, <code>$</code>, <code>#literal</code>,{' '}
            <code>@(n,caminho)</code> e no destino <code>[]</code>, <code>[&amp;n]</code>, <code>[#n]</code>.{' '}
            Em <code>modify-*-beta</code>: funções como <code>=toInteger</code>, <code>=concat(@(1,a),'-',@(1,b))</code>,{' '}
            <code>=size</code>, <code>=sum</code>, <code>=join</code>, <code>=split</code> etc.
          </p>
        </div>
      )}

      <div className="jolt-grid">
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Entrada</span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setInput('')} disabled={input === ''}>
              Limpar
            </button>
          </div>
          <div className="editor-fill">
            <JsonEditor value={input} onChange={setInput} placeholder="JSON de entrada…" />
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Spec (cadeia de operações)</span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setSpec('')} disabled={spec === ''}>
              Limpar
            </button>
          </div>
          <div className="editor-fill">
            <JsonEditor value={spec} onChange={setSpec} placeholder='[{"operation": "shift", "spec": {…}}]' />
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Saída</span>
            <CopyButton small text={() => output} />
          </div>
          <div className="editor-fill">
            {error ? <div className="placeholder placeholder-error jolt-error">✗ {error}</div> : <JsonEditor value={output} readOnly placeholder="Clique em Executar…" />}
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Histórico ({history.length})</span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setHistory([])} disabled={history.length === 0}>
              Limpar histórico
            </button>
          </div>
          <div className="pane-body">
            {history.length === 0 ? (
              <div className="placeholder">As execuções ficam registradas aqui e sobrevivem a reloads da página.</div>
            ) : (
              <div className="history-list">
                {history.map((e) => (
                  <div key={e.id} className={`history-item ${e.ok ? '' : 'history-failed'}`}>
                    <div className="history-head">
                      <span className={`history-status ${e.ok ? 'ok' : 'fail'}`}>{e.ok ? '✓' : '✗'}</span>
                      <span className="history-title" title={entryTitle(e)}>
                        {entryTitle(e)}
                      </span>
                      <span className="history-time">
                        {new Date(e.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="history-actions">
                      <button className="btn btn-small" onClick={() => restore(e)} title="Restaurar entrada, spec e resultado desta execução">
                        Restaurar
                      </button>
                      {e.ok && <CopyButton small label="Copiar saída" text={e.result} />}
                      <button
                        className="btn btn-small btn-danger-ghost"
                        onClick={() => setHistory((h) => h.filter((x) => x.id !== e.id))}
                        title="Remover do histórico"
                      >
                        ✕
                      </button>
                    </div>
                    {!e.ok && <div className="history-error">{e.result}</div>}
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
