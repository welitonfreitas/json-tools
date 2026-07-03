import { useMemo, useRef } from 'react';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState } from '../lib/persist';
import { tryParseJson, sortKeysDeep, computeStats, formatBytes, downloadText } from '../lib/jsonUtils';

const SAMPLE = `{
  "produto": "Notebook",
  "preco": 4599.9,
  "estoque": { "sp": 12, "rj": 5 },
  "tags": ["eletronico", "promocao"],
  "ativo": true,
  "desconto": null
}`;

export default function FormatterTool() {
  const [text, setText] = usePersistentState('formatter:text', '');
  const [indent, setIndent] = usePersistentState<'2' | '4' | 'tab'>('formatter:indent', '2');
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => tryParseJson(text), [text]);
  const stats = useMemo(() => (parsed.ok ? computeStats(text, parsed.value) : null), [parsed, text]);

  const indentValue = indent === 'tab' ? '\t' : Number(indent);

  const format = (transform?: (v: unknown) => unknown) => {
    if (!parsed.ok) return;
    const value = transform ? transform(parsed.value) : parsed.value;
    setText(JSON.stringify(value, null, indentValue));
  };

  const minify = () => {
    if (!parsed.ok) return;
    setText(JSON.stringify(parsed.value));
  };

  const openFile = (f: File | undefined) => {
    if (!f) return;
    f.text().then(setText);
  };

  return (
    <div className="tool">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => format()} disabled={!parsed.ok} title="Formatar com a indentação escolhida">
          Formatar
        </button>
        <select className="select" value={indent} onChange={(e) => setIndent(e.target.value as '2' | '4' | 'tab')} title="Indentação">
          <option value="2">2 espaços</option>
          <option value="4">4 espaços</option>
          <option value="tab">Tab</option>
        </select>
        <button className="btn" onClick={minify} disabled={!parsed.ok} title="Remover espaços e quebras de linha">
          Minificar
        </button>
        <button className="btn" onClick={() => format(sortKeysDeep)} disabled={!parsed.ok} title="Ordenar chaves alfabeticamente (recursivo)">
          Ordenar chaves
        </button>
        <span className="toolbar-spacer" />
        <CopyButton text={() => text} />
        <button className="btn" onClick={() => downloadText('dados.json', text)} disabled={text === ''}>
          Baixar
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Abrir arquivo</button>
        <input ref={fileRef} type="file" accept=".json,application/json,.txt" hidden onChange={(e) => openFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => setText(SAMPLE)}>Exemplo</button>
        <button className="btn btn-danger-ghost" onClick={() => setText('')} disabled={text === ''}>
          Limpar
        </button>
      </div>

      <div className="editor-fill">
        <JsonEditor value={text} onChange={setText} placeholder="Cole seu JSON aqui…" />
      </div>

      <div className={`statusbar ${text === '' ? '' : parsed.ok ? 'status-ok' : 'status-error'}`}>
        {text === '' ? (
          <span>Aguardando entrada</span>
        ) : parsed.ok && stats ? (
          <>
            <span>✓ JSON válido</span>
            <span>{formatBytes(stats.bytes)}</span>
            <span>{stats.lines} linhas</span>
            <span>{stats.nodes} nós</span>
            <span>{stats.keys} chaves</span>
            <span>profundidade {stats.maxDepth}</span>
          </>
        ) : (
          <span>
            ✗ {!parsed.ok && parsed.error}
            {!parsed.ok && parsed.line !== undefined && ` — linha ${parsed.line}, coluna ${parsed.column}`}
          </span>
        )}
      </div>
    </div>
  );
}
