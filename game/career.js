import { OPPONENTS } from './data/opponents.js';

const STAT_KEYS = ['POW', 'HIT', 'SPD', 'ARM', 'CTL', 'STA'];
const SEASON_GROWTH_CAP = 12;

function initialStats(random) {
  return Object.fromEntries(
    STAT_KEYS.map((key) => [key, 42 + Math.floor(random() * 14)]),
  );
}

function buildSchedule() {
  const regular = OPPONENTS.map((opponent) => ({
    opponentId: opponent.id,
    stage: 'regular',
    result: null,
  }));
  const playoffs = OPPONENTS.slice(-3).map((opponent, index) => ({
    opponentId: opponent.id,
    stage: index === 2 ? 'final' : 'playoff',
    result: null,
  }));
  return [...regular, ...playoffs];
}

function emptyRecords() {
  return { pa: 0, hits: 0, hr: 0, rbi: 0, bf: 0, k: 0, er: 0 };
}

export function createCareer(input, random = Math.random) {
  const path = input.path === 'pitcher' ? 'pitcher' : 'batter';
  const stats = initialStats(random);

  if (path === 'pitcher') {
    stats.CTL = Math.min(99, stats.CTL + 5);
    stats.STA = Math.min(99, stats.STA + 3);
    stats.ARM = Math.min(99, stats.ARM + 2);
  } else {
    stats.HIT = Math.min(99, stats.HIT + 5);
    stats.POW = Math.min(99, stats.POW + 3);
  }

  return {
    v: 1,
    player: {
      name: String(input.name || '阿勇').trim().slice(0, 8) || '阿勇',
      hand: input.hand === 'L' ? 'L' : 'R',
      path,
      stats,
    },
    team: {
      name: String(input.teamName || '沙盒高中').trim().slice(0, 8) || '沙盒高中',
      color: input.color || '#b8322b',
    },
    season: 1,
    seasonGrowth: 0,
    schedule: buildSchedule(),
    index: 0,
    teamWins: 0,
    teamLosses: 0,
    eliminated: false,
    champion: false,
    records: emptyRecords(),
  };
}

export function completeGame(career, won, playerStats = null, pitcherStats = null) {
  const game = career.schedule[career.index];
  if (!game || game.result !== null || career.eliminated || career.champion) return career;

  game.result = won ? 'W' : 'L';
  career.index += 1;
  if (won) career.teamWins += 1;
  else career.teamLosses += 1;

  if (!career.records) career.records = emptyRecords();
  if (playerStats) {
    career.records.pa += playerStats.pa || 0;
    career.records.hits += playerStats.hits || 0;
    career.records.hr += playerStats.hr || 0;
    career.records.rbi += playerStats.rbi || 0;
  }
  if (pitcherStats) {
    career.records.bf += pitcherStats.bf || 0;
    career.records.k += pitcherStats.k || 0;
    career.records.er += pitcherStats.er || 0;
  }

  if (!won && game.stage !== 'regular') career.eliminated = true;
  if (won && career.index >= career.schedule.length) career.champion = true;
  return career;
}

export function growPlayer(careerOrPlayer, points) {
  const career = careerOrPlayer.player ? careerOrPlayer : null;
  const player = career ? career.player : careerOrPlayer;
  let remaining = Math.max(0, Math.floor(points));

  if (career) {
    const used = career.seasonGrowth ?? 0;
    const room = Math.max(0, SEASON_GROWTH_CAP - used);
    remaining = Math.min(remaining, room);
    career.seasonGrowth = used + remaining;
  }

  const order = player.path === 'pitcher'
    ? ['CTL', 'STA', 'ARM']
    : ['HIT', 'POW', 'SPD'];
  let cursor = 0;

  while (remaining > 0 && cursor < order.length * 100) {
    const key = order[cursor % order.length];
    if (player.stats[key] < 99) {
      player.stats[key] += 1;
      remaining -= 1;
    }
    cursor += 1;
  }
  return player;
}

function decayStat(value) {
  if (value <= 70) return value;
  return Math.floor(70 + (value - 70) * 0.9);
}

export function startNewSeason(career) {
  for (const key of STAT_KEYS) {
    career.player.stats[key] = decayStat(career.player.stats[key]);
  }
  career.season += 1;
  career.seasonGrowth = 0;
  career.schedule = buildSchedule();
  career.index = 0;
  career.teamWins = 0;
  career.teamLosses = 0;
  career.eliminated = false;
  career.champion = false;
  return career;
}

export function venueForGame(game, index = 0) {
  if (!game) return '球場整修中';
  if (game.stage === 'final') return '青砂決勝場';
  if (game.stage === 'playoff') return '巨蛋練習場';
  if (index >= 4) {
    const late = ['濱海球場', '山城夜賽', '鐵道主場', '鳳凰熱戰'];
    return late[index % late.length];
  }
  return index % 2 === 0 ? '本校紅土' : '客場砂地';
}

export function serializeCareer(career) {
  return JSON.stringify(career);
}

export function parseCareer(raw) {
  const career = JSON.parse(raw);
  if (career?.v !== 1 || !career.player || !Array.isArray(career.schedule)) {
    throw new TypeError('Unsupported career save');
  }
  if (career.seasonGrowth == null) career.seasonGrowth = 0;
  if (!career.records) career.records = emptyRecords();
  if (career.records.bf == null) career.records.bf = 0;
  if (career.records.k == null) career.records.k = 0;
  if (career.records.er == null) career.records.er = 0;
  if (career.player.path !== 'pitcher') career.player.path = 'batter';
  return career;
}
