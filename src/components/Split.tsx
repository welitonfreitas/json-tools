import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePersistentState } from '../lib/persist';

// Contêiner de painéis lado a lado com divisores arrastáveis (proporção
// persistida) e maximização de qualquer painel (Esc restaura).

const SplitCtx = createContext<{ maximized: number | null; toggle: (i: number) => void; withMax: boolean } | null>(
  null,
);
const PaneIdxCtx = createContext<number>(-1);

/** Botão de maximizar/restaurar — coloque no pane-header de cada painel do Split. */
export function SplitMaxButton() {
  const ctx = useContext(SplitCtx);
  const idx = useContext(PaneIdxCtx);
  if (!ctx || !ctx.withMax || idx < 0) return null;
  const isMax = ctx.maximized === idx;
  return (
    <button
      className="btn btn-small btn-max"
      onClick={() => ctx.toggle(idx)}
      title={isMax ? 'Restaurar layout (Esc)' : 'Maximizar este painel'}
    >
      {isMax ? '🗗 Restaurar' : '⛶'}
    </button>
  );
}

interface SplitProps {
  /** Chave para persistir a proporção dos painéis. */
  storageKey: string;
  className?: string;
  /** Desliga o contexto de maximização (para quem gerencia a própria, ex.: Jolt). */
  withMaximize?: boolean;
  children: (JSX.Element | null | false)[];
}

const MIN_PCT = 12;

export default function Split({ storageKey, className = '', withMaximize = true, children }: SplitProps) {
  const panes = children.filter(Boolean) as JSX.Element[];
  const count = panes.length;
  const equal = Array.from({ length: count }, () => 100 / count);
  const [sizes, setSizes] = usePersistentState<number[]>(`split:${storageKey}`, equal);
  const [maximized, setMaximized] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const validSizes = sizes.length === count && sizes.every((s) => typeof s === 'number' && s > 0) ? sizes : equal;

  useEffect(() => {
    if (maximized === null || maximized < count) return;
    setMaximized(null); // painel maximizado deixou de existir
  }, [maximized, count]);

  useEffect(() => {
    if (maximized === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximized(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized]);

  const onDividerDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startSizes = [...validSizes];
    const onMove = (ev: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const totalPx = el.getBoundingClientRect().width || 1;
      const deltaPct = ((ev.clientX - startX) / totalPx) * 100;
      const pair = startSizes[index] + startSizes[index + 1];
      const moved = Math.max(MIN_PCT, Math.min(startSizes[index] + deltaPct, pair - MIN_PCT));
      const next = [...startSizes];
      next[index] = moved;
      next[index + 1] = pair - moved;
      setSizes(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('col-resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('col-resizing');
  };

  const ctxValue = {
    maximized,
    toggle: (i: number) => setMaximized((m) => (m === i ? null : i)),
    withMax: withMaximize,
  };

  const cols =
    maximized !== null
      ? '1fr'
      : validSizes.map((s) => `minmax(0, ${s.toFixed(3)}fr)`).join(' 10px ');

  return (
    <SplitCtx.Provider value={ctxValue}>
      <div ref={containerRef} className={`split split-resizable ${className}`} style={{ gridTemplateColumns: cols }}>
        {panes.map((pane, i) => {
          if (maximized !== null && maximized !== i) return null;
          return (
            <PaneIdxCtx.Provider key={i} value={i}>
              {pane}
              {maximized === null && i < count - 1 && (
                <div
                  className="split-divider"
                  onMouseDown={(e) => onDividerDown(i, e)}
                  onDoubleClick={() => setSizes(equal)}
                  title="Arraste para redimensionar · duplo clique restaura"
                >
                  <div className="split-divider-grip" />
                </div>
              )}
            </PaneIdxCtx.Provider>
          );
        })}
      </div>
    </SplitCtx.Provider>
  );
}
