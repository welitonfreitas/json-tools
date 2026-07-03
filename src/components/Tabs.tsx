import { useState } from 'react';
import { usePersistentState, removePersistedByPrefix } from '../lib/persist';

// Abas por ferramenta: cada aba tem estado próprio no localStorage
// (chaves "<tool>:<tabId>:*"), então tudo sobrevive a reloads.

interface Tab {
  id: string;
  name: string;
}

interface TabsState {
  tabs: Tab[];
  active: string;
  /** Contador para nomear novas abas (nunca decresce). */
  counter: number;
}

/** Id fixo da primeira aba — os dados antigos (sem abas) migram para ela. */
export const DEFAULT_TAB_ID = 't1';

const initialState = (): TabsState => ({
  tabs: [{ id: DEFAULT_TAB_ID, name: 'Aba 1' }],
  active: DEFAULT_TAB_ID,
  counter: 1,
});

interface Props {
  toolId: string;
  render: (tabId: string) => JSX.Element;
}

export default function TabbedTool({ toolId, render }: Props) {
  const [state, setState] = usePersistentState<TabsState>(`tabs:${toolId}`, initialState());
  const [renaming, setRenaming] = useState<string | null>(null);

  // Sanidade: se o estado persistido estiver corrompido/vazio, recomeça
  const tabs = state.tabs.length > 0 ? state.tabs : initialState().tabs;
  const active = tabs.some((t) => t.id === state.active) ? state.active : tabs[0].id;

  const addTab = () => {
    setState((s) => {
      const n = s.counter + 1;
      const tab: Tab = { id: `t${n}`, name: `Aba ${n}` };
      return { tabs: [...s.tabs, tab], active: tab.id, counter: n };
    });
  };

  const closeTab = (id: string) => {
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const idx = s.tabs.findIndex((t) => t.id === id);
      const remaining = s.tabs.filter((t) => t.id !== id);
      const nextActive = s.active === id ? remaining[Math.max(0, idx - 1)].id : s.active;
      return { ...s, tabs: remaining, active: nextActive };
    });
    removePersistedByPrefix(`${toolId}:${id}:`);
  };

  const renameTab = (id: string, name: string) => {
    const trimmed = name.trim();
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: trimmed === '' ? t.name : trimmed } : t)),
    }));
    setRenaming(null);
  };

  return (
    <div className="tabbed">
      <div className="tabbar" role="tablist">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            className={`tab ${t.id === active ? 'tab-active' : ''}`}
            onClick={() => setState((s) => ({ ...s, active: t.id }))}
            onDoubleClick={() => setRenaming(t.id)}
            title={`${t.name} — clique duplo para renomear`}
          >
            {renaming === t.id ? (
              <input
                className="tab-rename"
                defaultValue={t.name}
                autoFocus
                onFocus={(e) => e.target.select()}
                onBlur={(e) => renameTab(t.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameTab(t.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-name">{t.name}</span>
            )}
            {tabs.length > 1 && (
              <button
                className="tab-close"
                title="Fechar aba (os dados desta aba são descartados)"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="tab-add" onClick={addTab} title="Nova aba">
          +
        </button>
      </div>
      <div className="tabbed-body" key={active}>
        {render(active)}
      </div>
    </div>
  );
}
