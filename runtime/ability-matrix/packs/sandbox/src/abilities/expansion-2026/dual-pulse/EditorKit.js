import { CAST_ANIMATIONS } from '../../../config/settings.js';

/**
 * Editor helpers for the Cinder Crown and Glacier Bell folders.
 *
 * The production shell hands `buildEditor` the real `Editor` class, but the
 * host tests hand it a minimal lil-gui stand-in whose folders cannot nest.
 * These wrappers use the real `Editor.range` / sub-folder API when it exists
 * and fall back to a flat folder otherwise, so the same builder serves both
 * without a branch at every call site.
 */

/** A sub-folder when the GUI supports nesting, otherwise the parent itself. */
export function subFolder(folder, title) {
  return typeof folder.addFolder === 'function' ? folder.addFolder(title) : folder;
}

/** `Editor.range` when present, else the lil-gui call it wraps. */
export function rangeOf(Editor) {
  if (typeof Editor?.range === 'function') return Editor.range;
  return (folder, object, key, min, max, step, label) =>
    folder.add(object, key, min, max, step).name(label ?? key);
}

/** The cast-animation dropdown, with the same fallback. */
export function castAnimation(folder, c, Editor) {
  if (typeof Editor?.castAnimation === 'function') return Editor.castAnimation(folder, c);
  return folder.add(c, 'castAnim', CAST_ANIMATIONS).name('cast animation');
}

/**
 * The four lifetime stops of a particle gradient (`${prefix}A..D`), labelled
 * by when in a particle's life they are seen. Mirrors `Editor.gradient` but
 * goes through `subFolder` so a flat GUI still receives every colour.
 */
export function gradient(folder, c, prefix, title) {
  const group = subFolder(folder, title);
  group.addColor(c, `${prefix}A`).name('birth');
  group.addColor(c, `${prefix}B`).name('early');
  group.addColor(c, `${prefix}C`).name('late');
  group.addColor(c, `${prefix}D`).name('death');
  return group;
}
