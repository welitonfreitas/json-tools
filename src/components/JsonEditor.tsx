import { useContext, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { search } from '@codemirror/search';
import { ThemeContext } from '../theme';
import { pathAtPosition } from '../lib/jsonLocator';
import { tryParseJson, formatBytes, copyToClipboard } from '../lib/jsonUtils';

interface Props {
  value: string;
  onChange?: (v: string) => void;
  height?: string;
  readOnly?: boolean;
  placeholder?: string;
  /** Desliga o modo JSON (para texto livre, ex.: escape/unescape). */
  plainText?: boolean;
  /** Recebe a EditorView criada (para navegação programática). */
  onView?: (view: EditorView) => void;
  /** Extensões adicionais do CodeMirror (ex.: campo de realce). */
  extraExtensions?: Extension[];
  /** Barra de status (posição, caminho do nó, validade, tamanho). Padrão: ligada no modo JSON. */
  statusBar?: boolean;
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff' },
  '.cm-gutters': { backgroundColor: '#f4f6f8', color: '#9aa4b1', border: 'none' },
});

// IMPORTANTE: identidade estável. Um objeto literal inline faria o
// @uiw/react-codemirror reconfigurar o editor a cada render, o que descarta
// extensões anexadas dinamicamente — o painel de busca do Ctrl+F fechava
// sozinho assim que a barra de status re-renderizava o componente.
const BASIC_SETUP = {
  foldGutter: true,
  highlightActiveLine: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: false,
  highlightSelectionMatches: true,
} as const;

// Busca registrada explicitamente (não só anexada pelo atalho) + painel em pt-BR
const SEARCH_EXTENSIONS: Extension[] = [
  search({ top: true }),
  EditorState.phrases.of({
    'Find': 'Buscar',
    'Replace': 'Substituir',
    'next': 'próxima',
    'previous': 'anterior',
    'all': 'todas',
    'match case': 'diferenciar maiúsculas',
    'by word': 'palavra inteira',
    'regexp': 'regex',
    'replace': 'substituir',
    'replace all': 'substituir todas',
    'close': 'fechar',
    'current match': 'ocorrência atual',
    'replaced $ matches': '$ ocorrências substituídas',
    'replaced match on line $': 'ocorrência substituída na linha $',
    'on line': 'na linha',
  }),
];

interface CursorInfo {
  line: number;
  col: number;
  path: string;
}

export default function JsonEditor({
  value,
  onChange,
  height = '100%',
  readOnly,
  placeholder,
  plainText,
  onView,
  extraExtensions,
  statusBar,
}: Props) {
  const { theme } = useContext(ThemeContext);
  const showBar = statusBar ?? !plainText;
  const [cursor, setCursor] = useState<CursorInfo | null>(null);
  const [pathCopied, setPathCopied] = useState(false);

  // Handler estável para o listener do CodeMirror (evita recriar a extensão)
  const cursorHandler = useRef<(view: EditorView) => void>(() => {});
  cursorHandler.current = (view: EditorView) => {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    setCursor({ line: line.number, col: pos - line.from + 1, path: plainText ? '' : pathAtPosition(view, pos) });
  };

  const extensions = useMemo(() => {
    const ext: Extension[] = [EditorView.lineWrapping, ...SEARCH_EXTENSIONS];
    if (!plainText) ext.push(json());
    if (theme === 'light') ext.push(lightTheme);
    if (showBar) {
      ext.push(
        EditorView.updateListener.of((u) => {
          if (u.selectionSet || u.docChanged || u.focusChanged) cursorHandler.current(u.view);
        }),
      );
    }
    if (extraExtensions) ext.push(...extraExtensions);
    return ext;
  }, [plainText, theme, extraExtensions, showBar]);

  const info = useMemo(() => {
    if (!showBar) return null;
    if (value.trim() === '') return { empty: true as const };
    const parsed = tryParseJson(value);
    return {
      empty: false as const,
      ok: parsed.ok,
      error: parsed.ok ? '' : parsed.error,
      bytes: new TextEncoder().encode(value).length,
      lines: value.split('\n').length,
    };
  }, [value, showBar]);

  const copyPath = async () => {
    if (!cursor?.path) return;
    if (await copyToClipboard(cursor.path)) {
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 1200);
    }
  };

  const editor = (
    <CodeMirror
      value={value}
      onChange={onChange}
      onCreateEditor={onView}
      readOnly={readOnly}
      height="100%"
      placeholder={placeholder}
      theme={theme === 'dark' ? oneDark : 'light'}
      extensions={extensions}
      basicSetup={BASIC_SETUP}
      style={{ height: '100%', fontSize: '13px' }}
    />
  );

  if (!showBar) {
    return <div style={{ height }}>{editor}</div>;
  }

  return (
    <div className="editor-wrap" style={{ height }}>
      <div className="editor-area">{editor}</div>
      <div className="editor-statusbar">
        <span className="es-pos">{cursor ? `Ln ${cursor.line}, Col ${cursor.col}` : 'Ln 1, Col 1'}</span>
        {cursor?.path && (
          <button className="es-path" onClick={copyPath} title={`${cursor.path} — clique para copiar`}>
            {pathCopied ? '✓ copiado' : cursor.path}
          </button>
        )}
        <span className="es-spacer" />
        {info && !info.empty && (
          <>
            <span className={info.ok ? 'es-ok' : 'es-err'} title={info.ok ? 'JSON válido' : info.error}>
              {info.ok ? '✓' : '✗'}
            </span>
            <span>{formatBytes(info.bytes)}</span>
            <span>{info.lines} {info.lines === 1 ? 'linha' : 'linhas'}</span>
          </>
        )}
        {info?.empty && <span>vazio</span>}
      </div>
    </div>
  );
}
