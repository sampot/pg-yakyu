const EMPTY_BASES = () => [false, false, false];

export function createMatch(opponent = null) {
  return {
    opponent,
    inning: 1,
    half: 'top',
    outs: 0,
    bases: EMPTY_BASES(),
    score: { away: 0, home: 0 },
    finished: false,
    log: [],
    playerStats: { pa: 0, hits: 0, hr: 0, rbi: 0 },
    pitcherStats: { bf: 0, outs: 0, k: 0, hitsAllowed: 0, er: 0 },
  };
}

export function teamOffensePower(stats = {}) {
  const hit = Number(stats.HIT ?? 50);
  const pow = Number(stats.POW ?? 50);
  return Math.round((hit + pow) / 2);
}

function battingSide(match) {
  return match.half === 'top' ? 'away' : 'home';
}

function scoreRuns(match, count) {
  match.score[battingSide(match)] += count;
}

function endHalfInning(match) {
  match.outs = 0;
  match.bases = EMPTY_BASES();

  if (match.half === 'top') {
    match.half = 'bottom';
    return;
  }

  if (match.inning >= 9) {
    if (match.score.away !== match.score.home) {
      match.finished = true;
      return;
    }
    // Tied: extras through 11, then one sudden-death inning (12).
    if (match.inning >= 12) {
      match.finished = true;
      return;
    }
  }

  match.inning += 1;
  match.half = 'top';
}

export function recordOut(match, label = '出局') {
  if (match.finished) return match;
  match.outs += 1;
  match.log.push(label);
  if (match.outs >= 3) endHalfInning(match);
  return match;
}

function advanceRunners(match, bases) {
  let runs = 0;
  const next = EMPTY_BASES();

  for (let index = 2; index >= 0; index -= 1) {
    if (!match.bases[index]) continue;
    const target = index + bases;
    if (target >= 3) runs += 1;
    else next[target] = true;
  }

  if (bases >= 4) runs += 1;
  else next[bases - 1] = true;

  match.bases = next;
  scoreRuns(match, runs);
  return runs;
}

const RESULT_LABELS = {
  single: '一壘安打',
  double: '二壘安打',
  triple: '三壘安打',
  homeRun: '全壘打',
};

export function applyBattingResult(match, result, label) {
  if (match.finished) return match;

  if (result === 'out') return recordOut(match, label || '出局');

  const basesByResult = {
    single: 1,
    double: 2,
    triple: 3,
    homeRun: 4,
  };
  const bases = basesByResult[result];
  if (!bases) throw new TypeError(`Unknown batting result: ${result}`);

  const runs = advanceRunners(match, bases);
  const baseLabel = label || RESULT_LABELS[result];
  match.log.push(`${baseLabel}${runs ? `，${runs} 分` : ''}`);
  return match;
}

export function applyPlayerAtBat(match, result, label) {
  const side = battingSide(match);
  const before = match.score[side];
  match.playerStats.pa += 1;
  if (result !== 'out' && result !== 'strikeout') match.playerStats.hits += 1;
  if (result === 'homeRun') match.playerStats.hr += 1;
  applyBattingResult(match, result === 'strikeout' ? 'out' : result, label);
  match.playerStats.rbi += Math.max(0, match.score[side] - before);
  return match;
}

export function applyPlayerPitch(match, result, label) {
  if (!match.pitcherStats) {
    match.pitcherStats = { bf: 0, outs: 0, k: 0, hitsAllowed: 0, er: 0 };
  }
  const before = match.score.home;
  match.pitcherStats.bf += 1;

  const normalized = result === 'strikeout' ? 'out' : result;
  if (normalized === 'out') {
    match.pitcherStats.outs += 1;
    if (result === 'strikeout') match.pitcherStats.k += 1;
  } else {
    match.pitcherStats.hitsAllowed += 1;
  }

  const pitchLabels = {
    strikeout: '三振',
    out: '接殺出局',
    single: '被敲一壘安打',
    double: '被敲二壘安打',
    triple: '被敲三壘安打',
    homeRun: '被轟全壘打',
  };
  applyBattingResult(match, normalized, label || pitchLabels[result]);
  match.pitcherStats.er += Math.max(0, match.score.home - before);
  return match;
}

export function teamPitchPower(stats = {}) {
  const ctl = Number(stats.CTL ?? 50);
  const sta = Number(stats.STA ?? 50);
  return Math.round((ctl + sta) / 2);
}

export function weightedResult(random, offensePower = 50, defensePower = 50) {
  const diff = Math.max(-0.35, Math.min(0.35, (offensePower - defensePower) / 100));
  const homeRun = 0.035 + diff * 0.05;
  const double = 0.09 + diff * 0.06;
  const triple = 0.11 + diff * 0.02;
  const single = 0.3 + diff * 0.1;
  const roll = random();
  if (roll < homeRun) return 'homeRun';
  if (roll < double) return 'double';
  if (roll < triple) return 'triple';
  if (roll < single) return 'single';
  return 'out';
}

function randomResult(random) {
  return weightedResult(random, 50, 50);
}

export function simulateHalfInning(
  match,
  random = Math.random,
  options = {},
) {
  const targetHalf = match.half;
  const targetInning = match.inning;
  let plateAppearances = 0;
  const offensePower = options.offensePower ?? 50;
  const defensePower = options.defensePower ?? 50;
  const flavor = options.flavor;

  while (
    !match.finished &&
    match.half === targetHalf &&
    match.inning === targetInning &&
    plateAppearances < 20
  ) {
    const result = weightedResult(random, offensePower, defensePower);
    const label = flavor ? flavor(result, random) : undefined;
    applyBattingResult(match, result, label);
    plateAppearances += 1;
  }

  return match;
}

export { randomResult };
