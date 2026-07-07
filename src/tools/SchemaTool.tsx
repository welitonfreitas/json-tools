import { useMemo, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import JsonEditor from '../components/JsonEditor';
import { usePersistentState } from '../lib/persist';
import { tryParseJson } from '../lib/jsonUtils';
import { validateAgainstSchema, ValidationResult } from '../lib/schemaValidator';
import { findJsonRange, revealRange } from '../lib/jsonLocator';
import { DEFAULT_TAB_ID } from '../components/Tabs';

const SAMPLE_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["nome", "email", "idade"],
  "properties": {
    "nome": { "type": "string", "minLength": 2 },
    "email": { "type": "string", "format": "email" },
    "idade": { "type": "integer", "minimum": 18 },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "endereco": {
      "type": "object",
      "required": ["cidade"],
      "properties": {
        "cidade": { "type": "string" },
        "cep": { "type": "string", "pattern": "^\\\\d{5}-?\\\\d{3}$" }
      }
    }
  },
  "additionalProperties": false
}`;

const SAMPLE_PAYLOAD = `{
  "nome": "A",
  "email": "ana@exemplo",
  "idade": 16,
  "tags": ["dev", "dev"],
  "endereco": { "cep": "1234-56" },
  "extra": true
}`;

export default function SchemaTool({ tabId }: { tabId: string }) {
  void DEFAULT_TAB_ID;
  const [schemaText, setSchemaText] = usePersistentState(`schema:${tabId}:schema`, SAMPLE_SCHEMA);
  const [payloadText, setPayloadText] = usePersistentState(`schema:${tabId}:payload`, SAMPLE_PAYLOAD);
  const payloadView = useRef<EditorView | null>(null);
  const schemaView = useRef<EditorView | null>(null);

  const schemaParse = useMemo(() => tryParseJson(schemaText), [schemaText]);
  const payloadParse = useMemo(() => tryParseJson(payloadText), [payloadText]);

  const result = useMemo((): ValidationResult | null => {
    if (!schemaParse.ok || !payloadParse.ok) return null;
    return validateAgainstSchema(schemaParse.value, payloadParse.value);
  }, [schemaParse, payloadParse]);

  const badge = (parse: typeof schemaParse, text: string) => {
    if (parse.ok || text.trim() === '') return null;
    const where = parse.line !== undefined ? ` — linha ${parse.line}` : '';
    return (
      <span className="pane-error-badge" title={parse.error}>
        ✗ JSON inválido{where}
      </span>
    );
  };

  const goTo = (path: (string | number)[]) => {
    const view = payloadView.current;
    if (!view) return;
    const range = findJsonRange(view, path);
    if (range) revealRange(view, range);
  };

  const issueCount = result?.kind === 'invalid' ? result.issues.length : 0;

  return (
    <div className="tool">
      <div className="toolbar">
        <span className="hint">A validação roda automaticamente enquanto você digita · clique num erro para localizar no payload</span>
        <span className="toolbar-spacer" />
        <button
          className="btn"
          onClick={() => {
            setSchemaText(SAMPLE_SCHEMA);
            setPayloadText(SAMPLE_PAYLOAD);
          }}
        >
          Exemplo
        </button>
        <button
          className="btn btn-danger-ghost"
          onClick={() => {
            setSchemaText('');
            setPayloadText('');
          }}
          disabled={schemaText === '' && payloadText === ''}
        >
          Limpar
        </button>
      </div>

      <div className="split split-3">
        <div className={`split-pane ${!schemaParse.ok && schemaText.trim() !== '' ? 'pane-invalid' : ''}`}>
          <div className="pane-header">
            <span className="pane-title">JSON Schema</span>
            {badge(schemaParse, schemaText)}
          </div>
          <div className="editor-fill">
            <JsonEditor value={schemaText} onChange={setSchemaText} onView={(v) => (schemaView.current = v)} placeholder='{"type": "object", …}' />
          </div>
        </div>

        <div className={`split-pane ${!payloadParse.ok && payloadText.trim() !== '' ? 'pane-invalid' : ''}`}>
          <div className="pane-header">
            <span className="pane-title">Payload</span>
            {badge(payloadParse, payloadText)}
          </div>
          <div className="editor-fill">
            <JsonEditor value={payloadText} onChange={setPayloadText} onView={(v) => (payloadView.current = v)} placeholder="JSON a validar…" />
          </div>
        </div>

        <div className="split-pane">
          <div className="pane-header">
            <span className="pane-title">
              Resultado{result?.kind === 'invalid' ? ` (${issueCount} ${issueCount === 1 ? 'erro' : 'erros'})` : ''}
            </span>
          </div>
          <div className="pane-body">
            {schemaText.trim() === '' || payloadText.trim() === '' ? (
              <div className="placeholder">Preencha o schema e o payload para validar.</div>
            ) : !schemaParse.ok ? (
              <div className="placeholder placeholder-error">Corrija o JSON do schema para validar.</div>
            ) : !payloadParse.ok ? (
              <div className="placeholder placeholder-error">Corrija o JSON do payload para validar.</div>
            ) : result?.kind === 'schema-error' ? (
              <div className="schema-banner schema-banner-error">
                <div className="banner-title">✗ Schema inválido</div>
                <div className="banner-detail mono">{result.message}</div>
              </div>
            ) : result?.kind === 'valid' ? (
              <div className="schema-banner schema-banner-ok">
                <div className="banner-title">✓ Payload válido</div>
                <div className="banner-detail">O payload atende a todas as regras do schema.</div>
              </div>
            ) : result?.kind === 'invalid' ? (
              <div className="issue-list">
                {result.issues.map((issue, i) => (
                  <button key={i} className="issue-card" onClick={() => goTo(issue.path)} title="Clique para localizar no payload">
                    <div className="issue-head">
                      <span className="issue-keyword">{issue.keyword}</span>
                      <code className="issue-path">{issue.pathLabel}</code>
                    </div>
                    <div className="issue-message">{issue.message}</div>
                    <div className="issue-rule mono" title={`Regra em ${issue.schemaPath}`}>
                      {issue.rule}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`statusbar ${result?.kind === 'valid' ? 'status-ok' : result ? 'status-error' : ''}`}>
            {result?.kind === 'valid' ? (
              <span>✓ Válido</span>
            ) : result?.kind === 'invalid' ? (
              <span>✗ {issueCount} {issueCount === 1 ? 'violação encontrada' : 'violações encontradas'}</span>
            ) : result?.kind === 'schema-error' ? (
              <span>✗ O schema não pôde ser compilado</span>
            ) : (
              <span>Aguardando entradas válidas</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
