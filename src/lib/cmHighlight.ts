// Realce persistente de um trecho no CodeMirror (ex.: a operação da spec
// correspondente ao passo selecionado no Jolt).

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

const setHighlight = StateEffect.define<{ from: number; to: number } | null>();

export const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlight)) {
        deco =
          e.value === null || e.value.from >= e.value.to
            ? Decoration.none
            : Decoration.set([Decoration.mark({ class: 'cm-op-highlight' }).range(e.value.from, e.value.to)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Aplica (ou limpa, com null) o realce e rola até o trecho. */
export function highlightRange(view: EditorView, range: { from: number; to: number } | null): void {
  const effects: StateEffect<unknown>[] = [setHighlight.of(range)];
  if (range !== null) effects.push(EditorView.scrollIntoView(range.from, { y: 'center' }));
  view.dispatch({ effects });
}
