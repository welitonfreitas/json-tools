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

export function joltTransform(chainrSpecInput: unknown, inputValue: unknown): Json {
  const chainrSpec = chainrSpecInput as Json;
  if (!Array.isArray(chainrSpec)) {
    throw new JoltError('A spec deve ser um array de operações: [{"operation": "...", "spec": {...}}, ...]');
  }
  let current: Json = inputValue as Json;
  chainrSpec.forEach((entry, i) => {
    if (!isPlainObject(entry) || typeof entry.operation !== 'string') {
      throw new JoltError(`Operação #${i + 1} inválida: cada item precisa de um campo "operation" (string)`);
    }
    const op = entry.operation;
    const spec = entry.spec as Json;
    try {
      switch (op) {
        case 'shift':
          current = applyShift(spec, current);
          break;
        case 'default':
          current = applyDefault(spec, current);
          break;
        case 'remove':
          current = applyRemove(spec, current);
          break;
        case 'sort':
          current = applySort(current);
          break;
        case 'cardinality':
          current = applyCardinality(spec, current);
          break;
        case 'modify-overwrite-beta':
          current = applyModify(spec, current, true);
          break;
        case 'modify-default-beta':
          current = applyModify(spec, current, false);
          break;
        default:
          throw new JoltError(`Operação "${op}" não suportada. Suportadas: ${SUPPORTED_OPERATIONS.join(', ')}`);
      }
    } catch (e) {
      if (e instanceof JoltError) {
        throw new JoltError(`Operação #${i + 1} (${op}): ${e.message}`);
      }
      throw e;
    }
  });
  return current;
}
