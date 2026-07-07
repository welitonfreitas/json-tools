// Validação de payload contra JSON Schema (via Ajv), com mensagens em pt-BR
// e caminho do erro em segmentos para navegação interativa no editor.

import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import ptBR from 'ajv-i18n/localize/pt-BR';

export interface ValidationIssue {
  /** Caminho do erro no payload, em segmentos (chaves e índices). Vazio = raiz. */
  path: (string | number)[];
  /** Caminho legível, ex.: $.itens[0].preco */
  pathLabel: string;
  keyword: string;
  message: string;
  /** Trecho da regra do schema que falhou (ex.: {"minimum": 0}). */
  rule: string;
  /** Caminho da regra dentro do schema (schemaPath do Ajv). */
  schemaPath: string;
}

export type ValidationResult =
  | { kind: 'valid' }
  | { kind: 'invalid'; issues: ValidationIssue[] }
  | { kind: 'schema-error'; message: string };

/** Converte um JSON Pointer ("/a/0/b~1c") em segmentos, desfazendo ~0/~1. */
export function pointerToSegments(pointer: string): (string | number)[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => {
      const unescaped = seg.replace(/~1/g, '/').replace(/~0/g, '~');
      return /^\d+$/.test(unescaped) ? parseInt(unescaped, 10) : unescaped;
    });
}

function segmentsToLabel(segments: (string | number)[]): string {
  let out = '$';
  for (const s of segments) {
    out += typeof s === 'number' ? `[${s}]` : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? `.${s}` : `['${s}']`;
  }
  return out;
}

function pickAjv(schema: unknown): Ajv {
  const id =
    schema !== null && typeof schema === 'object' && typeof (schema as Record<string, unknown>).$schema === 'string'
      ? ((schema as Record<string, unknown>).$schema as string)
      : '';
  const options = { allErrors: true, strict: false, verbose: true } as const;
  const ajv = id.includes('2020-12') ? new Ajv2020(options) : id.includes('2019-09') ? new Ajv2019(options) : new Ajv(options);
  addFormats(ajv);
  return ajv;
}

function ruleSnippet(err: ErrorObject): string {
  const params = err.params as Record<string, unknown>;
  const s = JSON.stringify({ [err.keyword]: params.limit ?? params.type ?? params.format ?? params.pattern ?? params.allowedValues ?? params.missingProperty ?? params.additionalProperty ?? params });
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

/** Valida `payload` contra `schema`. Ambos já parseados. */
export function validateAgainstSchema(schema: unknown, payload: unknown): ValidationResult {
  let validate: ValidateFunction;
  try {
    const ajv = pickAjv(schema);
    validate = ajv.compile(schema as object | boolean);
  } catch (e) {
    return { kind: 'schema-error', message: e instanceof Error ? e.message : String(e) };
  }

  const valid = validate(payload);
  if (valid) return { kind: 'valid' };

  const errors = validate.errors ?? [];
  ptBR(errors);

  const issues: ValidationIssue[] = errors.map((err) => {
    let segments = pointerToSegments(err.instancePath);
    // Erros de propriedade obrigatória/adicional apontam para a propriedade em si
    const params = err.params as Record<string, unknown>;
    if (typeof params.missingProperty === 'string') segments = [...segments, params.missingProperty];
    if (typeof params.additionalProperty === 'string') segments = [...segments, params.additionalProperty];
    return {
      path: segments,
      pathLabel: segmentsToLabel(segments),
      keyword: err.keyword,
      message: err.message ?? 'inválido',
      rule: ruleSnippet(err),
      schemaPath: err.schemaPath,
    };
  });

  return { kind: 'invalid', issues };
}
