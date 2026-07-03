import { describe, it, expect } from 'vitest';
import { joltTransform } from './index';

describe('shift', () => {
  it('remapeia caminhos simples', () => {
    const input = { rating: { primary: { value: 3 }, quality: { value: 3, max: 5 } } };
    const spec = [
      {
        operation: 'shift',
        spec: {
          rating: {
            primary: { value: 'Rating' },
            '*': { value: 'SecondaryRatings.&1.Value', max: 'SecondaryRatings.&1.RangeMax' },
          },
        },
      },
    ];
    expect(joltTransform(spec, input)).toEqual({
      Rating: 3,
      SecondaryRatings: { quality: { Value: 3, RangeMax: 5 } },
    });
  });

  it('usa $ para transformar chave em valor', () => {
    const input = { docs: { alpha: 1, beta: 2 } };
    const spec = [{ operation: 'shift', spec: { docs: { '*': { $: 'names[]' } } } }];
    expect(joltTransform(spec, input)).toEqual({ names: ['alpha', 'beta'] });
  });

  it('usa # para valores literais', () => {
    const input = { id: 7 };
    const spec = [{ operation: 'shift', spec: { id: 'ident', '#fixo': 'origem' } }];
    expect(joltTransform(spec, input)).toEqual({ ident: 7, origem: 'fixo' });
  });

  it('atravessa arrays com [&n]', () => {
    const input = { photos: [{ url: 'a.jpg' }, { url: 'b.jpg' }] };
    const spec = [{ operation: 'shift', spec: { photos: { '*': { url: 'imagens[&1].link' } } } }];
    expect(joltTransform(spec, input)).toEqual({ imagens: [{ link: 'a.jpg' }, { link: 'b.jpg' }] });
  });

  it('agrupa com [#n]', () => {
    const input = { itens: { a: { v: 1 }, b: { v: 2 } } };
    const spec = [{ operation: 'shift', spec: { itens: { '*': { v: 'lista[#2].valor', $: 'lista[#2].nome' } } } }];
    expect(joltTransform(spec, input)).toEqual({
      lista: [
        { valor: 1, nome: 'a' },
        { valor: 2, nome: 'b' },
      ],
    });
  });

  it('acumula valores repetidos em array', () => {
    const input = { a: 1, b: 2 };
    const spec = [{ operation: 'shift', spec: { a: 'x', b: 'x' } }];
    expect(joltTransform(spec, input)).toEqual({ x: [1, 2] });
  });

  it('descarta com null e prioriza literal sobre *', () => {
    const input = { keep: 1, drop: 2, other: 3 };
    const spec = [{ operation: 'shift', spec: { drop: null, '*': '&' } }];
    expect(joltTransform(spec, input)).toEqual({ keep: 1, other: 3 });
  });

  it('resolve @ para o valor inteiro e @(n,path) para lookup', () => {
    const input = { user: { name: 'Ana', type: 'admin' } };
    const spec = [{ operation: 'shift', spec: { user: { '@': 'porTipo.@(0,type)' } } }];
    expect(joltTransform(spec, input)).toEqual({ porTipo: { admin: { name: 'Ana', type: 'admin' } } });
  });

  it('suporta alternativas com |', () => {
    const input = { nome: 'x', outro: 'y' };
    const spec = [{ operation: 'shift', spec: { 'nome|name': 'n' } }];
    expect(joltTransform(spec, input)).toEqual({ n: 'x' });
  });
});

describe('default', () => {
  it('preenche valores ausentes sem sobrescrever', () => {
    const input = { a: 1, obj: { x: 10 } };
    const spec = [{ operation: 'default', spec: { a: 99, b: 2, obj: { x: 99, y: 20 } } }];
    expect(joltTransform(spec, input)).toEqual({ a: 1, b: 2, obj: { x: 10, y: 20 } });
  });

  it('aplica * apenas a chaves existentes', () => {
    const input = { itens: { a: {}, b: { tipo: 'especial' } } };
    const spec = [{ operation: 'default', spec: { itens: { '*': { tipo: 'comum' } } } }];
    expect(joltTransform(spec, input)).toEqual({
      itens: { a: { tipo: 'comum' }, b: { tipo: 'especial' } },
    });
  });
});

describe('remove', () => {
  it('remove chaves literais e por padrão', () => {
    const input = { manter: 1, debug_a: 2, debug_b: 3, sub: { debug_x: 4, ok: 5 } };
    const spec = [{ operation: 'remove', spec: { 'debug_*': '', sub: { 'debug_*': '' } } }];
    expect(joltTransform(spec, input)).toEqual({ manter: 1, sub: { ok: 5 } });
  });
});

describe('sort', () => {
  it('ordena chaves recursivamente', () => {
    const input = { b: 1, a: { z: 1, y: 2 } };
    expect(JSON.stringify(joltTransform([{ operation: 'sort' }], input))).toBe('{"a":{"y":2,"z":1},"b":1}');
  });
});

describe('cardinality', () => {
  it('ONE pega o primeiro elemento, MANY embrulha em array', () => {
    const input = { lista: [1, 2, 3], unico: 'x' };
    const spec = [{ operation: 'cardinality', spec: { lista: 'ONE', unico: 'MANY' } }];
    expect(joltTransform(spec, input)).toEqual({ lista: 1, unico: ['x'] });
  });
});

describe('modify', () => {
  it('overwrite aplica funções ao valor atual', () => {
    const input = { nome: '  ana  ', n: '42' };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { nome: '=trim', n: '=toInteger' } },
      { operation: 'modify-overwrite-beta', spec: { nome: '=toUpperCase' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ nome: 'ANA', n: 42 });
  });

  it('concat com referências @', () => {
    const input = { first: 'Ana', last: 'Silva' };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { full: "=concat(@(1,first),' ',@(1,last))" } },
    ];
    expect(joltTransform(spec, input)).toEqual({ first: 'Ana', last: 'Silva', full: 'Ana Silva' });
  });

  it('default só escreve quando ausente', () => {
    const input = { a: 5 };
    const spec = [{ operation: 'modify-default-beta', spec: { a: 99, b: 2 } }];
    expect(joltTransform(spec, input)).toEqual({ a: 5, b: 2 });
  });

  it('size, sum e sort em arrays', () => {
    const input = { ns: [3, 1, 2] };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { total: '=sum(@(1,ns))', qtd: '=size(@(1,ns))', ns: '=sort' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ ns: [1, 2, 3], total: 6, qtd: 3 });
  });
});

describe('erros', () => {
  it('rejeita spec que não é array', () => {
    expect(() => joltTransform({} as never, {})).toThrow(/array de operações/);
  });
  it('rejeita operação desconhecida', () => {
    expect(() => joltTransform([{ operation: 'xyz' }], {})).toThrow(/não suportada/);
  });
});
