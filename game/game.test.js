import { describe, expect, it } from 'vitest';
import {
  applyBattingResult,
  applyPlayerAtBat,
  applyPlayerPitch,
  createMatch,
  recordOut,
  simulateHalfInning,
  teamOffensePower,
  teamPitchPower,
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
import { judgePitch } from './pitching.js';
import { loadCareer, loadSettings, saveCareer, saveSettings } from './persist.js';
import { flavorLine } from './flavor.js';
import { OPPONENTS } from './data/opponents.js';
import { resolveTeamColors } from './team-colors.js';

describe('team colors', () => {
  it('gives every opponent a unique valid uniform color', () => {
    const colors = OPPONENTS.map((opponent) => opponent.color);

    expect(new Set(colors).size).toBe(OPPONENTS.length);
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
  });

  it('keeps player and opponent uniforms distinct when colors collide', () => {
    expect(resolveTeamColors('#b8322b', '#b8322b')).toEqual({
      player: '#b8322b',
      opponent: '#176b87',
    });
  });

  it('preserves colors that are already visually distinct', () => {
    expect(resolveTeamColors('#b8322b', '#2f6f3e')).toEqual({
      player: '#b8322b',
      opponent: '#2f6f3e',
    });
  });
});

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

  it('tracks pitcher BF, strikeouts, hits allowed, and earned runs', () => {
    const match = createMatch();
    match.half = 'bottom';
    match.bases = [true, false, false];

    applyPlayerPitch(match, 'strikeout');
    applyPlayerPitch(match, 'single');
    applyPlayerPitch(match, 'homeRun');

    expect(match.pitcherStats.bf).toBe(3);
    expect(match.pitcherStats.k).toBe(1);
    expect(match.pitcherStats.hitsAllowed).toBe(2);
    expect(match.pitcherStats.er).toBe(3);
    expect(match.score.home).toBe(3);
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

describe('pitching', () => {
  it('maps excellent release and control to a strikeout', () => {
    expect(judgePitch(0.02, { CTL: 85, STA: 70 }, 50, () => 0.1)).toBe('strikeout');
  });

  it('maps a hanging pitch against a strong batter to a home run', () => {
    expect(judgePitch(0.7, { CTL: 40, STA: 40 }, 90, () => 0.05)).toBe('homeRun');
  });

  it('lets high control survive a mediocre release better than low control', () => {
    const soft = judgePitch(0.22, { CTL: 30, STA: 40 }, 70, () => 0.2);
    const sharp = judgePitch(0.22, { CTL: 90, STA: 70 }, 70, () => 0.2);
    expect(soft).toBe('single');
    expect(sharp).toBe('out');
  });
});

describe('career', () => {
  it('creates an eight-game regular season and three playoff games', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);

    expect(career.schedule).toHaveLength(11);
    expect(career.schedule.every((game) => game.result === null)).toBe(true);
  });

  it('boosts CTL for pitcher path and HIT for batter path', () => {
    const batter = createCareer({ name: '阿勇', path: 'batter' }, () => 0.5);
    const pitcher = createCareer({ name: '阿投', path: 'pitcher' }, () => 0.5);

    expect(batter.player.path).toBe('batter');
    expect(pitcher.player.path).toBe('pitcher');
    expect(pitcher.player.stats.CTL).toBeGreaterThan(batter.player.stats.CTL);
    expect(batter.player.stats.HIT).toBeGreaterThan(pitcher.player.stats.HIT);
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

  it('grows pitcher CTL before HIT', () => {
    const career = createCareer({ name: '阿投', path: 'pitcher' }, () => 0.5);
    const beforeCtl = career.player.stats.CTL;
    const beforeHit = career.player.stats.HIT;
    growPlayer(career, 1);
    expect(career.player.stats.CTL).toBe(beforeCtl + 1);
    expect(career.player.stats.HIT).toBe(beforeHit);
  });

  it('starts a new season with decay above 70 and a fresh schedule', () => {
    const career = createCareer({ name: '阿勇', hand: 'R' }, () => 0.5);
    for (let index = 0; index < 11; index += 1) completeGame(career, true);
    career.player.stats.HIT = 80;
    career.records = { pa: 10, hits: 4, hr: 1, rbi: 5, bf: 0, k: 0, er: 0 };

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

  it('derives offense and pitch power from stats', () => {
    expect(teamOffensePower({ HIT: 60, POW: 40 })).toBe(50);
    expect(teamPitchPower({ CTL: 60, STA: 40 })).toBe(50);
  });

  it('accumulates pitcher records on completeGame', () => {
    const career = createCareer({ name: '阿投', path: 'pitcher' }, () => 0.5);
    completeGame(career, true, null, { bf: 12, k: 4, er: 1 });
    expect(career.records).toMatchObject({ bf: 12, k: 4, er: 1 });
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
