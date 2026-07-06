import { useMemo } from 'react';
import { diffJson, diffCounts, DIFF_KIND_LABEL, fmtDiffValue } from '../lib/diff';

interface Props {
  a: unknown;
  b: unknown;
  /** Cabeçalhos das colunas de valores (padrão: "A" e "B"). */
  labelA?: string;
  labelB?: string;
  /** Mensagem quando não há diferenças. */
  emptyMessage?: string;
}

/** Tabela de diferenças estruturais entre dois valores JSON, com contadores. */
export default function DiffView({ a, b, labelA = 'A', labelB = 'B', emptyMessage }: Props) {
  const entries = useMemo(() => diffJson(a, b), [a, b]);
  const counts = useMemo(() => diffCounts(entries), [entries]);

  if (entries.length === 0) {
    return <div className="placeholder">✓ {emptyMessage ?? 'Os documentos são estruturalmente idênticos.'}</div>;
  }

  return (
    <div className="diff-view">
      <div className="diff-summary">
        <span className="diff-count diff-added">+{counts.added} {DIFF_KIND_LABEL.added}{counts.added === 1 ? '' : 's'}</span>
        <span className="diff-count diff-removed">−{counts.removed} {DIFF_KIND_LABEL.removed}{counts.removed === 1 ? '' : 's'}</span>
        <span className="diff-count diff-changed">~{counts.changed} {DIFF_KIND_LABEL.changed}{counts.changed === 1 ? '' : 's'}</span>
      </div>
      <table className="diff-table">
        <thead>
          <tr>
            <th>Caminho</th>
            <th>Tipo</th>
            <th>{labelA}</th>
            <th>{labelB}</th>
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
    </div>
  );
}
