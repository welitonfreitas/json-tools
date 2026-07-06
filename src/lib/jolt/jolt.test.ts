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

  it('divideAndRound, subtrações e pads', () => {
    const input = { total: 10, qtd: 3, cod: '42' };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: {
          media: '=divideAndRound(2,@(1,total),@(1,qtd))',
          resto: '=intSubtract(@(1,total),@(1,qtd))',
          cod: "=leftPad(@(1,cod),5,'0')",
        },
      },
    ];
    expect(joltTransform(spec, input)).toEqual({ total: 10, qtd: 3, cod: '00042', media: 3.33, resto: 7 });
  });

  it('aliases oficiais toUpper/toLower', () => {
    const input = { a: 'abc', b: 'XYZ' };
    const spec = [{ operation: 'modify-overwrite-beta', spec: { a: '=toUpper', b: '=toLower' } }];
    expect(joltTransform(spec, input)).toEqual({ a: 'ABC', b: 'xyz' });
  });

  it('size, sum e sort em arrays', () => {
    const input = { ns: [3, 1, 2] };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { total: '=sum(@(1,ns))', qtd: '=size(@(1,ns))', ns: '=sort' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ ns: [1, 2, 3], total: 6, qtd: 3 });
  });
});

describe('modify: casos avançados', () => {
  it('cria contêineres ausentes para chaves literais com spec aninhada', () => {
    const input = { a: 1 };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { props: { x: 'valor', y: '=toInteger(@(2,a))' } } },
    ];
    expect(joltTransform(spec, input)).toEqual({ a: 1, props: { x: 'valor', y: 1 } });
  });

  it('não cria contêineres para chaves curinga', () => {
    const input = { a: 1 };
    const spec = [{ operation: 'modify-overwrite-beta', spec: { '*': { x: 'v' }, 'pre*': { y: 'w' } } }];
    expect(joltTransform(spec, input)).toEqual({ a: 1 });
  });

  it('resolve & dentro de caminhos @ (ex.: @(1,&))', () => {
    const input = { grupo: { OutstandingAmount: [10, 20], nome: ['a'] } };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: { grupo: { OutstandingAmount: '=doubleSum(@(1,&))', nome: '=firstElement(@(1,&))' } },
      },
    ];
    expect(joltTransform(spec, input)).toEqual({ grupo: { OutstandingAmount: 30, nome: 'a' } });
  });

  it('resolve & em caminhos @ que atravessam outros objetos (ex.: @(3,props.&))', () => {
    const input = { props: { chave: 'K' }, body: [{ x: 1 }] };
    const spec = [{ operation: 'modify-overwrite-beta', spec: { body: { '*': { chave: '@(3,props.&)' } } } }];
    expect(joltTransform(spec, input)).toEqual({ props: { chave: 'K' }, body: [{ x: 1, chave: 'K' }] });
  });

  it('indexa arrays com colchetes em caminhos @ (ex.: partes[1])', () => {
    const input = { partes: ['95000', ''], alvo: 'x' };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: { alvo: "=rightPad(@(1,partes[1]), 2, '0')", primeiro: '@(1,partes[0])' },
      },
    ];
    expect(joltTransform(spec, input)).toEqual({ partes: ['95000', ''], alvo: '00', primeiro: '95000' });
  });

  it('split segue a semântica do Java: descarta strings vazias no final', () => {
    const input = { a: '.', b: '95000.0.', c: 'x.y', d: '..meio..' };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: {
          a: "=split('\\.', @(1,&))",
          b: "=split('\\.', @(1,&))",
          c: "=split('\\.', @(1,&))",
          d: "=split('\\.', @(1,&))",
        },
      },
    ];
    expect(joltTransform(spec, input)).toEqual({
      a: [],
      b: ['95000', '0'],
      c: ['x', 'y'],
      d: ['', '', 'meio'],
    });
  });

  it('funções double concatenam como Double do Java (95000 → "95000.0")', () => {
    const input = { valor: 95000 };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: { media: '=divideAndRound(2,@(1,valor),1)', texto: "=concat(@(1,media), '.')" },
      },
    ];
    // O valor persiste como número puro; a concatenação dentro da operação vê "95000.0"
    expect(joltTransform(spec, input)).toEqual({ valor: 95000, media: 95000, texto: '95000.0.' });
  });

  it('encadeia divideAndRound, split, rightPad e substring para formatar decimais', () => {
    const input = { valor: 95000 };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: { ds: '=divideAndRound(2, @(1,valor), 1)', temp: "=concat(@(1,ds), '.')" },
      },
      { operation: 'modify-overwrite-beta', spec: { partes: "=split('\\.', @(1,temp))" } },
      { operation: 'modify-overwrite-beta', spec: { pad: "=rightPad(@(1,partes[1]), 2, '0')" } },
      { operation: 'modify-overwrite-beta', spec: { final: "=concat(@(1,partes[0]), '.', @(1,pad))" } },
      { operation: 'remove', spec: { temp: '', partes: '', pad: '', ds: '' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ valor: 95000, final: '95000.00' });
  });

  it('valor ausente atravessa a cadeia de formatação virando "." (não ".00")', () => {
    const input = { outro: 1 };
    const spec = [
      {
        operation: 'modify-overwrite-beta',
        spec: { ds: '=divideAndRound(2, @(1,ausente), 1)', temp: "=concat(@(1,ds), '.')" },
      },
      { operation: 'modify-overwrite-beta', spec: { partes: "=split('\\.', @(1,temp))" } },
      { operation: 'modify-overwrite-beta', spec: { pad: "=rightPad(@(1,partes[1]), 2, '0')" } },
      {
        operation: 'modify-overwrite-beta',
        spec: { fin: '=substring(@(1,pad), 0, 2)', ds: "=concat(@(1,partes[0]), '.', @(1,fin))" },
      },
      { operation: 'remove', spec: { temp: '', partes: '', pad: '', fin: '' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ outro: 1, ds: '.' });
  });

  it('modify posterior enxerga escritas de chaves anteriores da mesma operação', () => {
    const input = { a: 2 };
    const spec = [
      { operation: 'modify-overwrite-beta', spec: { b: '=sum(@(1,a),1)', c: '=sum(@(1,b),1)' } },
    ];
    expect(joltTransform(spec, input)).toEqual({ a: 2, b: 3, c: 4 });
  });
});

