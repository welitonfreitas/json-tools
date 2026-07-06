// Valida a spec de filtro de ClaimReserveList por ReserveType (idioma de filtro
// do Jolt: casar o valor do campo como chave; a mais específica vence e null descarta).
import { describe, it, expect } from 'vitest';
import { joltTransform } from './index';

const FILTER_SPEC = JSON.parse(`[
  {
    "operation": "shift",
    "spec": {
      "request": {
        "body": {
          "ClaimCase": {
            "ClaimObjectList": {
              "*": {
                "ClaimItemList": {
                  "*": {
                    "ClaimReserveList": {
                      "*": {
                        "ReserveType": {
                          "T11|T12|T14|T15|T16|02": null,
                          "*": {
                            "@(2)": "request.body.ClaimCase.ClaimObjectList[&7].ClaimItemList[&5].ClaimReserveList[]"
                          }
                        }
                      }
                    },
                    "*": "request.body.ClaimCase.ClaimObjectList[&3].ClaimItemList[&1].&"
                  }
                },
                "*": "request.body.ClaimCase.ClaimObjectList[&1].&"
              }
            },
            "*": "request.body.ClaimCase.&"
          },
          "claimCaseDetail|dadosProcessClaim": {
            "ClaimCase": {
              "ClaimObjectList": {
                "*": {
                  "ClaimItemList": {
                    "*": {
                      "ClaimReserveList": {
                        "*": {
                          "ReserveType": {
                            "T11|T12|T14|T15|T16|02": null,
                            "*": {
                              "@(2)": "request.body.&10.ClaimCase.ClaimObjectList[&7].ClaimItemList[&5].ClaimReserveList[]"
                            }
                          }
                        }
                      },
                      "*": "request.body.&6.ClaimCase.ClaimObjectList[&3].ClaimItemList[&1].&"
                    }
                  },
                  "*": "request.body.&4.ClaimCase.ClaimObjectList[&1].&"
                }
              },
              "*": "request.body.&2.ClaimCase.&"
            },
            "*": "request.body.&1.&"
          },
          "*": "request.body.&"
        },
        "*": "request.&"
      },
      "*": "&"
    }
  }
]`);

// Segunda operação: remove os ClaimItemList que ficaram sem nenhuma reserva após o
// primeiro filtro (filtro por presença de chave: o item só é emitido se tiver
// ClaimReserveList — "@(1)" recupera o item inteiro; [] compacta o array).
const ITEM_FILTER_OP = JSON.parse(`{
  "operation": "shift",
  "spec": {
    "request": {
      "body": {
        "ClaimCase": {
          "ClaimObjectList": {
            "*": {
              "ClaimItemList": {
                "*": {
                  "ClaimReserveList": {
                    "@(1)": "request.body.ClaimCase.ClaimObjectList[&4].ClaimItemList[]"
                  }
                }
              },
              "*": "request.body.ClaimCase.ClaimObjectList[&1].&"
            }
          },
          "*": "request.body.ClaimCase.&"
        },
        "claimCaseDetail|dadosProcessClaim": {
          "ClaimCase": {
            "ClaimObjectList": {
              "*": {
                "ClaimItemList": {
                  "*": {
                    "ClaimReserveList": {
                      "@(1)": "request.body.&7.ClaimCase.ClaimObjectList[&4].ClaimItemList[]"
                    }
                  }
                },
                "*": "request.body.&4.ClaimCase.ClaimObjectList[&1].&"
              }
            },
            "*": "request.body.&2.ClaimCase.&"
          },
          "*": "request.body.&1.&"
        },
        "*": "request.body.&"
      },
      "*": "request.&"
    },
    "*": "&"
  }
}`);

const FULL_FILTER_SPEC = [...(FILTER_SPEC as unknown[]), ITEM_FILTER_OP];

