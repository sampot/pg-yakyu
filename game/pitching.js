export function judgePitch(
  timingError,
  pitcherStats = {},
  batterPower = 50,
  random = Math.random,
) {
  const error = Math.abs(timingError);
  const ctl = Math.max(0, Math.min(1, (pitcherStats.CTL ?? 50) / 100));
  const sta = Math.max(0, Math.min(1, (pitcherStats.STA ?? 50) / 100));
  const batter = Math.max(0, Math.min(1, batterPower / 100));
  const roll = random();

  // Hanging pitch — opponent feast.
  if (error > 0.48) {
    if (roll < 0.18 + batter * 0.28) return 'homeRun';
    if (roll < 0.4 + batter * 0.2) return 'double';
    return 'single';
  }

  // Paint the zone — strikeout bias with CTL.
  if (error <= 0.1 && roll < 0.42 + ctl * 0.4 + sta * 0.08) return 'strikeout';
  if (error <= 0.18 && roll < 0.35 + ctl * 0.35) return 'out';
  if (error <= 0.28) {
    if (roll < 0.15 + batter * 0.4 - ctl * 0.3) return 'single';
    return 'out';
  }

  // Late / early release — contact chance rises.
  if (roll < 0.12 + batter * 0.22) return 'double';
  if (roll < 0.38 + batter * 0.3 - ctl * 0.1) return 'single';
  return 'out';
}

export function pitchResultLabel(result) {
  return {
    strikeout: '三振！好球進袋',
    out: '軟弱飛球，接殺出局',
    single: '被敲穿越安打',
    double: '被打進外野，二壘安打',
    triple: '被敲三壘安打',
    homeRun: '被轟出去了……全壘打',
  }[result] ?? '出局';
}
