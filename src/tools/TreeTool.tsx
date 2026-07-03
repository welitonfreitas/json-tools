import { useMemo, useState } from 'react';
import JsonEditor from '../components/JsonEditor';
import TreeView from '../components/TreeView';
import { usePersistentState } from '../lib/persist';
import { tryParseJson, computeStats, formatBytes } from '../lib/jsonUtils';

const SAMPLE = `{
  "empresa": "Acme",
  "funcionarios": [
    { "nome": "Ana", "cargo": "dev", "skills": ["ts", "go"] },
    { "nome": "Bruno", "cargo": "design", "skills": ["figma"] }
  ],
  "endereco": { "cidade": "São Paulo", "uf": "SP" }
}`;

export default function TreeTool() {
  const [text, setText] = usePersistentState('tree:text', SAMPLE);
  const [search, setSearch] = useState('');
  const [expandSignal, setExpandSignal] = useState({ version: 0, expand: true });

  const parsed = useMemo(() => tryParseJson(text), [text]);
  const stats = useMemo(() => (parsed.ok ? computeStats(text, parsed.value) : null), [parsed, text]);

  return (
    <div className="tool">
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
            <span className="pane-title">Árvore</span>
            <input
              className="input input-small"
              placeholder="Buscar chave ou valor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-small" onClick={() => setExpandSignal((s) => ({ version: s.version + 1, expand: true }))}>
              Expandir tudo
            </button>
            <button className="btn btn-small" onClick={() => setExpandSignal((s) => ({ version: s.version + 1, expand: false }))}>
              Recolher tudo
            </button>
          </div>
          <div className="pane-body">
            {parsed.ok ? (
              <TreeView data={parsed.value} search={search.trim()} expandSignal={expandSignal} />
            ) : (
              <div className="placeholder">
                {text.trim() === '' ? 'Cole um JSON à esquerda para navegar na árvore.' : `JSON inválido: ${parsed.error}`}
              </div>
            )}
          </div>
          {stats && (
            <div className="statusbar status-ok">
              <span>{formatBytes(stats.bytes)}</span>
              <span>{stats.nodes} nós</span>
              <span>{stats.objects} objetos</span>
              <span>{stats.arrays} arrays</span>
              <span>profundidade {stats.maxDepth}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
