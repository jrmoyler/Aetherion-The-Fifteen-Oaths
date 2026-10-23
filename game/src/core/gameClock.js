// Monotonic presentation clock that pauses with the offline authoritative world.
export function createGameClock(read = () => performance.now()) {
  let pausedAt = null, offset = 0;
  return {
    now: () => (pausedAt ?? read()) - offset,
    setPaused(paused) {
      if (paused && pausedAt === null) pausedAt = read();
      else if (!paused && pausedAt !== null) { offset += read() - pausedAt; pausedAt = null; }
    },
  };
}
