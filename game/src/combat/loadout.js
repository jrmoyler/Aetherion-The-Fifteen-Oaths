/** Preserve the public array identity and report only actual ability-slot changes. */
export function replaceHotbar(current, next) {
  const changed = current.length !== next.length || current.some((ab, i) => ab.id !== next[i]?.id);
  // Even an unchanged kit receives authoritative tuning without clearing anticipation.
  current.splice(0, current.length, ...next);
  return changed;
}
