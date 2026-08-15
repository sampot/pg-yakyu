import { YakyuAudio } from './audio.js';
import { judgeSwing } from './game/batting.js';
import {
  completeGame,
  createCareer,
  growPlayer,
  startNewSeason,
  venueForGame,
} from './game/career.js';
import { getOpponent } from './game/data/opponents.js';
import { flavorLine } from './game/flavor.js';
import {
  applyPlayerAtBat,
  createMatch,
  simulateHalfInning,
  teamOffensePower,
} from './game/match.js';
import {
  deleteCareer,
  loadCareer,
  loadSettings,
  saveCareer,
  saveSettings,
} from './game/persist.js';

const screens = [...document.querySelectorAll('.screen')];
const flash = document.querySelector('#flash');
const continueButton = document.querySelector('#continue-button');
const confirmDialog = document.querySelector('#confirm-dialog');
const aboutDialog = document.querySelector('#about-panel');
const ballpark = document.querySelector('#ballpark');
const batter = document.querySelector('#batter');
const baseball = document.querySelector('#baseball');
const scoreboard = document.querySelector('.game-scoreboard');
const audio = new YakyuAudio();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let career = null;
let match = null;
let opponent = null;
let pitchProgress = 0;
let pitchFrame = 0;
let pitchStartedAt = 0;
let canSwing = false;
let lastScore = { away: 0, home: 0 };
let taughtSwing = false;
let settings = { muted: false };

