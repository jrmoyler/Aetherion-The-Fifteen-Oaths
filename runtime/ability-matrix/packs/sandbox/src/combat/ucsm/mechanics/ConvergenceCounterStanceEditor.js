import { buildConvergenceEditor } from './ConvergenceArt.js';
import { buildCounterEditor } from './CounterVisuals.js';
import { buildStanceEditor } from './stance-presentation.js';

/**
 * One call that mounts the three mechanic look editors — `✺ Convergence`,
 * `⟲ Counter` and `♛ Stance` — under `gui`, each a top-level folder with a
 * sub-folder per layer and a palette folder per move.
 *
 * Every control edits a live `*_LOOK` block that the VFX kit samples on each
 * draw, so a change lands on a cast that is already on screen. The combat
 * editor entry point (`PackAdapter.buildEditor`) is the intended caller:
 *
 *   import { Editor } from '../../ui/Editor.js';   // or have main.js pass it in
 *   buildMechanicLookEditors(gui, Editor);
 *
 * Returns the three root folders so a caller (or a test) can close, reorder or
 * dispose them.
 */
export function buildMechanicLookEditors(gui, Editor) {
  return {
    convergence: buildConvergenceEditor(gui, Editor),
    counter: buildCounterEditor(gui, Editor),
    stance: buildStanceEditor(gui, Editor)
  };
}
