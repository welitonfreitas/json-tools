import { useContext, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { ThemeContext } from '../theme';

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
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff' },
  '.cm-gutters': { backgroundColor: '#f4f6f8', color: '#9aa4b1', border: 'none' },
});

export default function JsonEditor({
  value,
  onChange,
  height = '100%',
  readOnly,
  placeholder,
  plainText,
  onView,
  extraExtensions,
}: Props) {
  const { theme } = useContext(ThemeContext);
  const extensions = useMemo(() => {
    const ext: Extension[] = [EditorView.lineWrapping];
    if (!plainText) ext.push(json());
    if (theme === 'light') ext.push(lightTheme);
    if (extraExtensions) ext.push(...extraExtensions);
    return ext;
  }, [plainText, theme, extraExtensions]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      onCreateEditor={onView}
      readOnly={readOnly}
      height={height}
      placeholder={placeholder}
      theme={theme === 'dark' ? oneDark : 'light'}
      extensions={extensions}
      basicSetup={{
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        highlightSelectionMatches: true,
      }}
      style={{ height, fontSize: '13px' }}
    />
  );
}
