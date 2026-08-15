export function judgeSwing(timingError, stats, random = Math.random) {
  const error = Math.abs(timingError);
  if (error > 0.48) return 'out';

  const contact = Math.max(0, Math.min(1, (stats.HIT ?? 50) / 100));
  const power = Math.max(0, Math.min(1, (stats.POW ?? 50) / 100));
  const roll = random();

  if (error <= 0.08 && roll < 0.08 + power * 0.28) return 'homeRun';
  if (error <= 0.12 && roll >= 0.45 && roll < 0.45 + contact * 0.22) return 'triple';
  if (error <= 0.16 && roll < 0.14 + power * 0.32) return 'double';
  if (error <= 0.3 && roll < 0.2 + contact * 0.58) return 'single';
  return 'out';
}