function showScreen(id) {
  screens.forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function showFlash(message) {
  flash.textContent = message;
  flash.hidden = false;
  window.clearTimeout(showFlash.timer);
  showFlash.timer = window.setTimeout(() => {
    flash.hidden = true;
  }, 3600);
}

async function unlockAudio() {
  await audio.unlock();
}

async function persist() {
  try {
    await saveCareer(career);
  } catch {
    showFlash('這次進度還沒存進球隊櫃子；離開前請再試一次。');
  }
}

async function persistSettings() {
  try {
    await saveSettings(settings);
  } catch {
    // Settings are best-effort; gameplay continues.
  }
}

function stageLabel(game) {
  if (!game) return '球季完成';
  if (game.stage === 'final') return '紅土全國賽・決賽';
  if (game.stage === 'playoff') return '紅土全國賽・淘汰戰';
  return `分區預賽・第 ${career.index + 1} 戰`;
}

function applyTeamLook() {
  const color = career?.team?.color || '#b8322b';
  document.documentElement.style.setProperty('--team', color);
  batter.classList.toggle('lefty', career?.player?.hand === 'L');
}

function renderCareer() {
  const next = career.schedule[career.index];
  const seasonDone = career.champion || career.eliminated || !next;
  document.querySelector('#career-stage').textContent = career.champion
    ? `第 ${career.season} 季・青砂盃冠軍`
    : career.eliminated
      ? `第 ${career.season} 季・本季止步`
      : `第 ${career.season} 季・${stageLabel(next)}`;
  document.querySelector('#team-heading').textContent = career.team.name;
  document.querySelector('#team-heading').style.color = career.team.color;
  const rec = career.records || { pa: 0, hits: 0, hr: 0, rbi: 0 };
  document.querySelector('#career-record').textContent =
    `${career.teamWins} 勝 ${career.teamLosses} 敗・HIT ${career.player.stats.HIT}` +
    (rec.pa ? `・生涯 ${rec.hits}/${rec.pa}` : '');

  const playButton = document.querySelector('#play-button');
  const newSeasonButton = document.querySelector('#new-season-button');
  newSeasonButton.hidden = !seasonDone;

  if (!next || career.eliminated) {
    document.querySelector('#opponent-name').textContent = career.champion ? '青砂盃到手！' : '球季結束';
    document.querySelector('#opponent-region').textContent = seasonDone ? '可開新賽季' : '';
    document.querySelector('#opponent-cheer').textContent = career.champion
      ? '你的名字，已經留在這片紅土。'
      : '整理球具，明年再來。';
    document.querySelector('#venue-label').textContent = '';
    playButton.hidden = true;
  } else {
    const nextOpponent = getOpponent(next.opponentId);
    document.querySelector('#home-team').textContent = career.team.name;
    document.querySelector('#opponent-name').textContent = nextOpponent.name;
    document.querySelector('#opponent-region').textContent =
      `${nextOpponent.region}區・戰力 ${nextOpponent.power}`;
    document.querySelector('#opponent-cheer').textContent = `「${nextOpponent.cheer}」`;
    document.querySelector('#venue-label').textContent = venueForGame(next, career.index);
    playButton.hidden = false;
    playButton.textContent = next.stage === 'final' ? '踏進決賽紅土' : '開打下一場';
  }

  document.querySelector('#schedule').innerHTML = career.schedule.map((game, index) => {
    const label = game.stage === 'final' ? '決' : index + 1;
    const state = game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : index === career.index ? 'next' : '';
    return `<span class="${state}" title="${getOpponent(game.opponentId).name}">${game.result ?? label}</span>`;
  }).join('');
}

function openCareer() {
  applyTeamLook();
  renderCareer();
  showScreen('career-screen');
}

function inningLabel() {
  const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const name = numerals[match.inning] ?? String(match.inning);
  const extra = match.inning > 9 ? '延長' : '';
  return `${extra}${name}局${match.half === 'top' ? '上' : '下'}`;
}

function renderGame() {
  const scored = match.score.away !== lastScore.away || match.score.home !== lastScore.home;
  document.querySelector('#away-score').textContent = match.score.away;
  document.querySelector('#home-score').textContent = match.score.home;
  document.querySelector('#inning-half').textContent = inningLabel();
  document.querySelector('#outs').textContent = match.outs;
  document.querySelector('#venue-chip').textContent =
    venueForGame(career.schedule[career.index], career.index);
  ['first', 'second', 'third'].forEach((base, index) => {
    const node = document.querySelector(`#base-${base}`);
    const on = match.bases[index];
    node.classList.toggle('active', on);
    node.setAttribute('aria-label', `${['一', '二', '三'][index]}壘${on ? '有人' : '空'}`);
  });
  document.querySelector('#game-log').innerHTML = match.log.slice(-4).reverse()
    .map((entry) => `<li>${entry}</li>`).join('');
  if (scored) {
    scoreboard.classList.remove('pulse');
    void scoreboard.offsetWidth;
    scoreboard.classList.add('pulse');
  }
  lastScore = { ...match.score };
}

function pitchDuration() {
  if (reducedMotion) return 700;
  return match.inning >= 7 ? 1180 : 1450;
}

function animatePitch(now) {
  const duration = pitchDuration();
  pitchProgress = Math.min(1, (now - pitchStartedAt) / duration);
  document.querySelector('#timing-cursor').style.left = `${pitchProgress * 100}%`;
  baseball.style.top = `${pitchProgress * 105}%`;

  if (pitchProgress >= 1) {
    swing('out', '目送好球，主審拉弓！', true);
    return;
  }
  pitchFrame = requestAnimationFrame(animatePitch);
}

function startPitch() {
  canSwing = true;
  pitchProgress = 0;
  pitchStartedAt = performance.now();
  ballpark.dataset.result = '';
  batter.classList.remove('swinging');
  baseball.src = 'assets/baseball-pack/ball.png';
  baseball.classList.add('spin');
  baseball.style.top = '-1rem';
  document.querySelector('#swing-button').disabled = false;
  const tip = taughtSwing
    ? `${career.player.name}，看準球心！`
    : '綠區正中央揮棒；也可按空白鍵。';
  document.querySelector('#at-bat-status').textContent = tip;
  taughtSwing = true;
  audio.pitch();
  pitchFrame = requestAnimationFrame(animatePitch);
}

function battingLabel(result) {
  return {
    out: '擦棒出局！',
    single: '穿越安打！',
    double: '打進外野深處，二壘安打！',
    triple: '球滾到牆邊，三壘安打！',
    homeRun: '這球飛出去啦——全壘打！',
  }[result];
}

function flashResult(result) {
  if (result === 'homeRun') ballpark.dataset.result = 'homeRun';
  else if (result === 'out') ballpark.dataset.result = 'out';
  else ballpark.dataset.result = 'hit';
  batter.classList.add('swinging');
  baseball.classList.remove('spin');
  if (result !== 'out') baseball.src = 'assets/baseball-pack/ball-blur.png';
}

function simOptions(offenseIsPlayer) {
  const playerPower = teamOffensePower(career.player.stats);
  const foePower = opponent?.power ?? 50;
  return {
    offensePower: offenseIsPlayer ? playerPower : foePower,
    defensePower: offenseIsPlayer ? foePower : playerPower,
    flavor: flavorLine,
  };
}

function swing(forcedResult, forcedLabel, looked = false) {
  if (!canSwing) return;
  canSwing = false;
  cancelAnimationFrame(pitchFrame);
  document.querySelector('#swing-button').disabled = true;

  const result = forcedResult ?? judgeSwing(pitchProgress - 0.72, career.player.stats);
  const label = forcedLabel ?? battingLabel(result);
  applyPlayerAtBat(match, result, looked ? forcedLabel : undefined);
  document.querySelector('#at-bat-status').textContent = label;
  flashResult(looked ? 'out' : result);
  if (looked) audio.swingMiss();
  else audio.hit(result);
  renderGame();
  window.setTimeout(finishInning, reducedMotion ? 350 : 900);
}

function finishInning() {
  // Finish the remainder of the player's half, then the opponent half.
  if (match.half === 'top') simulateHalfInning(match, Math.random, simOptions(true));
  if (!match.finished && match.half === 'bottom') {
    simulateHalfInning(match, Math.random, simOptions(false));
  }
  renderGame();

  if (match.finished) {
    finishGame();
    return;
  }
  const tip = match.inning > 9
    ? '延長賽！一棒定江山。'
    : '隊友守住了，輪到你的打席。';
  document.querySelector('#at-bat-status').textContent = tip;
  window.setTimeout(startPitch, reducedMotion ? 280 : 650);
}

async function finishGame() {
  // Extra innings are resolved by the match state machine; do not coin-flip.
  const won = match.score.away > match.score.home;
  const tied = match.score.away === match.score.home;
  const decidedWin = tied ? false : won;

  completeGame(career, decidedWin, match.playerStats);
  growPlayer(career, decidedWin ? 2 : 1);
  await persist();

  const stats = match.playerStats;
  const foeLine = decidedWin
    ? `「${opponent.cheer}」今天被你們蓋過了。`
    : `對手喊著「${opponent.cheer}」離開紅土。`;

  document.querySelector('#result-art').src = decidedWin
    ? 'assets/baseball-pack/ball.png'
    : 'assets/baseball-pack/glove-closed.png';
  document.querySelector('#result-kicker').textContent = stageLabel(career.schedule[career.index - 1]);
  document.querySelector('#result-title').textContent = decidedWin
    ? (career.champion ? '青砂盃到手！' : '這場拿下！')
    : tied
      ? '延長仍平，吞下敗仗'
      : '紅土還沒冷';
  document.querySelector('#result-copy').textContent =
    `${career.team.name} ${match.score.away}：${match.score.home} ${opponent.name}。` +
    `本場 ${stats.hits}/${stats.pa}、${stats.hr} 轟、${stats.rbi} 打點。` +
    (career.champion
      ? '決賽場記住你的名字。'
      : career.eliminated
        ? '本季止步，可開新賽季再戰。'
        : `打擊升到 ${career.player.stats.HIT}。${foeLine}`);
  document.querySelector('#result-stats').textContent =
    `生涯累計 ${career.records.hits} 安／${career.records.hr} 轟／${career.records.rbi} 打點`;
  if (decidedWin) audio.win();
  else audio.lose();
  showScreen('result-screen');
}

function startGame() {
  const game = career.schedule[career.index];
  opponent = getOpponent(game.opponentId);
  match = createMatch(opponent);
  lastScore = { away: 0, home: 0 };
  applyTeamLook();
  document.querySelector('#away-name').textContent = career.team.name;
  document.querySelector('#home-name').textContent = opponent.short;
  document.querySelector('#at-bat-status').textContent = opponent.cheer;
  renderGame();
  showScreen('game-screen');
  window.setTimeout(startPitch, reducedMotion ? 300 : 700);
}

function requestNewCareer() {
  if (career) confirmDialog.showModal();
  else showScreen('create-screen');
}

async function beginNewSeason() {
  startNewSeason(career);
  await persist();
  showFlash(`第 ${career.season} 季開打——能力微幅調整，目標仍是青砂盃。`);
  openCareer();
}

audio.bindMuteButton(document.querySelector('#mute-button'), {
  onChange: async (enabled) => {
    settings.muted = !enabled;
    await persistSettings();
  },
});

document.querySelector('#career-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  await unlockAudio();
  audio.ui();
  const data = new FormData(event.currentTarget);
  career = createCareer({
    name: data.get('playerName'),
    teamName: data.get('teamName'),
    hand: data.get('hand'),
    color: data.get('color'),
  });
  taughtSwing = false;
  await persist();
  openCareer();
});

