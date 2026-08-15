import { OPPONENTS } from './data/opponents.js';

const STAT_KEYS = ['POW', 'HIT', 'SPD', 'ARM', 'CTL', 'STA'];

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

export function createCareer(input, random = Math.random) {
  const stats = initialStats(random);
  stats.HIT = Math.min(99, stats.HIT + 5);
  stats.POW = Math.min(99, stats.POW + 3);

  return {
    v: 1,
    player: {
      name: String(input.name || '阿勇').trim().slice(0, 8) || '阿勇',
      hand: input.hand === 'L' ? 'L' : 'R',
      path: 'batter',
      stats,
    },
    team: {
      name: String(input.teamName || '沙盒高中').trim().slice(0, 8) || '沙盒高中',
      color: input.color || '#b8322b',
    },
    season: 1,
    schedule: buildSchedule(),
    index: 0,
    teamWins: 0,
    teamLosses: 0,
    eliminated: false,
    champion: false,
  };
}

export function completeGame(career, won) {
  const game = career.schedule[career.index];
  if (!game || game.result !== null || career.eliminated || career.champion) return career;

  game.result = won ? 'W' : 'L';
  career.index += 1;
  if (won) career.teamWins += 1;
  else career.teamLosses += 1;

  if (!won && game.stage !== 'regular') career.eliminated = true;
  if (won && career.index >= career.schedule.length) career.champion = true;
  return career;
}

export function growPlayer(player, points) {
  let remaining = Math.max(0, Math.floor(points));
  const order = ['HIT', 'POW', 'SPD'];
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

export function serializeCareer(career) {
  return JSON.stringify(career);
}

export function parseCareer(raw) {
  const career = JSON.parse(raw);
  if (career?.v !== 1 || !career.player || !Array.isArray(career.schedule)) {
    throw new TypeError('Unsupported career save');
  }
  return career;
}
