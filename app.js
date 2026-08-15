import { YakyuAudio } from './audio.js';
import { judgeSwing } from './game/batting.js';
import { completeGame, createCareer, growPlayer } from './game/career.js';
import { getOpponent } from './game/data/opponents.js';
import { applyBattingResult, createMatch, simulateHalfInning } from './game/match.js';
import { deleteCareer, loadCareer, saveCareer } from './game/persist.js';

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

let career = null;
let match = null;
let opponent = null;
let pitchProgress = 0;
let pitchFrame = 0;
let pitchStartedAt = 0;
let canSwing = false;
let lastScore = { away: 0, home: 0 };

function showScreen(id) {
  screens.forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

function stageLabel(game) {
  if (!game) return '球季完成';
  if (game.stage === 'final') return '紅土全國賽・決賽';
  if (game.stage === 'playoff') return '紅土全國賽・淘汰戰';
  return `分區預賽・第 ${career.index + 1} 戰`;
}

function renderCareer() {
  const next = career.schedule[career.index];
  document.querySelector('#career-stage').textContent = career.champion
    ? '青砂盃冠軍'
    : career.eliminated
      ? '本季止步'
      : stageLabel(next);
  document.querySelector('#team-heading').textContent = career.team.name;
  document.querySelector('#team-heading').style.color = career.team.color;
  document.querySelector('#career-record').textContent =
    `${career.teamWins} 勝 ${career.teamLosses} 敗・${career.player.name} ${career.player.stats.HIT} 打擊`;

  const playButton = document.querySelector('#play-button');
  if (!next) {
    document.querySelector('#opponent-name').textContent = career.champion ? '青砂盃到手！' : '球季結束';
    document.querySelector('#opponent-region').textContent = '';
    document.querySelector('#opponent-cheer').textContent = career.champion
      ? '你的名字，已經留在這片紅土。'
      : '整理球具，明年再來。';
    playButton.hidden = true;
  } else {
    const nextOpponent = getOpponent(next.opponentId);
    document.querySelector('#home-team').textContent = career.team.name;
    document.querySelector('#opponent-name').textContent = nextOpponent.name;
    document.querySelector('#opponent-region').textContent = `${nextOpponent.region}區・戰力 ${nextOpponent.power}`;
    document.querySelector('#opponent-cheer').textContent = `「${nextOpponent.cheer}」`;
    playButton.hidden = career.eliminated;
    playButton.textContent = next.stage === 'final' ? '踏進決賽紅土' : '開打下一場';
  }

  document.querySelector('#schedule').innerHTML = career.schedule.map((game, index) => {
    const label = game.stage === 'final' ? '決' : index + 1;
    const state = game.result === 'W' ? 'won' : game.result === 'L' ? 'lost' : index === career.index ? 'next' : '';
    return `<span class="${state}" title="${getOpponent(game.opponentId).name}">${game.result ?? label}</span>`;
  }).join('');
}

function openCareer() {
  renderCareer();
  showScreen('career-screen');
}

function inningLabel() {
  const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return `${numerals[match.inning] ?? match.inning}局${match.half === 'top' ? '上' : '下'}`;
}

function renderGame() {
  const scored = match.score.away !== lastScore.away || match.score.home !== lastScore.home;
  document.querySelector('#away-score').textContent = match.score.away;
  document.querySelector('#home-score').textContent = match.score.home;
  document.querySelector('#inning-half').textContent = inningLabel();
  document.querySelector('#outs').textContent = match.outs;
  ['first', 'second', 'third'].forEach((base, index) => {
    document.querySelector(`#base-${base}`).classList.toggle('active', match.bases[index]);
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

function animatePitch(now) {
  const duration = match.inning >= 7 ? 1180 : 1450;
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
  document.querySelector('#at-bat-status').textContent = `${career.player.name}，看準球心！`;
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

function swing(forcedResult, forcedLabel, looked = false) {
  if (!canSwing) return;
  canSwing = false;
  cancelAnimationFrame(pitchFrame);
  document.querySelector('#swing-button').disabled = true;

  const result = forcedResult ?? judgeSwing(pitchProgress - 0.72, career.player.stats);
  applyBattingResult(match, result);
  document.querySelector('#at-bat-status').textContent = forcedLabel ?? battingLabel(result);
  flashResult(looked ? 'out' : result);
  if (looked) audio.swingMiss();
  else audio.hit(result);
  renderGame();
  window.setTimeout(finishInning, 900);
}

function finishInning() {
  if (match.half === 'top') simulateHalfInning(match);
  if (!match.finished && match.half === 'bottom') simulateHalfInning(match);
  renderGame();

  if (match.finished) {
    finishGame();
    return;
  }
  document.querySelector('#at-bat-status').textContent = '隊友守住了，輪到你的打席。';
  window.setTimeout(startPitch, 650);
}

async function finishGame() {
  if (match.score.away === match.score.home) {
    const clutch = career.player.stats.HIT / 100;
    match.score[Math.random() < clutch ? 'away' : 'home'] += 1;
    match.log.push('延長決勝，一分定江山');
  }

  const won = match.score.away > match.score.home;
  completeGame(career, won);
  growPlayer(career.player, won ? 2 : 1);
  await persist();

  document.querySelector('#result-art').src = won
    ? 'assets/baseball-pack/ball.png'
    : 'assets/baseball-pack/glove-closed.png';
  document.querySelector('#result-kicker').textContent = stageLabel(career.schedule[career.index - 1]);
  document.querySelector('#result-title').textContent = won ? '這場拿下！' : '紅土還沒冷';
  document.querySelector('#result-copy').textContent =
    `${career.team.name} ${match.score.away}：${match.score.home} ${opponent.name}。` +
    (career.champion
      ? '青砂盃到手，你的名字留在決賽場。'
      : career.eliminated
        ? '本季止步，但明年還有新的球季。'
        : `打擊能力提升到 ${career.player.stats.HIT}。`);
  if (won) audio.win();
  else audio.lose();
  showScreen('result-screen');
}

function startGame() {
  const game = career.schedule[career.index];
  opponent = getOpponent(game.opponentId);
  match = createMatch(opponent);
  lastScore = { away: 0, home: 0 };
  document.querySelector('#away-name').textContent = career.team.name;
  document.querySelector('#home-name').textContent = opponent.short;
  document.querySelector('#at-bat-status').textContent = opponent.cheer;
  renderGame();
  showScreen('game-screen');
  window.setTimeout(startPitch, 700);
}

function requestNewCareer() {
  if (career) confirmDialog.showModal();
  else showScreen('create-screen');
}

audio.bindMuteButton(document.querySelector('#mute-button'));

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

async function boot() {
  try {
    career = await loadCareer();
  } catch {
    showFlash('球隊櫃子暫時打不開；仍可先開新生涯。');
  }
  continueButton.hidden = !career;
  showScreen('welcome-screen');
}

boot();
