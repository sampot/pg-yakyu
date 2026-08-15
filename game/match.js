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
  };
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
    match.finished = true;
    return;
  }

  match.inning += 1;
  match.half = 'top';
}

export function recordOut(match) {
  if (match.finished) return match;
  match.outs += 1;
  match.log.push('出局');
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

export function applyBattingResult(match, result) {
  if (match.finished) return match;

  if (result === 'out') return recordOut(match);

  const basesByResult = {
    single: 1,
    double: 2,
    triple: 3,
    homeRun: 4,
  };
  const bases = basesByResult[result];
  if (!bases) throw new TypeError(`Unknown batting result: ${result}`);

  const runs = advanceRunners(match, bases);
  const labels = {
    single: '一壘安打',
    double: '二壘安打',
    triple: '三壘安打',
    homeRun: '全壘打',
  };
  match.log.push(`${labels[result]}${runs ? `，${runs} 分` : ''}`);
  return match;
}

function randomResult(random) {
  const roll = random();
  if (roll < 0.04) return 'homeRun';
  if (roll < 0.1) return 'double';
  if (roll < 0.28) return 'single';
  return 'out';
}

export function simulateHalfInning(match, random = Math.random) {
  const targetHalf = match.half;
  const targetInning = match.inning;
  let plateAppearances = 0;

  while (
    !match.finished &&
    match.half === targetHalf &&
    match.inning === targetInning &&
    plateAppearances < 20
  ) {
    applyBattingResult(match, randomResult(random));
    plateAppearances += 1;
  }

  return match;
}
