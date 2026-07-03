import { useContext, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { ThemeContext } from '../theme';

interface Props {
  value: string;
  onChange?: (v: string) => void;
  height?: string;
  readOnly?: boolean;
  placeholder?: string;
  /** Desliga o modo JSON (para texto livre, ex.: escape/unescape). */
  plainText?: boolean;
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff' },
  '.cm-gutters': { backgroundColor: '#f4f6f8', color: '#9aa4b1', border: 'none' },
});

export default function JsonEditor({ value, onChange, height = '100%', readOnly, placeholder, plainText }: Props) {
  const { theme } = useContext(ThemeContext);
  const extensions = useMemo(() => {
    const ext = [EditorView.lineWrapping];
    if (!plainText) ext.push(json());
    if (theme === 'light') ext.push(lightTheme);
    return ext;
  }, [plainText, theme]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
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