continueButton.addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  openCareer();
});
document.querySelector('#new-button').addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  requestNewCareer();
});
document.querySelector('#restart-career').addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  requestNewCareer();
});
document.querySelector('#new-season-button').addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  await beginNewSeason();
});
document.querySelector('#cancel-create').addEventListener('click', () => {
  audio.ui();
  showScreen('welcome-screen');
});
document.querySelector('#play-button').addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  startGame();
});
document.querySelector('#swing-button').addEventListener('click', async () => {
  await unlockAudio();
  swing();
});
document.querySelector('#result-button').addEventListener('click', () => {
  audio.ui();
  openCareer();
});

document.querySelector('#confirm-restart').addEventListener('click', async () => {
  confirmDialog.close();
  audio.ui();
  try {
    await deleteCareer();
  } catch {
    showFlash('舊球員資料還沒清掉；新生涯存檔時會再覆蓋。');
  }
  career = null;
  taughtSwing = false;
  showScreen('create-screen');
});
document.querySelector('#cancel-restart').addEventListener('click', () => {
  audio.ui();
  confirmDialog.close();
});
document.querySelector('#about-button').addEventListener('click', async () => {
  await unlockAudio();
  audio.ui();
  aboutDialog.showModal();
});
document.querySelector('#close-about').addEventListener('click', () => {
  audio.ui();
  aboutDialog.close();
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' && event.code !== 'Enter') return;
  const gameVisible = !document.querySelector('#game-screen').hidden;
  if (!gameVisible || !canSwing) return;
  event.preventDefault();
  swing();
});

async function boot() {
  try {
    settings = await loadSettings();
    audio.setEnabled(!settings.muted);
  } catch {
    settings = { muted: false };
  }
  try {
    career = await loadCareer();
  } catch {
    showFlash('球隊櫃子暫時打不開；仍可先開新生涯。');
  }
  continueButton.hidden = !career;
  showScreen('welcome-screen');
}

boot();
