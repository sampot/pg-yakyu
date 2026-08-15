import { describe, expect, it } from 'vitest';
import {
  applyBattingResult,
  createMatch,
  recordOut,
  simulateHalfInning,
} from './match.js';
import {
  completeGame,
  createCareer,
  growPlayer,
  parseCareer,
  serializeCareer,
} from './career.js';
import { judgeSwing } from './batting.js';
import { loadCareer, saveCareer } from './persist.js';

describe('match state', () => {
  it('advances forced runners on a single', () => {
    const match = createMatch();
    match.bases = [true, true, false];

    applyBattingResult(match, 'single');

    expect(match.bases).toEqual([true, true, true]);
    expect(match.score.away).toBe(0);
  });

  it('clears loaded bases and scores four on a home run', () => {
    const match = createMatch();
    match.bases = [true, true, true];

    applyBattingResult(match, 'homeRun');

    expect(match.bases).toEqual([false, false, false]);
    expect(match.score.away).toBe(4);
  });

  it('changes sides after three outs and ends after the ninth', () => {
    const match = createMatch();
    for (let half = 0; half < 18; half += 1) {
      recordOut(match);
      recordOut(match);
      recordOut(match);
    }

    expect(match.finished).toBe(true);
    expect(match.inning).toBe(9);
    expect(match.half).toBe('bottom');
  });

  it('simulates a half inning to three outs deterministically', () => {
    const match = createMatch();
    simulateHalfInning(match, () => 0.99);

    expect(match.inning).toBe(1);
    expect(match.half).toBe('bottom');
    expect(match.outs).toBe(0);
  });
});

describe('batting', () => {
  it('maps excellent timing and power to a home run', () => {
    expect(judgeSwing(0.01, { HIT: 55, POW: 80 }, () => 0.01)).toBe('homeRun');
  });

  it('maps a badly mistimed swing to an out', () => {
    expect(judgeSwing(0.8, { HIT: 99, POW: 99 }, () => 0)).toBe('out');
  });
});

describe('career', () => {
  it('creates an eight-game regular season and three playoff games', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);

    expect(career.schedule).toHaveLength(11);
    expect(career.schedule.every((game) => game.result === null)).toBe(true);
  });

  it('advances wins and eliminates the player after a playoff loss', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);

    for (let index = 0; index < 8; index += 1) completeGame(career, true);
    completeGame(career, false);

    expect(career.index).toBe(9);
    expect(career.eliminated).toBe(true);
    expect(career.champion).toBe(false);
  });

  it('marks the player champion after winning all eleven games', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);
    for (let index = 0; index < 11; index += 1) completeGame(career, true);

    expect(career.champion).toBe(true);
  });

  it('caps growth at 99 and round-trips JSON', () => {
    const career = createCareer({ name: '阿勇', hand: 'L' }, () => 0.5);
    career.player.stats.HIT = 98;
    growPlayer(career.player, 3);

    expect(career.player.stats.HIT).toBe(99);
    expect(parseCareer(serializeCareer(career))).toEqual(career);
  });
});

describe('persistence', () => {
  it('returns null for a missing career', async () => {
    const fetcher = async () => new Response('', { status: 404 });
    await expect(loadCareer(fetcher)).resolves.toBeNull();
  });

  it('writes serialized career through the host KV API', async () => {
    const career = createCareer({ name: '阿勇' }, () => 0.5);
    let request;
    const fetcher = async (url, init) => {
      request = { url, init };
      return new Response(null, { status: 204 });
    };

    await saveCareer(career, fetcher);

    expect(request.url).toBe('/api/kv/career');
    expect(request.init.method).toBe('PUT');
    expect(JSON.parse(request.init.body)).toEqual(career);
  });
});
