// Regressões de fidelidade ao Jolt (Java):
// 1. doubleSum/intSum ignoram argumentos não numéricos (listas, null) em vez de
//    achatar — Math.java soma só o que Objects.toDouble converte.
// 2. Ordem de inserção de chaves (LinkedHashMap): objetos JS reordenam chaves
//    numéricas ("81" antes de "91"), o motor preserva a ordem real.
// Caso real: pipeline de reservas em que dsValorOrigem devia ser "0.00" e o
// grupo "91" devia vir antes do "81" no body final.

import { describe, expect, it } from 'vitest';
import { joltTransform, joltTransformSteps, joltStringify } from './index';

const modifyOnce = (spec: unknown, input: unknown) =>
  joltTransform([{ operation: 'modify-overwrite-beta', spec }], input);

describe('doubleSum/intSum com a semântica de ListFunction do Java', () => {
  it('ignora argumentos que são listas ou ausentes (soma = 0.0)', () => {
    // OutstandingAmount é um ARRAY; ClaimMonetaryCorrection/Interest não existem.
    // Java: applyList([[268179.53], null, null]) → nada converte → 0.0
    const out = modifyOnce(
      { '*': { total: '=doubleSum(@(1,OutstandingAmount), @(1,ClaimMonetaryCorrection), @(1,Interest))' } },
      { r: { OutstandingAmount: [268179.53] } },
    );
    expect(out).toEqual({ r: { OutstandingAmount: [268179.53], total: 0 } });
  });

  it('um único argumento-lista soma os elementos', () => {
    const out = modifyOnce({ '*': { total: '=doubleSum(@(1,valores))' } }, { r: { valores: [1.5, 2, '3.5'] } });
    expect(out).toEqual({ r: { valores: [1.5, 2, '3.5'], total: 7 } });
  });

  it('vários argumentos numéricos somam normalmente', () => {
    const out = modifyOnce(
      { '*': { total: '=doubleSum(@(1,a), @(1,b), @(1,c))' } },
      { r: { a: 100, b: 20.5, c: 3 } },
    );
    expect(out).toEqual({ r: { a: 100, b: 20.5, c: 3, total: 123.5 } });
  });

  it('um único argumento escalar não se aplica (valor original mantido)', () => {
    // ListFunction.applySingle → empty no Java: modify-overwrite mantém o valor
    const out = modifyOnce({ '*': { a: '=doubleSum(@(1,a))' } }, { r: { a: 5 } });
    expect(out).toEqual({ r: { a: 5 } });
  });

  it('intSum trunca elemento a elemento, ignorando não numéricos', () => {
    const out = modifyOnce({ '*': { total: '=intSum(@(1,vals))' } }, { r: { vals: [1.5, 1.5, null, 'x'] } });
    expect(out).toEqual({ r: { vals: [1.5, 1.5, null, 'x'], total: 2 } });
  });
});

describe('ordem de inserção de chaves (LinkedHashMap)', () => {
  const CHAIN = [
    {
      operation: 'shift',
      spec: { items: { '*': { v: 'map.@(1,k)' } } },
    },
    {
      operation: 'shift',
      spec: { map: { '*': 'out[]' } },
    },
  ];
  const INPUT = { items: [{ k: '91', v: 'primeiro' }, { k: '81', v: 'segundo' }] };

  it('iteração com * segue a ordem de inserção, não a numérica do JS', () => {
    // Sem o registro de ordem, o objeto {"91","81"} iteraria como 81, 91
    expect(joltTransform(CHAIN, INPUT)).toEqual({ out: ['primeiro', 'segundo'] });
  });

  it('joltStringify serializa na ordem de inserção', () => {
    const steps = joltTransformSteps(CHAIN, INPUT);
    const mapText = joltStringify(steps[0].output!);
    expect(mapText.indexOf('"91"')).toBeGreaterThan(-1);
    expect(mapText.indexOf('"91"')).toBeLessThan(mapText.indexOf('"81"'));
    // JSON.stringify nativo perderia a ordem
    expect(JSON.parse(mapText)).toEqual({ map: { '91': 'primeiro', '81': 'segundo' } });
  });

  it('sort ordena alfabeticamente mesmo chaves numéricas ("10" antes de "9")', () => {
    const out = joltTransform(
      [
        { operation: 'shift', spec: { items: { '*': { v: 'map.@(1,k)' } } } },
        { operation: 'sort' },
        { operation: 'shift', spec: { map: { '*': 'out[]' } } },
      ],
      { items: [{ k: '9', v: 'nove' }, { k: '10', v: 'dez' }] },
    );
    // Java compareTo: "10" < "9" (lexicográfico)
    expect(out).toEqual({ out: ['dez', 'nove'] });
  });
});

