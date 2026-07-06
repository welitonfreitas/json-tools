import { useEffect, useMemo, useState } from 'react';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState, loadPersisted } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { joltTransformSteps, SUPPORTED_OPERATIONS } from '../lib/jolt';
import { DEFAULT_TAB_ID } from '../components/Tabs';
import DiffView from '../components/DiffView';

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
  },
  {
    "operation": "sort"
  }
]`;

export interface JoltHistoryEntry {
  id: string;
  ts: number;
  input: string;
  spec: string;
  ok: boolean;
  /** Saída final formatada (se ok) ou mensagem de erro. */
  result: string;
}

/** Um passo visualizável: a entrada original ou a saída de uma operação da cadeia. */
interface RunStep {
  /** Rótulo curto do chip: "Entrada" ou o nome da operação. */
  label: string;
  ok: boolean;
  /** JSON formatado (se ok) ou mensagem de erro. */
  text: string;
}

interface RunState {
  steps: RunStep[];
  ts: number;
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

/** Executa a cadeia e monta os passos visualizáveis (Entrada + uma saída por operação). */
function computeRun(input: string, spec: string): RunState {
  const ts = Date.now();
  const inputParsed = tryParseJson(input);
  if (!inputParsed.ok) {
    return { ts, steps: [{ label: 'Entrada', ok: false, text: `JSON de entrada inválido: ${inputParsed.error}` }] };
  }
  const steps: RunStep[] = [
    { label: 'Entrada', ok: true, text: JSON.stringify(inputParsed.value, null, 2) },
  ];
  const specParsed = tryParseJson(spec);
  if (!specParsed.ok) {
    steps.push({ label: 'spec', ok: false, text: `Spec inválida: ${specParsed.error}` });
    return { ts, steps };
  }
  try {
    for (const s of joltTransformSteps(specParsed.value, inputParsed.value)) {
      if (s.error !== undefined) {
        steps.push({ label: s.operation, ok: false, text: s.error });
      } else {
        steps.push({ label: s.operation, ok: true, text: JSON.stringify(s.output, null, 2) ?? 'null' });
      }
    }
  } catch (e) {
    steps.push({ label: 'spec', ok: false, text: e instanceof Error ? e.message : String(e) });
  }
  return { ts, steps };
}

/** Nome curto para o chip: "modify-overwrite-beta" → "modify-overwrite". */
const shortOp = (label: string) => label.replace(/-beta$/, '');

export default function JoltTool({ tabId }: { tabId: string }) {
  const isFirst = tabId === DEFAULT_TAB_ID;
  const [input, setInput] = usePersistentState(
    `jolt:${tabId}:input`,
    isFirst ? loadPersisted('jolt:input', SAMPLE_INPUT) : SAMPLE_INPUT,
  );
  const [spec, setSpec] = usePersistentState(
    `jolt:${tabId}:spec`,
    isFirst ? loadPersisted('jolt:spec', SAMPLE_SPEC) : SAMPLE_SPEC,
  );
  const [history, setHistory] = usePersistentState<JoltHistoryEntry[]>(
    `jolt:${tabId}:history`,
    isFirst ? loadPersisted<JoltHistoryEntry[]>('jolt:history', []) : [],
  );
  // Última execução (todos os passos), persistida para sobreviver a reloads
  const [run, setRun] = usePersistentState<RunState | null>(`jolt:${tabId}:run`, null);
  // Passo selecionado no navegador; null = último (resultado final)
  const [selected, setSelected] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // Painel maximizado em tela cheia dentro da ferramenta (Esc restaura)
  const [maximized, setMaximized] = useState<'input' | 'spec' | 'output' | 'history' | null>(null);
  // Modo de visualização do passo: JSON completo ou diff em relação ao passo anterior
  const [viewMode, setViewMode] = useState<'json' | 'diff'>('json');
  // Layout: 3 colunas (Entrada | Spec | Saída, histórico na barra) ou grade 2×2
  const [layout, setLayout] = usePersistentState<'columns' | 'grid'>('jolt:layout', 'columns');
  const [showHistory, setShowHistory] = useState(false);

  // Nova execução volta a seleção para o resultado final
  useEffect(() => {
    setSelected(null);
  }, [run?.ts]);

  const runChain = (recordHistory: boolean, inputText = input, specText = spec) => {
    const newRun = computeRun(inputText, specText);
    setRun(newRun);
    if (recordHistory) {
      const last = newRun.steps[newRun.steps.length - 1];
      const entry: JoltHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: newRun.ts,
        input: inputText,
        spec: specText,
        ok: last.ok,
        result: last.text,
      };
      setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
    }
  };

  const restore = (e: JoltHistoryEntry) => {
    setInput(e.input);
    setSpec(e.spec);
    // Reexecuta localmente para reconstruir os passos, sem poluir o histórico
    runChain(false, e.input, e.spec);
  };

  const steps = run?.steps ?? [];
  const lastIndex = steps.length - 1;
  const selectedIndex = selected === null ? lastIndex : Math.min(selected, lastIndex);
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;
  const finalOk = lastIndex >= 0 && steps[lastIndex].ok;

  const stepCaption =
    selectedStep === null
      ? ''
      : selectedIndex === 0
        ? 'Entrada original'
        : selectedIndex === lastIndex && selectedStep.ok
          ? `Resultado final (após ${lastIndex} ${lastIndex === 1 ? 'operação' : 'operações'})`
          : selectedStep.ok
            ? `Após a operação #${selectedIndex} (${selectedStep.label})`
            : `Falha na operação #${selectedIndex} (${selectedStep.label})`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runChain(true);
    }
    if (e.key === 'Escape' && maximized !== null) {
      setMaximized(null);
    }
  };

  const maxButton = (pane: 'input' | 'spec' | 'output' | 'history') => (
    <button
      className="btn btn-small btn-max"
      onClick={() => setMaximized(maximized === pane ? null : pane)}
      title={maximized === pane ? 'Restaurar layout (Esc)' : 'Maximizar este painel'}
    >
      {maximized === pane ? '🗗 Restaurar' : '⛶'}
    </button>
  );

  const visible = (pane: 'input' | 'spec' | 'output' | 'history') => maximized === null || maximized === pane;

  const inputValid = useMemo(() => tryParseJson(input).ok, [input]);
  const specValid = useMemo(() => tryParseJson(spec).ok, [spec]);

  const format = (text: string, set: (v: string) => void) => {
    const p = tryParseJson(text);
    if (p.ok) set(JSON.stringify(p.value, null, 2));
  };

  const historyList =
    history.length === 0 ? (
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
              <button
                className="btn btn-small"
                onClick={() => {
                  restore(e);
                  setShowHistory(false);
                }}
                title="Restaurar entrada e spec e reexecutar os passos desta execução"
              >
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
    );

  return (
    <div className="tool" onKeyDown={onKeyDown}>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => runChain(true)} title="Executar transformação (Ctrl+Enter)">
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
        {layout === 'columns' && (
          <span className="dropdown">
            <button
              className={`btn history-toggle ${showHistory ? 'btn-success' : ''}`}
              onClick={() => setShowHistory(!showHistory)}
              title="Histórico de execuções desta aba"
            >
              🕒 Histórico ({history.length})
            </button>
            {showHistory && (
              <>
                <div className="popover-backdrop" onClick={() => setShowHistory(false)} />
                <div className="history-popover">
                  <div className="popover-header">
                    <span className="pane-title">Histórico ({history.length})</span>
                    <button
                      className="btn btn-small btn-danger-ghost"
                      onClick={() => setHistory([])}
                      disabled={history.length === 0}
                    >
                      Limpar histórico
                    </button>
                  </div>
                  <div className="popover-body">{historyList}</div>
                </div>
              </>
            )}
          </span>
        )}
        <span className="toolbar-spacer" />
        <button
          className="btn btn-small"
          onClick={() => setLayout(layout === 'columns' ? 'grid' : 'columns')}
          title={layout === 'columns' ? 'Mudar para grade 2×2 (histórico como painel)' : 'Mudar para 3 colunas (histórico na barra)'}
        >
          {layout === 'columns' ? '⊞ Grade' : '⫴ Colunas'}
        </button>
        <span className="hint">Ctrl+Enter executa · clique numa operação para ver o resultado intermediário</span>
      </div>

      {showHelp && (
        <div className="help-box">
          <p>
            Implementação compatível com o <a href="https://github.com/bazaarvoice/jolt" target="_blank" rel="noreferrer">Jolt</a>,
            executada 100% no navegador. Operações suportadas: {SUPPORTED_OPERATIONS.map((op) => <code key={op}>{op}</code>)}.
          </p>
          <p>
            Após executar, use a linha do tempo acima da saída para inspecionar o resultado de cada operação da cadeia —
            do payload de entrada até o resultado final. A saída de cada operação é a entrada da seguinte.
          </p>
        </div>
      )}

      <div className={`jolt-grid ${layout === 'columns' ? 'jolt-cols' : ''} ${maximized !== null ? 'jolt-grid-max' : ''}`}>
        {visible('input') && (
          <div className="split-pane">
            <div className="pane-header">
              <span className="pane-title">Entrada</span>
              <button
                className="btn btn-small"
                onClick={() => format(input, setInput)}
                disabled={!inputValid}
                title={inputValid ? 'Formatar JSON (2 espaços)' : 'JSON inválido — corrija antes de formatar'}
              >
                Formatar
              </button>
              <button className="btn btn-small btn-danger-ghost" onClick={() => setInput('')} disabled={input === ''}>
                Limpar
              </button>
              {maxButton('input')}
            </div>
            <div className="editor-fill">
              <JsonEditor value={input} onChange={setInput} placeholder="JSON de entrada…" />
            </div>
          </div>
        )}

        {visible('spec') && (
          <div className="split-pane">
            <div className="pane-header">
              <span className="pane-title">Spec (cadeia de operações)</span>
              <button
                className="btn btn-small"
                onClick={() => format(spec, setSpec)}
                disabled={!specValid}
                title={specValid ? 'Formatar JSON (2 espaços)' : 'JSON inválido — corrija antes de formatar'}
              >
                Formatar
              </button>
              <button className="btn btn-small btn-danger-ghost" onClick={() => setSpec('')} disabled={spec === ''}>
                Limpar
              </button>
              {maxButton('spec')}
            </div>
            <div className="editor-fill">
              <JsonEditor value={spec} onChange={setSpec} placeholder='[{"operation": "shift", "spec": {…}}]' />
            </div>
          </div>
        )}

        {visible('output') && (
        <div className="split-pane jolt-output">
          <div className="pane-header">
            <span className="pane-title">Saída {stepCaption && <span className="step-caption">· {stepCaption}</span>}</span>
            {steps.length > 0 && (
              <span className="seg-toggle" role="group" aria-label="Modo de visualização">
                <button
                  className={`seg-option ${viewMode === 'json' ? 'seg-active' : ''}`}
                  onClick={() => setViewMode('json')}
                  title="Ver o payload completo do passo selecionado"
                >
                  JSON
                </button>
                <button
                  className={`seg-option ${viewMode === 'diff' ? 'seg-active' : ''}`}
                  onClick={() => setViewMode('diff')}
                  title="Ver somente o que a operação selecionada mudou (antes × depois)"
                >
                  Diff
                </button>
              </span>
            )}
            {selectedStep?.ok && <CopyButton small text={() => selectedStep.text} />}
            {maxButton('output')}
          </div>
          {steps.length > 0 && (
            <div className="step-bar" role="tablist" aria-label="Passos da transformação">
              {steps.map((s, i) => (
                <span key={i} className="step-item">
                  {i > 0 && <span className="step-arrow">→</span>}
                  <button
                    role="tab"
                    aria-selected={i === selectedIndex}
                    className={`step-chip ${i === selectedIndex ? 'step-active' : ''} ${s.ok ? '' : 'step-failed'} ${
                      i === lastIndex && s.ok ? 'step-final' : ''
                    }`}
                    onClick={() => setSelected(i === lastIndex ? null : i)}
                    title={
                      i === 0
                        ? 'Payload de entrada'
                        : s.ok
                          ? `Resultado após a operação #${i} (${s.label})`
                          : `Erro na operação #${i} (${s.label})`
                    }
                  >
                    {i === 0 ? s.label : <><span className="step-num">{i}</span>{shortOp(s.label)}</>}
                    {!s.ok && ' ✗'}
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={viewMode === 'diff' && selectedStep !== null ? 'pane-body' : 'editor-fill'}>
            {selectedStep === null ? (
              <div className="placeholder">Clique em ▶ Executar para rodar a cadeia e navegar pelos resultados de cada operação.</div>
            ) : !selectedStep.ok ? (
              <div className="placeholder placeholder-error jolt-error">✗ {selectedStep.text}</div>
            ) : viewMode === 'json' ? (
              <JsonEditor value={selectedStep.text} readOnly />
            ) : selectedIndex === 0 ? (
              <div className="placeholder">
                A Entrada é o ponto de partida — não há passo anterior para comparar. Selecione uma operação para ver o
                que ela mudou.
              </div>
            ) : !steps[selectedIndex - 1].ok ? (
              <div className="placeholder placeholder-error">O passo anterior falhou — não há payload para comparar.</div>
            ) : (
              <DiffView
                a={JSON.parse(steps[selectedIndex - 1].text)}
                b={JSON.parse(selectedStep.text)}
                labelA={selectedIndex === 1 ? 'Entrada' : `Após #${selectedIndex - 1} (${steps[selectedIndex - 1].label})`}
                labelB={`Após #${selectedIndex} (${selectedStep.label})`}
                emptyMessage={`A operação #${selectedIndex} (${selectedStep.label}) não alterou a estrutura do payload.`}
              />
            )}
          </div>
        </div>
        )}

        {layout === 'grid' && visible('history') && (
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Histórico ({history.length})</span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setHistory([])} disabled={history.length === 0}>
              Limpar histórico
            </button>
            {maxButton('history')}
          </div>
          <div className="pane-body">{historyList}</div>
        </div>
        )}
      </div>

      <div className={`statusbar ${steps.length === 0 ? '' : finalOk ? 'status-ok' : 'status-error'}`}>
        {steps.length === 0 ? (
          <span>Nenhuma execução ainda nesta aba</span>
        ) : finalOk ? (
          <>
            <span>✓ Cadeia executada: {lastIndex} {lastIndex === 1 ? 'operação' : 'operações'}</span>
            <span>{new Date(run!.ts).toLocaleString('pt-BR')}</span>
          </>
        ) : (
          <span>✗ Execução falhou no passo marcado com ✗ — os passos anteriores continuam navegáveis</span>
        )}
      </div>
    </div>
  );
}