const input = {
  request: {
    body: {
      coberturaAlterada: [
        { ReserveType: '01', CoverageCode: 'M' },
        { ReserveType: 'T11', CoverageCode: 'MCJ' },
      ],
      ClaimCase: {
        ClaimNo: '202501090002792',
        ClaimObjectList: [
          {
            ObjectId: 11207591404,
            ClaimItemList: [
              {
                CoverageCode: 'M',
                ClaimReserveList: [
                  { ReserveType: '01', ReserveId: 1, OutstandingAmount: 95000 },
                  { ReserveType: 'T11', ReserveId: 2, OutstandingAmount: 100 },
                  { ReserveType: '02', ReserveId: 3, OutstandingAmount: 200 },
                ],
              },
            ],
          },
        ],
      },
      claimCaseDetail: {
        CaseStatus: '08',
        ClaimCase: {
          ExternalClaimNo: '01001408930103778',
          ClaimObjectList: [
            {
              ClaimItemList: [
                {
                  CIRModality: '177I',
                  ClaimReserveList: [
                    { ReserveType: '02', ReserveId: 4 },
                    { ReserveType: '01', ReserveId: 5 },
                  ],
                },
                {
                  CIRModality: '179I',
                  ClaimReserveList: [{ ReserveType: 'T15', ReserveId: 6 }],
                },
              ],
            },
          ],
        },
      },
      dadosProcessClaim: {
        ClaimCase: {
          ClaimObjectList: [
            {
              ClaimItemList: [
                {
                  CoverageCode: 'MCJ',
                  ClaimReserveList: [
                    { ReserveType: 'T12', ReserveId: 7 },
                    { ReserveType: 'T16', ReserveId: 8 },
                  ],
                },
              ],
            },
          ],
        },
      },
      uniqueId: '2026070100000636',
    },
  },
  evento: { tpEvento: 'aberturaSinistro' },
};

describe('filtro de ClaimReserveList por ReserveType', () => {
  const result = joltTransform(FILTER_SPEC, input) as typeof input;

  it('mantém apenas reservas com ReserveType fora da lista bloqueada', () => {
    const reservas = result.request.body.ClaimCase.ClaimObjectList[0].ClaimItemList[0].ClaimReserveList;
    expect(reservas).toEqual([{ ReserveType: '01', ReserveId: 1, OutstandingAmount: 95000 }]);
  });

  it('filtra também em claimCaseDetail preservando os demais campos', () => {
    const detail = result.request.body.claimCaseDetail;
    expect(detail.CaseStatus).toBe('08');
    expect(detail.ClaimCase.ExternalClaimNo).toBe('01001408930103778');
    const itens = detail.ClaimCase.ClaimObjectList[0].ClaimItemList;
    expect(itens[0].CIRModality).toBe('177I');
    expect(itens[0].ClaimReserveList).toEqual([{ ReserveType: '01', ReserveId: 5 }]);
    // Item cujas reservas foram todas filtradas: mantém os demais campos, sem ClaimReserveList
    expect(itens[1].CIRModality).toBe('179I');
    expect(itens[1]).not.toHaveProperty('ClaimReserveList');
  });

  it('remove ClaimReserveList inteiro quando todas as reservas são bloqueadas', () => {
    const item = result.request.body.dadosProcessClaim.ClaimCase.ClaimObjectList[0].ClaimItemList[0];
    expect(item.CoverageCode).toBe('MCJ');
    expect(item).not.toHaveProperty('ClaimReserveList');
  });

  it('preserva o restante do payload intacto', () => {
    expect(result.request.body.coberturaAlterada).toEqual(input.request.body.coberturaAlterada);
    expect(result.request.body.uniqueId).toBe('2026070100000636');
    expect(result.request.body.ClaimCase.ClaimNo).toBe('202501090002792');
    expect(result.request.body.ClaimCase.ClaimObjectList[0].ObjectId).toBe(11207591404);
    expect(result.evento).toEqual({ tpEvento: 'aberturaSinistro' });
  });

  it('compõe com as operações seguintes da cadeia (filtro primeiro)', () => {
    const chained = [
      ...FILTER_SPEC,
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
                          ClaimReserveList: {
                            '*': { num_sinistro_aux1: '=substring(@(7,ExternalClaimNo),0,10)' },
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
      },
    ];
    const out = joltTransform(chained, input) as typeof input & {
      request: { body: { claimCaseDetail: { ClaimCase: { ClaimObjectList: { ClaimItemList: { ClaimReserveList: Record<string, unknown>[] }[] }[] } } } };
    };
    const reservas = out.request.body.claimCaseDetail.ClaimCase.ClaimObjectList[0].ClaimItemList[0].ClaimReserveList;
    expect(reservas).toEqual([{ ReserveType: '01', ReserveId: 5, num_sinistro_aux1: '0100140893' }]);
  });

  it('bloqueia exatamente T11, T12, T14, T15, T16 e 02', () => {
    const build = (tipo: string) => ({
      request: {
        body: {
          claimCaseDetail: {
            ClaimCase: {
              ClaimObjectList: [{ ClaimItemList: [{ ClaimReserveList: [{ ReserveType: tipo, ReserveId: 9 }] }] }],
            },
          },
        },
      },
    });
    const survives = (tipo: string): boolean => {
      const out = joltTransform(FILTER_SPEC, build(tipo)) as ReturnType<typeof build> | null;
      const item = out?.request?.body?.claimCaseDetail?.ClaimCase?.ClaimObjectList?.[0]?.ClaimItemList?.[0];
      return item !== undefined && 'ClaimReserveList' in item;
    };
    for (const bloqueado of ['T11', 'T12', 'T14', 'T15', 'T16', '02']) {
      expect(survives(bloqueado), `${bloqueado} deveria ser filtrado`).toBe(false);
    }
    for (const mantido of ['01', '03', 'T13', 'T10', '021']) {
      expect(survives(mantido), `${mantido} deveria ser mantido`).toBe(true);
    }
  });
});