describe('pipeline de reservas (caso real: dsValorOrigem 0.00 e ordem 91 antes de 81)', () => {
  const PAYLOAD = {
    request: {
      body: {
        claimCaseDetail: {
          ClaimCase: {
            ClaimNo: '202601130000087',
            ExternalClaimNo: '01058405910100202',
            ClaimObjectList: [
              {
                ClaimItemList: [
                  {
                    ClaimReserveList: [
                      { ReserveType: '01', OutstandingAmount: 268179.53, ReserveId: 4813510020 },
                    ],
                    CoverageCode: 'M',
                    LOBCode: '1391',
                  },
                  {
                    ClaimReserveList: [
                      { ReserveType: '01', OutstandingAmount: 268179.53, ReserveId: 4813510022 },
                    ],
                    CoverageCode: 'IEA',
                    LOBCode: '1381',
                  },
                ],
              },
            ],
          },
        },
      },
    },
    evento: { cdChaveIntegracao: '202601130000087' },
  };

  const SPEC = [
    {
      operation: 'shift',
      spec: {
        request: {
          body: {
            claimCaseDetail: {
              ClaimCase: {
                ClaimObjectList: {
                  '*': {
                    ClaimItemList: {
                      '*': {
                        ClaimReserveList: {
                          '*': {
                            ReserveType: {
                              'T11|T12|T14|T15|T16|02': null,
                              '*': {
                                '@(2)': 'request.body.&10.ClaimCase.ClaimObjectList[&7].ClaimItemList[&5].ClaimReserveList[&3]',
                              },
                            },
                          },
                        },
                        '*': 'request.body.&6.ClaimCase.ClaimObjectList[&3].ClaimItemList[&1].&',
                      },
                    },
                    '*': 'request.body.&4.ClaimCase.ClaimObjectList[&1].&',
                  },
                },
                '*': 'request.body.&2.ClaimCase.&',
              },
              '*': 'request.body.&1.&',
            },
            '*': 'request.body.&',
          },
          '*': 'request.&',
        },
        '*': '&',
      },
    },
    {
      operation: 'shift',
      spec: {
        request: {
          body: {
            claimCaseDetail: {
              ClaimCase: {
                ClaimObjectList: {
                  '*': {
                    ClaimItemList: {
                      '*': {
                        ClaimReserveList: {
                          '@(1)': 'request.body.&7.ClaimCase.ClaimObjectList[&4].ClaimItemList[]',
                        },
                      },
                    },
                    '*': 'request.body.&4.ClaimCase.ClaimObjectList[&1].&',
                  },
                },
                '*': 'request.body.&2.ClaimCase.&',
              },
              '*': 'request.body.&1.&',
            },
            '*': 'request.body.&',
          },
          '*': 'request.&',
        },
        '*': '&',
      },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: {
        request: {
          body: {
            claimCaseDetail: {
              ClaimCase: {
                ClaimObjectList: {
                  '*': {
                    ClaimItemList: {
                      '*': {
                        ShortLOB: '=substring(@(1,LOBCode),2,4)',
                        ClaimReserveList: {
                          '*': {
                            num_sinistro: '=substring(@(7,ExternalClaimNo),8,17)',
                            num_sinuss: '@(7,ClaimNo)',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        props: {
          cdIdentificadorDestino: 'num_sinistro;cod_ramo;num_sinuss',
          dsIdentificadorDestino:
            'convert(varchar(20), convert(decimal(18,2), SUM(vlr_estiorig))) as dsValorDestino',
        },
      },
    },
    {
      operation: 'shift',
      spec: {
        request: {
          body: {
            claimCaseDetail: {
              ClaimCase: {
                ClaimObjectList: {
                  '*': {
                    ClaimItemList: {
                      '*': {
                        ShortLOB: 'ClaimReserveList.@(1,ShortLOB).&',
                        ClaimReserveList: {
                          '*': {
                            OutstandingAmount: 'ClaimReserveList.@(3,ShortLOB).&[]',
                            ClaimMonetaryCorrection: 'ClaimReserveList.@(3,ShortLOB).&[]',
                            Interest: 'ClaimReserveList.@(3,ShortLOB).&[]',
                            num_sinistro: 'ClaimReserveList.@(3,ShortLOB).&',
                            num_sinuss: 'ClaimReserveList.@(3,ShortLOB).&',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '*': '&',
      },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: {
        ClaimReserveList: {
          '*': {
            OutstandingAmount: '=doubleSum(@(1,OutstandingAmount), @(1,ClaimMonetaryCorrection), @(1,Interest))',
            num_sinistro: '=firstElement(@(1,&))',
            num_sinuss: '=firstElement(@(1,&))',
            ShortLOB: '=firstElement(@(1,&))',
            filtro: "=concat(@(1,num_sinistro), ';', @(1,ShortLOB), ';', @(1,num_sinuss))",
          },
        },
      },
    },
    {
      operation: 'shift',
      spec: {
        ClaimReserveList: { '*': { '@': 'ShortLOB[]' } },
        '*': '&',
      },
    },
    {
      operation: 'shift',
      spec: {
        pipelineSpec: {
          idEventoConsumidores: 'props.&',
          idEventoConsumidorAtributo: 'props.&',
        },
        props: {
          cdIdentificadorDestino: 'props.&',
          dsIdentificadorDestino: 'props.&',
        },
        evento: { cdChaveIntegracao: 'props.&' },
        ShortLOB: {
          '*': {
            OutstandingAmount: 'body.dsValorOrigem',
            filtro: 'body.&',
          },
        },
      },
    },
    {
      operation: 'cardinality',
      spec: {
        props: { cdDocumento: 'ONE', filtro: 'ONE' },
        body: { filtro: 'MANY', dsValorOrigem: 'MANY' },
      },
    },
    {
      operation: 'shift',
      spec: {
        '*': '&',
        body: {
          filtro: { '*': 'body[#1].filtro' },
          dsValorOrigem: { '*': 'body[#1].dsValorOrigem' },
        },
      },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: {
        body: {
          '*': {
            cdDocumentoAuditoria: '@(1,filtro)',
            idEventoConsumidores: '@(3,props.&)',
            idEventoConsumidorAtributo: '@(3,props.&)',
            cdIdentificadorDestino: '@(3,props.&)',
            dsIdentificadorDestino: '@(3,props.&)',
            cdChaveIntegracao: '@(3,props.&)',
            dsValorOrigem: '=divideAndRound(2, @(1,&),1)',
            temp_str: "=concat(@(1,dsValorOrigem), '.')",
          },
        },
      },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: { body: { '*': { partes: "=split('\\.', @(1,temp_str))" } } },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: { body: { '*': { decimal_pad: "=rightPad(@(1,partes[1]), 2, '0')" } } },
    },
    {
      operation: 'modify-overwrite-beta',
      spec: {
        body: {
          '*': {
            decimal_final: '=substring(@(1,decimal_pad), 0, 2)',
            dsValorOrigem: "=concat(@(1,partes[0]), '.', @(1,decimal_final))",
          },
        },
      },
    },
    {
      operation: 'remove',
      spec: {
        props: '',
        body: {
          '*': {
            filtro: '',
            valor_arredondado: '',
            temp_str: '',
            partes: '',
            decimal_pad: '',
            decimal_final: '',
            dsValorOrigem_arredondando: '',
          },
        },
      },
    },
  ];

  it('replica o resultado do Jolt real (valores e ordem)', () => {
    const out = joltTransform(SPEC, PAYLOAD);
    expect(out).toEqual({
      body: [
        {
          dsValorOrigem: '0.00',
          cdDocumentoAuditoria: '910100202;91;202601130000087',
          cdIdentificadorDestino: 'num_sinistro;cod_ramo;num_sinuss',
          dsIdentificadorDestino:
            'convert(varchar(20), convert(decimal(18,2), SUM(vlr_estiorig))) as dsValorDestino',
          cdChaveIntegracao: '202601130000087',
        },
        {
          dsValorOrigem: '0.00',
          cdDocumentoAuditoria: '910100202;81;202601130000087',
          cdIdentificadorDestino: 'num_sinistro;cod_ramo;num_sinuss',
          dsIdentificadorDestino:
            'convert(varchar(20), convert(decimal(18,2), SUM(vlr_estiorig))) as dsValorDestino',
          cdChaveIntegracao: '202601130000087',
        },
      ],
    });
  });
});
