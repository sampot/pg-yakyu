import { describe, expect, it } from 'vitest';
import {
  applyBattingResult,
  applyPlayerAtBat,
  createMatch,
  recordOut,
  simulateHalfInning,
  teamOffensePower,
} from './match.js';
import {
  completeGame,
  createCareer,
  growPlayer,
  parseCareer,
  serializeCareer,
  startNewSeason,
  venueForGame,
} from './career.js';
import { judgeSwing } from './batting.js';
import { loadCareer, loadSettings, saveCareer, saveSettings } from './persist.js';
import { flavorLine } from './flavor.js';

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

  it('changes sides after three outs and ends after the ninth when not tied', () => {
    const match = createMatch();
    match.score = { away: 3, home: 1 };
    for (let half = 0; half < 18; half += 1) {
      recordOut(match);
      recordOut(match);
      recordOut(match);
    }

    expect(match.finished).toBe(true);
    expect(match.inning).toBe(9);
    expect(match.half).toBe('bottom');
  });

  it('continues into extras when tied after nine, then finishes when one side leads', () => {
    const match = createMatch();
    match.inning = 9;
    match.half = 'bottom';
    match.outs = 2;
    match.score = { away: 2, home: 2 };

    recordOut(match);

    expect(match.finished).toBe(false);
    expect(match.inning).toBe(10);
    expect(match.half).toBe('top');

    match.score.away = 3;
    match.half = 'bottom';
    match.outs = 2;
    recordOut(match);

    expect(match.finished).toBe(true);
  });

  it('caps scheduled extras at two then plays one sudden-death inning', () => {
    const match = createMatch();
    match.inning = 11;
    match.half = 'bottom';
    match.outs = 2;
    match.score = { away: 1, home: 1 };

    recordOut(match);

    expect(match.finished).toBe(false);
    expect(match.inning).toBe(12);

    match.outs = 2;
    match.half = 'bottom';
    recordOut(match);

    expect(match.finished).toBe(true);
    expect(match.inning).toBe(12);
  });

  it('simulates a half inning to three outs deterministically', () => {
    const match = createMatch();
    simulateHalfInning(match, () => 0.99);

    expect(match.inning).toBe(1);
    expect(match.half).toBe('bottom');
    expect(match.outs).toBe(0);
  });

  it('lets higher offense power produce more hits than a weak side under fixed rolls', () => {
    const weak = createMatch();
    const strong = createMatch();
    // 0.28 is an out for weak (~0.265) but a single for strong (~0.335).
    const rolls = [0.28, 0.99, 0.99, 0.99];

    let index = 0;
    const random = () => rolls[index++] ?? 0.99;

    simulateHalfInning(weak, random, { offensePower: 40, defensePower: 80 });
    index = 0;
    simulateHalfInning(strong, random, { offensePower: 90, defensePower: 40 });

    expect(strong.log.some((line) => /安打|全壘打/.test(line))).toBe(true);
    expect(weak.log.every((line) => !/安打|全壘打/.test(line))).toBe(true);
  });

  it('tracks player plate stats and RBI on a clearing hit', () => {
    const match = createMatch();
    match.bases = [true, true, true];

    applyPlayerAtBat(match, 'homeRun');

    expect(match.playerStats).toEqual({ pa: 1, hits: 1, hr: 1, rbi: 4 });
  });

  it('uses Taiwan-flavor lines for outs and hits', () => {
    expect(flavorLine('out', () => 0)).toMatch(/三上三下|出局|揮空|接殺|滾地/);
    expect(flavorLine('homeRun', () => 0)).toMatch(/陽春|全壘打|飛出去/);
  });
});

describe('batting', () => {
  it('maps excellent timing and power to a home run', () => {
    expect(judgeSwing(0.01, { HIT: 55, POW: 80 }, () => 0.01)).toBe('homeRun');
  });

  it('maps a badly mistimed swing to an out', () => {
    expect(judgeSwing(0.8, { HIT: 99, POW: 99 }, () => 0)).toBe('out');
  });

  it('can produce a triple on strong contact', () => {
    expect(judgeSwing(0.05, { HIT: 90, POW: 70 }, () => 0.55)).toBe('triple');
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

  it('caps growth at 99, enforces season growth budget, and round-trips JSON', () => {
    const career = createCareer({ name: '阿勇', hand: 'L' }, () => 0.5);
    career.player.stats.HIT = 98;
    growPlayer(career, 1);

    expect(career.player.stats.HIT).toBe(99);
    expect(career.seasonGrowth).toBe(1);
    expect(parseCareer(serializeCareer(career))).toEqual(career);

    career.seasonGrowth = 12;
    const before = { ...career.player.stats };
    growPlayer(career, 3);
    expect(career.player.stats).toEqual(before);
  });

  it('starts a new season with decay above 70 and a fresh schedule', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);
    for (let index = 0; index < 11; index += 1) completeGame(career, true);
    career.player.stats.HIT = 80;
    career.records = { pa: 10, hits: 4, hr: 1, rbi: 5 };

    startNewSeason(career);

    expect(career.season).toBe(2);
    expect(career.champion).toBe(false);
    expect(career.eliminated).toBe(false);
    expect(career.index).toBe(0);
    expect(career.schedule).toHaveLength(11);
    expect(career.schedule.every((game) => game.result === null)).toBe(true);
    expect(career.player.stats.HIT).toBe(79);
    expect(career.records.pa).toBe(10);
  });

  it('labels venues by stage', () => {
    const career = createCareer({ name: '阿勇' }, () => 0.5);
    expect(venueForGame(career.schedule[0], 0)).toMatch(/紅土|砂地|本校/);
    expect(venueForGame(career.schedule[10], 10)).toMatch(/青砂/);
  });

  it('derives offense power from HIT and POW', () => {
    expect(teamOffensePower({ HIT: 60, POW: 40 })).toBe(50);
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

  it('loads and saves settings through KV', async () => {
    let body;
    const saveFetcher = async (url, init) => {
      body = init.body;
      expect(url).toBe('/api/kv/settings');
      return new Response(null, { status: 204 });
    };
    await saveSettings({ muted: true }, saveFetcher);

    const loadFetcher = async () => new Response(body, { status: 200 });
    await expect(loadSettings(loadFetcher)).resolves.toEqual({ muted: true });
  });
});