describe('filtro em cascata: remove ClaimItemList sem reservas restantes', () => {
  const result = joltTransform(FULL_FILTER_SPEC, input) as typeof input;

  it('remove o item cujas reservas foram todas bloqueadas', () => {
    // claimCaseDetail tinha 2 itens: 177I (reserva 01 mantida) e 179I (só T15, bloqueada)
    const itens = result.request.body.claimCaseDetail.ClaimCase.ClaimObjectList[0].ClaimItemList;
    expect(itens).toHaveLength(1);
    expect(itens[0].CIRModality).toBe('177I');
    expect(itens[0].ClaimReserveList).toEqual([{ ReserveType: '01', ReserveId: 5 }]);
  });

  it('mantém itens que ainda têm reservas, com todos os campos', () => {
    const itens = result.request.body.ClaimCase.ClaimObjectList[0].ClaimItemList;
    expect(itens).toHaveLength(1);
    expect(itens[0].CoverageCode).toBe('M');
    expect(itens[0].ClaimReserveList).toEqual([{ ReserveType: '01', ReserveId: 1, OutstandingAmount: 95000 }]);
  });

  it('estrutura sem nenhum item restante desaparece em cascata', () => {
    // dadosProcessClaim só tinha um item, com reservas T12/T16 (todas bloqueadas)
    expect(result.request.body).not.toHaveProperty('dadosProcessClaim');
  });

  it('preserva o restante do payload e os campos dos níveis superiores', () => {
    expect(result.request.body.claimCaseDetail.CaseStatus).toBe('08');
    expect(result.request.body.claimCaseDetail.ClaimCase.ExternalClaimNo).toBe('01001408930103778');
    expect(result.request.body.ClaimCase.ClaimNo).toBe('202501090002792');
    expect(result.request.body.ClaimCase.ClaimObjectList[0].ObjectId).toBe(11207591404);
    expect(result.request.body.coberturaAlterada).toEqual(input.request.body.coberturaAlterada);
    expect(result.request.body.uniqueId).toBe('2026070100000636');
    expect(result.evento).toEqual({ tpEvento: 'aberturaSinistro' });
  });

  it('compacta o array preservando a ordem quando um item do meio é removido', () => {
    const trioInput = {
      request: {
        body: {
          claimCaseDetail: {
            ClaimCase: {
              ClaimObjectList: [
                {
                  ObjectId: 1,
                  ClaimItemList: [
                    { CoverageCode: 'A', ClaimReserveList: [{ ReserveType: '01', ReserveId: 1 }] },
                    { CoverageCode: 'B', ClaimReserveList: [{ ReserveType: 'T11', ReserveId: 2 }] },
                    { CoverageCode: 'C', ClaimReserveList: [{ ReserveType: '03', ReserveId: 3 }] },
                  ],
                },
              ],
            },
          },
        },
      },
    };
    const out = joltTransform(FULL_FILTER_SPEC, trioInput) as typeof trioInput;
    const itens = out.request.body.claimCaseDetail.ClaimCase.ClaimObjectList[0].ClaimItemList;
    expect(itens.map((i) => i.CoverageCode)).toEqual(['A', 'C']);
    expect(out.request.body.claimCaseDetail.ClaimCase.ClaimObjectList[0].ObjectId).toBe(1);
  });
});
