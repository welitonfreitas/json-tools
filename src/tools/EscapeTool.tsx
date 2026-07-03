import { useState } from 'react';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState } from '../lib/persist';
import { escapeJsonString, unescapeJsonString, tryParseJson } from '../lib/jsonUtils';

// JSON embutido como string escapada — funciona com "Desescapar" e "String → JSON"
const SAMPLE = escapeJsonString(JSON.stringify({ mensagem: 'Olá, "mundo"!\nSegunda linha', ok: true }));

export default function EscapeTool() {
  const [input, setInput] = usePersistentState('escape:input', '');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = (fn: () => string, description: string) => {
    try {
      setOutput(fn());
      setError(null);
      setInfo(description);
    } catch (e) {
      setOutput('');
      setInfo(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const escape = () => run(() => escapeJsonString(input), 'Texto escapado como conteúdo de string JSON');
  const escapeQuoted = () => run(() => JSON.stringify(input), 'Texto escapado com aspas externas (string JSON completa)');
  const unescape = () => run(() => unescapeJsonString(input), 'Escape desfeito');
  const stringifyJson = () =>
    run(() => {
      const p = tryParseJson(input);
      if (!p.ok) throw new Error(`A entrada não é um JSON válido: ${p.error}`);
      return JSON.stringify(JSON.stringify(p.value));
    }, 'JSON minificado e embrulhado como string JSON (útil para embutir em outro JSON)');
  const parseEmbedded = () =>
    run(() => {
      const unescaped = unescapeJsonString(input);
      const p = tryParseJson(unescaped);
      if (!p.ok) throw new Error(`O conteúdo desescapado não é um JSON válido: ${p.error}`);
      return JSON.stringify(p.value, null, 2);
    }, 'String desescapada e formatada como JSON');

  return (
    <div className="tool">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={escape} disabled={input === ''} title="Escapa aspas, quebras de linha etc. (sem aspas externas)">
          Escapar
        </button>
        <button className="btn" onClick={escapeQuoted} disabled={input === ''} title="Escapa e inclui as aspas externas">
          Escapar com aspas
        </button>
        <button className="btn btn-primary" onClick={unescape} disabled={input === ''} title="Desfaz \\n, \\t, \\u00e9 etc.">
          Desescapar
        </button>
        <span className="toolbar-sep" />
        <button className="btn" onClick={stringifyJson} disabled={input === ''} title="Transforma um JSON em uma string JSON escapada">
          JSON → string
        </button>
        <button className="btn" onClick={parseEmbedded} disabled={input === ''} title="Desescapa uma string que contém JSON e formata">
          String → JSON
        </button>
        <span className="toolbar-spacer" />
        <button className="btn" onClick={() => setInput(SAMPLE)}>Exemplo</button>
        <button
          className="btn"
          onClick={() => {
            setInput(output);
            setOutput('');
            setInfo(null);
          }}
          disabled={output === ''}
          title="Usa a saída como nova entrada"
        >
          ↑ Saída → entrada
        </button>
      </div>

      <div className="split">
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Entrada</span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => setInput('')} disabled={input === ''}>
              Limpar
            </button>
          </div>
          <div className="editor-fill">
            <JsonEditor value={input} onChange={setInput} plainText placeholder="Cole o texto ou JSON aqui…" />
          </div>
        </div>
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Saída</span>
            <CopyButton text={() => output} small />
          </div>
          <div className="editor-fill">
            <JsonEditor value={output} readOnly plainText placeholder="O resultado aparece aqui…" />
          </div>
        </div>
      </div>

      <div className={`statusbar ${error ? 'status-error' : info ? 'status-ok' : ''}`}>
        <span>{error ? `✗ ${error}` : info ? `✓ ${info}` : 'Escolha uma operação acima'}</span>
      </div>
    </div>
  );
}
