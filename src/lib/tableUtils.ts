// Conversão de array JSON em tabela e exportadores (HTML, CSV, Excel).

export interface TableData {
  columns: string[];
  /** Linhas já achatadas: valor por coluna (undefined = célula vazia). */
  rows: Record<string, unknown>[];
}

function flattenInto(value: unknown, prefix: string, out: Record<string, unknown>): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out[prefix] = {};
      return;
    }
    for (const [k, v] of entries) flattenInto(v, prefix === '' ? k : `${prefix}.${k}`, out);
  } else {
    out[prefix] = value;
  }
}

export interface ArraySource {
  /** Rótulo exibível: "(raiz)" ou o caminho da propriedade (ex.: request.body.itens). */
  label: string;
  segments: string[];
  length: number;
}

/**
 * Descobre onde há arrays no JSON: na raiz ou em propriedades (busca recursiva
 * em objetos, sem descer para dentro dos arrays encontrados).
 */
export function findArraySources(value: unknown, maxDepth = 8): ArraySource[] {
  const out: ArraySource[] = [];
  const visit = (v: unknown, segs: string[], depth: number): void => {
    if (Array.isArray(v)) {
      out.push({ label: segs.length === 0 ? '(raiz)' : segs.join('.'), segments: [...segs], length: v.length });
      return;
    }
    if (v !== null && typeof v === 'object' && depth < maxDepth) {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) visit(child, [...segs, k], depth + 1);
    }
  };
  visit(value, [], 0);
  return out;
}

/** Navega pelos segmentos de chave (sem interpretar pontos dentro das chaves). */
export function getAtSegments(value: unknown, segments: string[]): unknown {
  let cur = value;
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Converte um array JSON em tabela. `flatten` achata objetos aninhados em colunas "a.b". */
export function jsonArrayToTable(value: unknown, flatten: boolean): TableData | { error: string } {
  if (!Array.isArray(value)) {
    return { error: 'A entrada precisa ser um array JSON (ex.: [{...}, {...}]).' };
  }
  if (value.length === 0) return { columns: [], rows: [] };

  const rows: Record<string, unknown>[] = [];
  const columns: string[] = [];
  const seen = new Set<string>();
  const addColumn = (c: string) => {
    if (!seen.has(c)) {
      seen.add(c);
      columns.push(c);
    }
  };

  for (const item of value) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const row: Record<string, unknown> = {};
      if (flatten) {
        flattenInto(item, '', row);
      } else {
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) row[k] = v;
      }
      for (const k of Object.keys(row)) addColumn(k);
      rows.push(row);
    } else {
      // Itens escalares (ou arrays) viram uma coluna única "valor"
      addColumn('valor');
      rows.push({ valor: item });
    }
  }
  return { columns, rows };
}

/** Texto exibível/exportável de uma célula. */
export function cellText(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function csvEscape(text: string, sep: string): string {
  if (text.includes('"') || text.includes(sep) || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** CSV com BOM UTF-8 (para o Excel reconhecer acentuação). */
export function toCSV(table: TableData, sep: string): string {
  const lines = [table.columns.map((c) => csvEscape(c, sep)).join(sep)];
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => csvEscape(cellText(row[c]), sep)).join(sep));
  }
  return '\uFEFF' + lines.join('\r\n');
}

/** TSV (para colar direto no Excel/Sheets). */
export function toTSV(table: TableData): string {
  const clean = (s: string) => s.replace(/[\t\n\r]+/g, ' ');
  const lines = [table.columns.map(clean).join('\t')];
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => clean(cellText(row[c]))).join('\t'));
  }
  return lines.join('\n');
}

function htmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tableMarkup(table: TableData): string {
  const head = table.columns.map((c) => `<th>${htmlEscape(c)}</th>`).join('');
  const body = table.rows
    .map((row) => `<tr>${table.columns.map((c) => `<td>${htmlEscape(cellText(row[c]))}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

/** Documento HTML independente com a tabela estilizada. */
export function toHTMLDocument(table: TableData, title: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${htmlEscape(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; color: #1f2933; }
  h1 { font-size: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #d8dee6; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f6f8; position: sticky; top: 0; }
  tr:nth-child(even) td { background: #fafbfc; }
</style>
</head>
<body>
<h1>${htmlEscape(title)}</h1>
${tableMarkup(table)}
</body>
</html>`;
}

/** Arquivo .xls (HTML com namespaces do Office — abre direto no Excel, sem dependências). */
export function toExcelXls(table: TableData, sheetName: string): string {
  const safeSheet = sheetName.replace(/[[\]*/\\?:]/g, ' ').slice(0, 31) || 'Dados';
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${htmlEscape(safeSheet)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>td, th { mso-number-format: "\\@"; border: .5pt solid #ccc; } th { background: #eee; font-weight: bold; }</style>
</head>
<body>
${tableMarkup(table)}
</body>
</html>`;
}
