/** Lightweight SFX helper for pg-yakyu. */

const SOURCES = {
  click: 'assets/sfx/click.ogg',
  swing: 'assets/sfx/swing.ogg',
  hit: 'assets/sfx/bat-hit.ogg',
  catch: 'assets/sfx/catch.ogg',
  out: 'assets/sfx/out.ogg',
  homerun: 'assets/sfx/homerun.ogg',
  win: 'assets/sfx/win.ogg',
  cheer: 'assets/sfx/cheer.ogg',
};

export class YakyuAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.buffers = new Map();
    this.mutedButton = null;
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx?.state === 'suspended') {
      try {
        await Promise.race([
          this.ctx.resume(),
          new Promise((resolve) => window.setTimeout(resolve, 250)),
        ]);
      } catch {
        // Ignore autoplay policy; later user gestures will resume.
      }
    }
    await this.preload();
  }

  async preload() {
    if (!this.ctx) return;
    await Promise.all(Object.entries(SOURCES).map(async ([key, url]) => {
      if (this.buffers.has(key)) return;
      try {
        const response = await fetch(url);
        const data = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data.slice(0));
        this.buffers.set(key, buffer);
      } catch {
        // Keep going; missing cues fall back to silence.
      }
    }));
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.mutedButton) {
      this.mutedButton.setAttribute('aria-pressed', String(!enabled));
      this.mutedButton.textContent = enabled ? '♪' : '🔇';
      this.mutedButton.setAttribute('aria-label', enabled ? '關閉音效' : '開啟音效');
    }
  }

  bindMuteButton(button) {
    this.mutedButton = button;
    button.addEventListener('click', async () => {
      await this.unlock();
      this.setEnabled(!this.enabled);
      this.play('click');
    });
    this.setEnabled(this.enabled);
  }

  play(name, { volume = 0.55, rate = 1 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  ui() {
    this.play('click', { volume: 0.4 });
  }

  pitch() {
    this.play('swing', { volume: 0.22, rate: 1.35 });
  }

  swingMiss() {
    this.play('swing', { volume: 0.5, rate: 0.92 });
    this.play('out', { volume: 0.35, rate: 1.05 });
  }

  hit(result) {
    if (result === 'out') {
      this.play('swing', { volume: 0.35 });
      this.play('catch', { volume: 0.45 });
      this.play('out', { volume: 0.4 });
      return;
    }
    this.play('hit', { volume: 0.7, rate: result === 'homeRun' ? 0.9 : 1 });
    if (result === 'homeRun') {
      this.play('homerun', { volume: 0.55 });
      this.play('cheer', { volume: 0.45 });
    } else if (result === 'double' || result === 'triple') {
      this.play('cheer', { volume: 0.28, rate: 1.08 });
    }
  }

  win() {
    this.play('win', { volume: 0.55 });
    this.play('cheer', { volume: 0.4 });
  }

  lose() {
    this.play('out', { volume: 0.45, rate: 0.85 });
  }
}
