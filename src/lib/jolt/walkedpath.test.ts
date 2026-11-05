// Regressões de fidelidade ao WalkedPath do Jolt (Java):
// 1. Shiftr.transform e Modifier.transform empilham a raiz DUAS vezes (uma no
//    transform, outra quando a spec raiz se aplica) — @(n)/& que subiriam além
//    da raiz na contagem simples alcançam a raiz, como em "@(3,x)" sob "a.*".
// 2. Açúcar "@N" (só dígitos) = "@(N,)" — sobe N níveis, não é o caminho "N".
// 3. join é ArgDrivenListFunction: 1º arg separador, demais args formam a lista.
// Caso real: pipeline CCM em que "corpo": {"*": {"@(3,campo)": ...}} lia campos
// da raiz e o motor parava com "Referência a 3 níveis acima".

import { describe, expect, it } from 'vitest';
import { joltTransform } from './index';

describe('raiz duplicada no WalkedPath (shift)', () => {
  it('@(3,x) dentro de lista.* alcança a raiz', () => {
    const out = joltTransform(
      [
        {
          operation: 'shift',
          spec: {
            corpo: {
              '*': {
                '*': 'corpo[&1].&',
                '@(3,extra)': 'corpo[&1].extra',
              },
            },
          },
        },
      ],
      { corpo: [{ a: 1 }], extra: 'raiz' },
    );
    expect(out).toEqual({ corpo: [{ a: 1, extra: 'raiz' }] });
  });

  it('@(2,x) um nível abaixo da raiz continua funcionando', () => {
    const out = joltTransform(
      [{ operation: 'shift', spec: { item: { '@(2,extra)': 'saida' } } }],
      { item: { a: 1 }, extra: 'raiz' },
    );
    expect(out).toEqual({ saida: 'raiz' });
  });
});

describe('açúcar @N (dígitos = níveis acima)', () => {
  it('"@2" como chave de spec sobe 2 níveis (idioma de filtro por valor)', () => {
    // campo: { "null": { "@2": "remover" } } — @2 = o objeto que contém o campo
    const out = joltTransform(
      [
        {
          operation: 'shift',
          spec: {
            lista: {
              '*': {
                campo: {
                  'null': { '@2': 'removidos[]' },
                  '*': { '@(2,campo)': 'mantidos[]' },
                },
              },
            },
          },
        },
      ],
      { lista: [{ campo: 'null', id: 1 }, { campo: 'x@y.z', id: 2 }] },
    );
    expect(out).toEqual({ removidos: [{ campo: 'null', id: 1 }], mantidos: ['x@y.z'] });
  });
});

describe('join no estilo ArgDrivenListFunction do Java', () => {
  const modify = (spec: unknown, input: unknown) =>
    joltTransform([{ operation: 'modify-overwrite-beta', spec }], input);

  it('vários argumentos após o separador formam a lista', () => {
    const out = modify({ r: "=join('-',@(1,a),@(1,b))" }, { a: 'claimRegulation', b: 'VIDA' }) as any;
    expect(out.r).toBe('claimRegulation-VIDA');
  });

  it('argumento único que é lista é usado como está', () => {
    const out = modify({ r: "=join('<br>',@(1,linhas))" }, { linhas: ['a', 'b', 'c'] }) as any;
    expect(out.r).toBe('a<br>b<br>c');
  });

  it('elementos null/ausentes são pulados', () => {
    const out = modify({ r: "=join('-',@(1,a),@(1,naoExiste),@(1,b))" }, { a: 'x', b: 'y' }) as any;
    // Strings.join do Java anexa o separador após posições não-finais preenchidas
    expect(out.r).toBe('x-y');
  });
});
