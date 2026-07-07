import { useMemo, useState } from 'react';
import JsonEditor from '../components/JsonEditor';
import CopyButton from '../components/CopyButton';
import { usePersistentState } from '../lib/persist';
import { tryParseJson, downloadText } from '../lib/jsonUtils';
import { jsonArrayToTable, cellText, toCSV, toTSV, toHTMLDocument, toExcelXls } from '../lib/tableUtils';

const SAMPLE = `[
  { "id": 1, "nome": "Ana", "endereco": { "cidade": "São Paulo", "uf": "SP" }, "ativo": true, "salario": 7500.5 },
  { "id": 2, "nome": "Bruno", "endereco": { "cidade": "Recife", "uf": "PE" }, "ativo": false, "salario": 6200 },
  { "id": 3, "nome": "Carla", "endereco": { "cidade": "Curitiba", "uf": "PR" }, "tags": ["dev", "ux"], "salario": 8100 }
]`;

/** Máximo de linhas renderizadas na tela (os exports sempre incluem tudo). */
const MAX_RENDER = 1000;

type SortDir = 'asc' | 'desc';

export default function TableTool({ tabId }: { tabId: string }) {
  const [text, setText] = usePersistentState(`table:${tabId}:text`, SAMPLE);
  const [flatten, setFlatten] = usePersistentState<boolean>(`table:${tabId}:flatten`, true);
  const [sep, setSep] = usePersistentState<';' | ','>('table:csvsep', ';');
  const [sort, setSort] = useState<{ col: string; dir: SortDir } | null>(null);

  const parsed = useMemo(() => tryParseJson(text), [text]);
  const table = useMemo(() => {
    if (!parsed.ok) return null;
    return jsonArrayToTable(parsed.value, flatten);
  }, [parsed, flatten]);

  const data = table !== null && !('error' in table) ? table : null;

  const sortedRows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.rows;
    const { col, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va === undefined && vb === undefined) return 0;
      if (va === undefined) return 1;
      if (vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return cellText(va).localeCompare(cellText(vb), 'pt-BR', { numeric: true }) * factor;
    });
  }, [data, sort]);

  const toggleSort = (col: string) => {
    setSort((s) => {
      if (s?.col !== col) return { col, dir: 'asc' };
      if (s.dir === 'asc') return { col, dir: 'desc' };
      return null; // terceiro clique volta à ordem original
    });
  };

  const exportTable = useMemo(
    () => (data ? { ...data, rows: sortedRows } : null),
    [data, sortedRows],
  );

  const error =
    text.trim() === ''
      ? null
      : !parsed.ok
        ? `JSON inválido: ${parsed.error}`
        : table && 'error' in table
          ? table.error
          : null;

  return (
    <div className="tool">
      <div className="toolbar">
        <label className="check-label" title="Objetos aninhados viram colunas com ponto (ex.: endereco.cidade)">
          <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
          Achatar objetos aninhados
        </label>
        <span className="toolbar-sep" />
        <span className="chip-label">Exportar:</span>
        <button
          className="btn"
          disabled={!exportTable}
          onClick={() => exportTable && downloadText('tabela.html', toHTMLDocument(exportTable, 'Tabela JSON'), 'text/html')}
          title="Baixar como página HTML independente"
        >
          HTML
        </button>
        <button
          className="btn"
          disabled={!exportTable}
          onClick={() => exportTable && downloadText('tabela.csv', toCSV(exportTable, sep), 'text/csv;charset=utf-8')}
          title="Baixar como CSV (UTF-8 com BOM)"
        >
          CSV
        </button>
        <select className="select" value={sep} onChange={(e) => setSep(e.target.value as ';' | ',')} title="Separador do CSV">
          <option value=";">separador ;</option>
          <option value=",">separador ,</option>
        </select>
        <button
          className="btn"
          disabled={!exportTable}
          onClick={() => exportTable && downloadText('tabela.xls', toExcelXls(exportTable, 'Dados'), 'application/vnd.ms-excel')}
          title="Baixar como planilha Excel (.xls)"
        >
          Excel
        </button>
        <CopyButton label="Copiar p/ planilha" text={() => (exportTable ? toTSV(exportTable) : '')} title="Copia em TSV — cole direto no Excel ou Google Sheets" />
        <span className="toolbar-spacer" />
        <button className="btn" onClick={() => setText(SAMPLE)}>Exemplo</button>
        <button className="btn btn-danger-ghost" onClick={() => setText('')} disabled={text === ''}>
          Limpar
        </button>
      </div>

      <div className="split">
        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">Array JSON</span>
          </div>
          <div className="editor-fill">
            <JsonEditor value={text} onChange={setText} placeholder='[{"campo": "valor"}, …]' />
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">
              Tabela{data ? ` (${data.rows.length} ${data.rows.length === 1 ? 'linha' : 'linhas'} × ${data.columns.length} colunas)` : ''}
            </span>
          </div>
          <div className="pane-body table-scroll">
            {error !== null ? (
              <div className="placeholder placeholder-error">✗ {error}</div>
            ) : !data ? (
              <div className="placeholder">Cole um array JSON à esquerda para gerar a tabela.</div>
            ) : data.rows.length === 0 ? (
              <div className="placeholder">O array está vazio.</div>
            ) : (
              <>
                <table className="data-table">
                  <thead>
                    <tr>
                      {data.columns.map((c) => (
                        <th key={c} onClick={() => toggleSort(c)} title="Clique para ordenar">
                          {c}
                          {sort?.col === c && <span className="sort-arrow">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.slice(0, MAX_RENDER).map((row, i) => (
                      <tr key={i}>
                        {data.columns.map((c) => {
                          const v = row[c];
                          const kind = v === null ? 'null' : Array.isArray(v) ? 'json' : typeof v === 'object' ? 'json' : typeof v;
                          return (
                            <td key={c} className={`cell-${kind}`}>
                              {cellText(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedRows.length > MAX_RENDER && (
                  <div className="table-note">
                    Mostrando as primeiras {MAX_RENDER} de {sortedRows.length} linhas — os exports incluem todas.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
