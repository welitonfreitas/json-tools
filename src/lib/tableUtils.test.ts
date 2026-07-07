import { describe, it, expect } from 'vitest';
import { jsonArrayToTable, toCSV, toTSV, toHTMLDocument, toExcelXls, TableData } from './tableUtils';

describe('jsonArrayToTable', () => {
  it('extrai colunas na ordem de aparição, unindo chaves de todos os itens', () => {
    const t = jsonArrayToTable(
      [
        { a: 1, b: 2 },
        { b: 3, c: 4 },
      ],
      true,
    ) as TableData;
    expect(t.columns).toEqual(['a', 'b', 'c']);
    expect(t.rows).toEqual([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ]);
  });

  it('achata objetos aninhados em colunas com ponto', () => {
    const t = jsonArrayToTable([{ nome: 'Ana', endereco: { cidade: 'SP', geo: { lat: 1 } } }], true) as TableData;
    expect(t.columns).toEqual(['nome', 'endereco.cidade', 'endereco.geo.lat']);
    expect(t.rows[0]['endereco.geo.lat']).toBe(1);
  });

  it('sem achatar, objetos aninhados ficam numa coluna só', () => {
    const t = jsonArrayToTable([{ nome: 'Ana', endereco: { cidade: 'SP' } }], false) as TableData;
    expect(t.columns).toEqual(['nome', 'endereco']);
    expect(t.rows[0].endereco).toEqual({ cidade: 'SP' });
  });

  it('itens escalares viram coluna "valor" e não-array retorna erro', () => {
    const t = jsonArrayToTable([1, 'x'], true) as TableData;
    expect(t.columns).toEqual(['valor']);
    expect(t.rows).toEqual([{ valor: 1 }, { valor: 'x' }]);
    expect(jsonArrayToTable({ a: 1 }, true)).toHaveProperty('error');
  });
});

describe('exportadores', () => {
  const table: TableData = {
    columns: ['nome', 'obs'],
    rows: [
      { nome: 'Ana', obs: 'usa ; e "aspas"' },
      { nome: 'Bruno' },
    ],
  };

  it('CSV escapa separador e aspas, com BOM UTF-8 e CRLF', () => {
    const csv = toCSV(table, ';');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('nome;obs');
    expect(csv).toContain('Ana;"usa ; e ""aspas"""');
    expect(csv).toContain('Bruno;');
    expect(csv).toContain('\r\n');
  });

  it('TSV substitui tabs e quebras de linha nas células', () => {
    const t: TableData = { columns: ['a'], rows: [{ a: 'x\ty\nz' }] };
    expect(toTSV(t)).toBe('a\nx y z');
  });

  it('HTML escapa conteúdo e gera documento completo', () => {
    const t: TableData = { columns: ['tag'], rows: [{ tag: '<b>&</b>' }] };
    const html = toHTMLDocument(t, 'Título');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<td>&lt;b&gt;&amp;&lt;/b&gt;</td>');
    expect(html).not.toContain('<td><b>');
  });

  it('Excel .xls inclui namespaces do Office e o nome da planilha', () => {
    const xls = toExcelXls(table, 'Relatório [2026]');
    expect(xls).toContain('urn:schemas-microsoft-com:office:excel');
    expect(xls).toContain('<x:Name>Relatório  2026 </x:Name>');
    expect(xls).toContain('<th>nome</th>');
  });
});