describe('shift: casos avançados', () => {
  it('agrupa por valor com @ no RHS e acumula em arrays', () => {
    const input = {
      itens: [
        { tipo: 'A', valor: 1 },
        { tipo: 'B', valor: 2 },
        { tipo: 'A', valor: 3 },
      ],
    };
    const spec = [{ operation: 'shift', spec: { itens: { '*': { valor: 'porTipo.@(1,tipo).valores[]' } } } }];
    expect(joltTransform(spec, input)).toEqual({ porTipo: { A: { valores: [1, 3] }, B: { valores: [2] } } });
  });

  it('resolve & dentro de caminhos @ no RHS', () => {
    const input = { itens: { chaveA: { ref: { chaveA: 'destino1' } } } };
    const spec = [{ operation: 'shift', spec: { itens: { '*': { ref: 'saida.@(0,&1)' } } } }];
    expect(joltTransform(spec, input)).toEqual({ saida: { destino1: { chaveA: 'destino1' } } });
  });

  it('espalha arrays paralelos com [#1] preservando os pares', () => {
    const input = { filtro: ['f1', 'f2'], valor: [10, 20] };
    const spec = [
      { operation: 'shift', spec: { filtro: { '*': 'body[#1].filtro' }, valor: { '*': 'body[#1].valor' } } },
    ];
    expect(joltTransform(spec, input)).toEqual({
      body: [
        { filtro: 'f1', valor: 10 },
        { filtro: 'f2', valor: 20 },
      ],
    });
  });

  it('emite o objeto inteiro com a chave @ para dentro de array', () => {
    const input = { grupos: { a: { x: 1 }, b: { x: 2 } } };
    const spec = [{ operation: 'shift', spec: { grupos: { '*': { '@': 'lista[]' } } } }];
    expect(joltTransform(spec, input)).toEqual({ lista: [{ x: 1 }, { x: 2 }] });
  });
});

describe('cardinality: casos de canto', () => {
  it('ignora chaves ausentes sem erro', () => {
    const input = { body: { filtro: ['a'] } };
    const spec = [
      { operation: 'cardinality', spec: { props: { cdDocumento: 'ONE' }, body: { filtro: 'MANY', outro: 'MANY' } } },
    ];
    expect(joltTransform(spec, input)).toEqual({ body: { filtro: ['a'] } });
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
