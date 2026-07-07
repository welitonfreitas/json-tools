import { describe, it, expect } from 'vitest';
import { validateAgainstSchema, pointerToSegments } from './schemaValidator';

const SCHEMA = {
  type: 'object',
  required: ['nome', 'idade'],
  properties: {
    nome: { type: 'string', minLength: 2 },
    idade: { type: 'integer', minimum: 18 },
    email: { type: 'string', format: 'email' },
    itens: { type: 'array', items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string' } } } },
  },
  additionalProperties: false,
};

describe('validateAgainstSchema', () => {
  it('aprova payload válido', () => {
    const r = validateAgainstSchema(SCHEMA, { nome: 'Ana', idade: 30 });
    expect(r).toEqual({ kind: 'valid' });
  });

  it('lista todas as violações com mensagens em pt-BR', () => {
    const r = validateAgainstSchema(SCHEMA, { nome: 'A', idade: 16, email: 'x', extra: 1 });
    expect(r.kind).toBe('invalid');
    if (r.kind !== 'invalid') return;
    const byKeyword = Object.fromEntries(r.issues.map((i) => [i.keyword, i]));
    expect(byKeyword.minLength.pathLabel).toBe('$.nome');
    expect(byKeyword.minimum.pathLabel).toBe('$.idade');
    expect(byKeyword.minimum.message).toBe('deve ser >= 18');
    expect(byKeyword.minLength.message).toContain('caracteres');
    expect(byKeyword.format.pathLabel).toBe('$.email');
    expect(byKeyword.additionalProperties.pathLabel).toBe('$.extra');
  });

  it('required aponta para a propriedade ausente', () => {
    const r = validateAgainstSchema(SCHEMA, { nome: 'Ana' });
    expect(r.kind).toBe('invalid');
    if (r.kind !== 'invalid') return;
    expect(r.issues[0].keyword).toBe('required');
    expect(r.issues[0].pathLabel).toBe('$.idade');
    expect(r.issues[0].path).toEqual(['idade']);
  });

  it('caminhos aninhados em arrays usam índices', () => {
    const r = validateAgainstSchema(SCHEMA, { nome: 'Ana', idade: 30, itens: [{ sku: 'a' }, {}] });
    expect(r.kind).toBe('invalid');
    if (r.kind !== 'invalid') return;
    expect(r.issues[0].pathLabel).toBe('$.itens[1].sku');
    expect(r.issues[0].path).toEqual(['itens', 1, 'sku']);
  });

  it('schema inválido retorna schema-error', () => {
    const r = validateAgainstSchema({ type: 'tipo-que-nao-existe' }, {});
    expect(r.kind).toBe('schema-error');
  });

  it('suporta draft 2020-12 via $schema', () => {
    const schema2020 = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    };
    expect(validateAgainstSchema(schema2020, ['a', 1])).toEqual({ kind: 'valid' });
    const r = validateAgainstSchema(schema2020, [1, 'a']);
    expect(r.kind).toBe('invalid');
  });
});

describe('pointerToSegments', () => {
  it('converte JSON Pointer com escapes e índices', () => {
    expect(pointerToSegments('')).toEqual([]);
    expect(pointerToSegments('/a/0/b~1c/d~0e')).toEqual(['a', 0, 'b/c', 'd~e']);
  });
});
