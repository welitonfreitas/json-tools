// Teste de integração baseado numa spec real de 13 operações (caso de sinistro),
// cobrindo: @(n,path) profundo em modify, & dentro de caminhos @, criação de
// contêineres ausentes em modify, agrupamento por valor com @ no RHS de shift,
// acumulação em arrays, cardinality MANY, espalhamento com [#1] e remove final.
import { describe, it, expect } from 'vitest';
import { joltTransform, joltTransformSteps } from './index';

const input = JSON.parse(`{
  "request": { "body": { "claimCaseDetail": { "ClaimCase": {
    "ExternalClaimNo": "01001408930103778",
    "ClaimNo": "202501090002792",
    "ClaimObjectList": [ { "ClaimItemList": [
      { "CIRModality": "177I", "ClaimReserveList": [ { "OutstandingAmount": 95000 } ] },
      { "CIRModality": "179I", "ClaimReserveList": [ { "OutstandingAmount": 95000 } ] }
    ] } ]
  } } } },
  "evento": { "cdChaveIntegracao": "chave-123" }
}`);

const spec = JSON.parse(`[
  { "operation": "modify-overwrite-beta", "spec": {
    "request": { "body": { "claimCaseDetail": { "ClaimCase": { "ClaimObjectList": { "*": { "ClaimItemList": { "*": { "ClaimReserveList": { "*": {
      "num_sinistro_aux1": "=substring(@(7,ExternalClaimNo),0,10)",
      "num_sinistro_aux2": "=substring(@(7,ExternalClaimNo),11,17)",
      "num_sinistro_original": "@(7,ClaimNo)"
    } } } } } } } } } },
    "props": { "cdIdentificadorDestino": "cir_num_sinistro;cir_cobertura", "dsIdentificadorDestino": "sql..." }
  } },
  { "operation": "modify-default-beta", "spec": {
    "request": { "body": { "claimCaseDetail": { "ClaimCase": { "ClaimObjectList": { "*": { "ClaimItemList": { "*": { "ClaimReserveList": { "*": {
      "num_sinistro": "=concat(@(1,num_sinistro_aux1),'',@(1,num_sinistro_aux2))"
    } } } } } } } } } }
  } },
  { "operation": "shift", "spec": {
    "request": { "body": { "claimCaseDetail": { "ClaimCase": { "ClaimObjectList": { "*": { "ClaimItemList": { "*": {
      "CIRModality": "ClaimReserveList.@(1,CIRModality).cobertura",
      "ClaimReserveList": { "*": {
        "OutstandingAmount": "ClaimReserveList.@(3,CIRModality).OutstandingAmount[]",
        "num_sinistro": "ClaimReserveList.@(3,CIRModality).num_sinistro",
        "num_sinistro_original": "ClaimReserveList.@(3,CIRModality).&"
      } }
    } } } } } } } },
    "*": "&"
  } },
  { "operation": "modify-overwrite-beta", "spec": { "ClaimReserveList": { "*": {
    "OutstandingAmount": "=doubleSum(@(1,&))",
    "num_sinistro": "=firstElement(@(1,&))",
    "num_sinistro_original": "=firstElement(@(1,&))",
    "cobertura": "=firstElement(@(1,&))",
    "filtro": "=concat(@(1,num_sinistro), ';', @(1,cobertura))"
  } } } },
  { "operation": "shift", "spec": { "ClaimReserveList": { "*": { "@": "cobertura[]" } }, "*": "&" } },
  { "operation": "shift", "spec": {
    "pipelineSpec": { "idEventoConsumidores": "props.&", "idEventoConsumidorAtributo": "props.&" },
    "props": { "cdIdentificadorDestino": "props.&", "dsIdentificadorDestino": "props.&" },
    "evento": { "cdChaveIntegracao": "props.&" },
    "cobertura": { "*": { "OutstandingAmount": "body.dsValorOrigem", "filtro": "body.&" } }
  } },
  { "operation": "cardinality", "spec": { "props": { "cdDocumento": "ONE", "filtro": "ONE" }, "body": { "filtro": "MANY", "dsValorOrigem": "MANY" } } },
  { "operation": "shift", "spec": { "*": "&", "body": { "filtro": { "*": "body[#1].filtro" }, "dsValorOrigem": { "*": "body[#1].dsValorOrigem" } } } },
  { "operation": "modify-overwrite-beta", "spec": { "body": { "*": {
    "cdDocumentoAuditoria": "@(1,filtro)",
    "idEventoConsumidores": "@(3,props.&)",
    "idEventoConsumidorAtributo": "@(3,props.&)",
    "cdIdentificadorDestino": "@(3,props.&)",
    "dsIdentificadorDestino": "@(3,props.&)",
    "cdChaveIntegracao": "@(3,props.&)",
    "dsValorOrigem": "=divideAndRound(2, @(1,&),1)",
    "temp_str": "=concat(@(1,dsValorOrigem), '.')"
  } } } },
  { "operation": "modify-overwrite-beta", "spec": { "body": { "*": { "partes": "=split('\\\\.', @(1,temp_str))" } } } },
  { "operation": "modify-overwrite-beta", "spec": { "body": { "*": { "decimal_pad": "=rightPad(@(1,partes[1]), 2, '0')" } } } },
  { "operation": "modify-overwrite-beta", "spec": { "body": { "*": {
    "decimal_final": "=substring(@(1,decimal_pad), 0, 2)",
    "dsValorOrigem": "=concat(@(1,partes[0]), '.', @(1,decimal_final))"
  } } } },
  { "operation": "remove", "spec": { "props": "", "body": { "*": { "filtro": "", "valor_arredondado": "", "temp_str": "", "partes": "", "decimal_pad": "", "decimal_final": "", "dsValorOrigem_arredondando": "" } } } }
]`);

