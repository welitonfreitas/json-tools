import { useEffect, useMemo, useState } from 'react';
import { ThemeContext, Theme } from './theme';
import { loadPersisted, savePersisted } from './lib/persist';
import FormatterTool from './tools/FormatterTool';
import TreeTool from './tools/TreeTool';
import EscapeTool from './tools/EscapeTool';
import JsonPathTool from './tools/JsonPathTool';
import JoltTool from './tools/JoltTool';
import DiffTool from './tools/DiffTool';

interface ToolDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  component: () => JSX.Element;
}

const TOOLS: ToolDef[] = [
  {
    id: 'format',
    name: 'Formatar & Validar',
    icon: '{ }',
    description: 'Formate, minifique, valide e ordene chaves do seu JSON',
    component: FormatterTool,
  },
  {
    id: 'tree',
    name: 'Árvore',
    icon: '🌲',
    description: 'Navegue pelo JSON em formato de árvore, com busca e cópia de caminhos',
    component: TreeTool,
  },
  {
    id: 'escape',
    name: 'Escape / Unescape',
    icon: '\\"',
    description: 'Escape e desescape strings JSON, embuta JSON dentro de JSON',
    component: EscapeTool,
  },
  {
    id: 'jsonpath',
    name: 'JSONPath',
    icon: '$.',
    description: 'Teste expressões JSONPath com resultados e caminhos em tempo real',
    component: JsonPathTool,
  },
  {
    id: 'jolt',
    name: 'Jolt',
    icon: '⚡',
    description: 'Transforme JSON com specs Jolt — com histórico de execuções persistente',
    component: JoltTool,
  },
  {
    id: 'diff',
    name: 'Comparar',
    icon: '≠',
    description: 'Compare dois JSONs e veja as diferenças estruturais',
    component: DiffTool,
  },
];

function toolFromHash(): string {
  const h = location.hash.replace(/^#\/?/, '');
  return TOOLS.some((t) => t.id === h) ? h : loadPersisted('app:tool', 'format');
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => loadPersisted<Theme>('app:theme', 'dark'));
  const [activeId, setActiveId] = useState<string>(toolFromHash);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePersisted('app:theme', theme);
  }, [theme]);

  useEffect(() => {
    savePersisted('app:tool', activeId);
    history.replaceState(null, '', `#/${activeId}`);
  }, [activeId]);

  useEffect(() => {
    const onHash = () => setActiveId(toolFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const themeCtx = useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );

  const active = TOOLS.find((t) => t.id === activeId) ?? TOOLS[0];
  const ActiveComponent = active.component;

  return (
    <ThemeContext.Provider value={themeCtx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">{'{}'}</span>
            <div>
              <div className="brand-name">JSON Tools</div>
              <div className="brand-sub">100% no seu navegador</div>
            </div>
          </div>
          <nav className="nav">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`nav-item ${t.id === active.id ? 'nav-active' : ''}`}
                onClick={() => setActiveId(t.id)}
                title={t.description}
              >
                <span className="nav-icon">{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="btn btn-small" onClick={themeCtx.toggle} title="Alternar tema claro/escuro">
              {theme === 'dark' ? '☀ Tema claro' : '☾ Tema escuro'}
            </button>
            <p className="privacy-note">Seus dados nunca saem do navegador. Entradas e histórico ficam no localStorage.</p>
          </div>
        </aside>

        <main className="main">
          <header className="tool-header">
            <h1>{active.name}</h1>
            <p>{active.description}</p>
          </header>
          <div className="tool-body" key={active.id}>
            <ActiveComponent />
          </div>
        </main>
      </div>
    </ThemeContext.Provider>
  );
}
