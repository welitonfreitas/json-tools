// Ponto de entrada do motor Jolt: executa uma cadeia de operações (chainr).
//
// Implementação em TypeScript compatível com o Jolt (bazaarvoice/jolt) cobrindo
// as operações e sintaxes mais usadas no dia a dia. Operações suportadas:
//   shift, default, remove, sort, cardinality,
//   modify-overwrite-beta, modify-default-beta

import { Json, JoltError, isPlainObject } from './common';
import { applyShift } from './shiftr';
import { applyDefault, applyRemove, applySort, applyCardinality } from './ops';
import { applyModify } from './modify';

export { JoltError } from './common';
export type { Json } from './common';

export const SUPPORTED_OPERATIONS = [
  'shift',
  'default',
  'remove',
  'sort',
  'cardinality',
  'modify-overwrite-beta',
  'modify-default-beta',
] as const;

export interface ChainrEntry {
  operation: string;
  spec?: Json;
}

/** Resultado de uma operação da cadeia: saída intermediária ou erro (interrompe a cadeia). */
export interface JoltStep {
  operation: string;
  output?: Json;
  error?: string;
}

function applyOne(op: string, spec: Json, current: Json): Json {
  switch (op) {
    case 'shift':
      return applyShift(spec, current);
    case 'default':
      return applyDefault(spec, current);
    case 'remove':
      return applyRemove(spec, current);
    case 'sort':
      return applySort(current);
    case 'cardinality':
      return applyCardinality(spec, current);
    case 'modify-overwrite-beta':
      return applyModify(spec, current, true);
    case 'modify-default-beta':
      return applyModify(spec, current, false);
    default:
      throw new JoltError(`Operação "${op}" não suportada. Suportadas: ${SUPPORTED_OPERATIONS.join(', ')}`);
  }
}

/** Executa a cadeia registrando a saída de cada operação (para depuração passo a passo). */
export function joltTransformSteps(chainrSpecInput: unknown, inputValue: unknown): JoltStep[] {
  const chainrSpec = chainrSpecInput as Json;
  if (!Array.isArray(chainrSpec)) {
    throw new JoltError('A spec deve ser um array de operações: [{"operation": "...", "spec": {...}}, ...]');
  }
  if (chainrSpec.length === 0) {
    throw new JoltError('A spec está vazia — adicione ao menos uma operação');
  }
  const steps: JoltStep[] = [];
  let current: Json = inputValue as Json;
  for (let i = 0; i < chainrSpec.length; i++) {
    const entry = chainrSpec[i];
    if (!isPlainObject(entry) || typeof entry.operation !== 'string') {
      steps.push({ operation: '?', error: `Operação #${i + 1} inválida: cada item precisa de um campo "operation" (string)` });
      return steps;
    }
    const op = entry.operation;
    try {
      current = applyOne(op, entry.spec as Json, current);
      steps.push({ operation: op, output: current });
    } catch (e) {
      const msg = e instanceof JoltError ? e.message : e instanceof Error ? e.message : String(e);
      steps.push({ operation: op, error: `Operação #${i + 1} (${op}): ${msg}` });
      return steps;
    }
  }
  return steps;
}

export function joltTransform(chainrSpecInput: unknown, inputValue: unknown): Json {
  const steps = joltTransformSteps(chainrSpecInput, inputValue);
  const last = steps[steps.length - 1];
  if (last.error !== undefined) throw new JoltError(last.error);
  return last.output ?? null;
}