describe('integração: spec real de sinistro (13 operações)', () => {
  it('produz o resultado esperado de ponta a ponta', () => {
    expect(joltTransform(spec, input)).toEqual({
      body: [
        {
          dsValorOrigem: '95000.00',
          cdDocumentoAuditoria: '0100140893103778;177I',
          cdIdentificadorDestino: 'cir_num_sinistro;cir_cobertura',
          dsIdentificadorDestino: 'sql...',
          cdChaveIntegracao: 'chave-123',
        },
        {
          dsValorOrigem: '95000.00',
          cdDocumentoAuditoria: '0100140893103778;179I',
          cdIdentificadorDestino: 'cir_num_sinistro;cir_cobertura',
          dsIdentificadorDestino: 'sql...',
          cdChaveIntegracao: 'chave-123',
        },
      ],
    });
  });

  it('item sem reservas (pós-filtro) gera dsValorOrigem "." e filtro ";<cobertura>"', () => {
    // Estado após filtrar todas as reservas de um item: mantém CIRModality, sem ClaimReserveList
    const inputComItemVazio = JSON.parse(JSON.stringify(input)) as {
      request: {
        body: { claimCaseDetail: { ClaimCase: { ClaimObjectList: { ClaimItemList: unknown[] }[] } } };
      };
    };
    inputComItemVazio.request.body.claimCaseDetail.ClaimCase.ClaimObjectList[0].ClaimItemList.push({
      CIRModality: '178I',
    });

    const out = joltTransform(spec, inputComItemVazio) as { body: Record<string, unknown>[] };
    expect(out.body).toHaveLength(3);
    expect(out.body[0].dsValorOrigem).toBe('95000.00');
    expect(out.body[1].dsValorOrigem).toBe('95000.00');
    expect(out.body[2]).toEqual({
      dsValorOrigem: '.',
      cdDocumentoAuditoria: ';178I',
      cdIdentificadorDestino: 'cir_num_sinistro;cir_cobertura',
      dsIdentificadorDestino: 'sql...',
      cdChaveIntegracao: 'chave-123',
    });
  });

  it('todas as operações intermediárias executam sem erro', () => {
    const steps = joltTransformSteps(spec, input);
    expect(steps).toHaveLength(13);
    expect(steps.every((s) => s.error === undefined)).toBe(true);
    // Passos-chave: agrupamento por CIRModality e soma da reserva
    const afterShift = steps[2].output as { ClaimReserveList: Record<string, { num_sinistro: string }> };
    expect(Object.keys(afterShift.ClaimReserveList)).toEqual(['177I', '179I']);
    const afterSum = steps[3].output as { ClaimReserveList: Record<string, { OutstandingAmount: number; filtro: string }> };
    expect(afterSum.ClaimReserveList['177I'].OutstandingAmount).toBe(95000);
    expect(afterSum.ClaimReserveList['177I'].filtro).toBe('0100140893103778;177I');
  });
});
