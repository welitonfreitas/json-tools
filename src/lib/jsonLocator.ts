// Localiza o trecho de texto correspondente a um caminho JSON num editor CodeMirror,
// usando a árvore sintática do @codemirror/lang-json.

import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

/** Nó de valor JSON (pula chaves de propriedade e pontuação). */
const VALUE_NODES = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null']);

function propertyName(view: EditorView, prop: SyntaxNode): string | null {
  const nameNode = prop.getChild('PropertyName');
  if (!nameNode) return null;
  try {
    return JSON.parse(view.state.sliceDoc(nameNode.from, nameNode.to)) as string;
  } catch {
    return null;
  }
}

function childValue(node: SyntaxNode): SyntaxNode | null {
  for (let c = node.firstChild; c !== null; c = c.nextSibling) {
    if (VALUE_NODES.has(c.name)) return c;
  }
  return null;
}

/**
 * Encontra o intervalo {from,to} do valor em `path` (segmentos de chave/índice).
 * Se o caminho não existir por completo, retorna o nó mais profundo alcançado.
 */
export function findJsonRange(view: EditorView, path: (string | number)[]): { from: number; to: number } | null {
  const tree = syntaxTree(view.state);
  let node: SyntaxNode | null = tree.topNode;
  // Raiz: JsonText → primeiro valor
  node = childValue(node) ?? node.firstChild;
  if (!node) return null;

  let best: { from: number; to: number } = { from: node.from, to: node.to };

  for (const seg of path) {
    if (!node) break;
    let next: SyntaxNode | null = null;

    if (node.name === 'Object' && typeof seg === 'string') {
      for (let prop = node.firstChild; prop !== null; prop = prop.nextSibling) {
        if (prop.name !== 'Property') continue;
        if (propertyName(view, prop) === seg) {
          next = childValue(prop);
          // Se a propriedade existe mas não tem valor (JSON parcial), destaca a propriedade
          best = next ? { from: next.from, to: next.to } : { from: prop.from, to: prop.to };
          break;
        }
      }
    } else if (node.name === 'Array' && typeof seg === 'number') {
      let idx = 0;
      for (let c: SyntaxNode | null = node.firstChild; c !== null; c = c.nextSibling) {
        if (!VALUE_NODES.has(c.name)) continue;
        if (idx === seg) {
          next = c;
          best = { from: c.from, to: c.to };
          break;
        }
        idx++;
      }
    }

    if (!next) return best; // caminho parcial: melhor esforço (ex.: propriedade obrigatória ausente)
    node = next;
  }

  return best;
}

/** Seleciona e centraliza o intervalo no editor. */
export function revealRange(view: EditorView, range: { from: number; to: number }): void {
  view.dispatch({
    selection: { anchor: range.from, head: range.to },
    effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
  });
  view.focus();
}
