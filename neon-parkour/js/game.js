/* ============================================================
   霓虹疾行 · NEON ROOFTOP RUN
   A self-contained canvas endless runner.
   No external libraries, no network requests.
   ============================================================ */

'use strict';

(() => {
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'neon-rooftop-run.best.v1';
  const MUTE_KEY = 'neon-rooftop-run.muted.v1';

  const $ = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const mod = (n, m) => ((n % m) + m) % m;
  const nowMs = () => performance.now();

  function hash(n) {
    const value = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return value - Math.floor(value);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { distance: 0, score: 0, runs: 0 };
      const saved = JSON.parse(raw);
      return {
        distance: Number.isFinite(saved.distance) ? Math.max(0, Math.floor(saved.distance)) : 0,
        score: Number.isFinite(saved.score) ? Math.max(0, Math.floor(saved.score)) : 0,
        runs: Number.isFinite(saved.runs) ? Math.max(0, Math.floor(saved.runs)) : 0,
      };
    } catch (_) {
      return { distance: 0, score: 0, runs: 0 };
    }
  }

  function saveBest(best) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
    } catch (_) {
      /* Private mode or a blocked storage origin: the run still works. */
    }
  }

  function loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function saveMuted(value) {
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch (_) {
      /* ignore */
    }
  }

  function vibrate(ms) {
    if (!userActivated) return;
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {
      /* ignore */
    }
  }

  /* ---------- DOM ---------- */

  const els = {
    app: $('#app'),
    canvas: $('#game'),
    hud: $('#hud'),
    menuScreen: $('#menuScreen'),
    pauseScreen: $('#pauseScreen'),
    gameoverScreen: $('#gameoverScreen'),
    distance: $('#distance'),
    score: $('#score'),
    shards: $('#shards'),
    hudBest: $('#hudBest'),
    comboBadge: $('#comboBadge'),
    comboValue: $('#comboValue'),
    comboMult: $('#comboMult'),
    comboBar: $('#comboBar'),
    powerups: $('#powerups'),
    speedFill: $('#speedFill'),
    pauseBtn: $('#pauseBtn'),
    flash: $('#flash'),
    toast: $('#toast'),
    toastKicker: $('#toastKicker'),
    toastTitle: $('#toastTitle'),
    toastSub: $('#toastSub'),
    menuBest: $('#menuBest'),
    resultTitle: $('#resultTitle'),
    resultSub: $('#resultSub'),
    resultDistance: $('#resultDistance'),
    resultScore: $('#resultScore'),
    resultShards: $('#resultShards'),
    resultCombo: $('#resultCombo'),
    resultBest: $('#resultBest'),
    newBest: $('#newBest'),
    pauseDistance: $('#pauseDistance'),
    pauseScore: $('#pauseScore'),
    startBtn: $('#startBtn'),
    retryBtn: $('#retryBtn'),
    menuBtn: $('#menuBtn'),
    resumeBtn: $('#resumeBtn'),
    restartPauseBtn: $('#restartPauseBtn'),
    quitPauseBtn: $('#quitPauseBtn'),
    fullscreenBtn: $('#fullscreenBtn'),
    touchJump: $('#touchJump'),
    touchSlide: $('#touchSlide'),
    touchControls: $('#touchControls'),
  };

  const ctx = els.canvas.getContext('2d', { alpha: false });
  const powerEls = {
    shield: $('[data-power="shield"]', els.powerups),
    magnet: $('[data-power="magnet"]', els.powerups),
    boost: $('[data-power="boost"]', els.powerups),
  };

  /* ---------- viewport ---------- */

  const view = {
    w: 1,
    h: 1,
    dpr: 1,
    s: 1,
    groundY: 1,
    playerX: 1,
  };

  let userActivated = false;

  let skyGradient = null;
  let stars = [];
  let game = null;
  let toastTimer = 0;

  function createStars() {
    const count = Math.round(clamp(view.w / 16, 45, 115));
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * view.w,
        y: Math.random() * view.groundY * 0.66,
        r: rand(0.4, 1.65),
        alpha: rand(0.18, 0.85),
        speed: rand(0.3, 1.2),
        phase: rand(0, TAU),
      });
    }
  }

  const cityLayers = [
    {
      factor: 0.045,
      slot: 184,
      minH: 0.09,
      maxH: 0.27,
      base: 0.025,
      color: '#211a40',
      edge: 'rgba(151, 126, 219, .24)',
      window: 'rgba(124, 178, 255, .72)',
      alpha: 0.82,
      seed: 7,
      signs: false,
      canvas: null,
      tileW: 0,
    },
    {
      factor: 0.115,
      slot: 258,
      minH: 0.15,
      maxH: 0.38,
      base: 0.01,
      color: '#120f2b',
      edge: 'rgba(255, 112, 174, .28)',
      window: 'rgba(255, 110, 170, .7)',
      alpha: 0.94,
      seed: 31,
      signs: false,
      canvas: null,
      tileW: 0,
    },
    {
      factor: 0.235,
      slot: 352,
      minH: 0.2,
      maxH: 0.48,
      base: 0.0,
      color: '#090a19',
      edge: 'rgba(100, 244, 255, .28)',
      window: 'rgba(108, 225, 255, .68)',
      alpha: 1,
      seed: 83,
      signs: true,
      canvas: null,
      tileW: 0,
    },
  ];

  function drawCitySign(g, x, y, w, h, text, color) {
    const cell = h / text.length;
    g.save();
    g.fillStyle = 'rgba(4, 6, 14, .9)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = color;
    g.globalAlpha = 0.55;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.globalAlpha = 1;
    g.shadowColor = color;
    g.shadowBlur = 9 * view.s;
    g.fillStyle = color;
    g.font = `700 ${Math.max(7, 9.5 * view.s)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < text.length; i++) {
      g.fillText(text[i], x + w / 2, y + cell * (i + 0.5));
    }
    g.restore();
  }

  function buildCityLayers() {
    const cityDpr = Math.min(view.dpr || 1, 1.25);
    const scale = clamp(view.s, 0.72, 1.22);

    cityLayers.forEach((layer) => {
      const slot = Math.max(84, layer.slot * scale);
      const count = Math.max(6, Math.ceil((view.w + slot * 2) / slot));
      const tileW = Math.round(slot * count);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(tileW * cityDpr));
      canvas.height = Math.max(1, Math.ceil(view.h * cityDpr));
      const g = canvas.getContext('2d');
      g.setTransform(cityDpr, 0, 0, cityDpr, 0, 0);
      g.clearRect(0, 0, tileW, view.h);

      const winW = Math.max(1.6, 3.4 * view.s);
      const winH = Math.max(1.8, 5.2 * view.s);
      const stepX = Math.max(8, 16 * view.s);
      const stepY = Math.max(11, 21 * view.s);

      for (let i = 0; i < count; i++) {
        const r1 = hash(i * 8.17 + layer.seed * 2.13);
        const r2 = hash(i * 3.71 + layer.seed * 5.31);
        const r3 = hash(i * 2.33 + layer.seed * 9.7);
        const r4 = hash(i * 6.91 + layer.seed * 1.7);
        const r5 = hash(i * 4.27 + layer.seed * 3.3);

        const bw = slot * (0.52 + r1 * 0.36);
        const x = i * slot + (slot - bw) / 2;
        const bh = view.h * (layer.minH + r2 * (layer.maxH - layer.minH));
        const top = view.groundY + layer.base * view.s - bh;

        g.fillStyle = layer.color;
        g.fillRect(x, top, bw, view.h - top);
        g.fillStyle = layer.edge;
        g.fillRect(x, top, bw, Math.max(1, 1.3 * view.s));

        /* A stepped rooftop makes the skyline feel hand-built. */
        if (r5 > 0.54) {
          const stepW = bw * (0.18 + r3 * 0.25);
          const stepH = view.h * (0.018 + r4 * 0.03);
          g.fillStyle = layer.color;
          g.fillRect(x + bw * (r4 > 0.5 ? 0.12 : 0.6), top - stepH, stepW, stepH);
          g.fillStyle = layer.edge;
          g.fillRect(x + bw * (r4 > 0.5 ? 0.12 : 0.6), top - stepH, stepW, 1);
        }

        if (r3 > 0.55) {
          const ax = x + bw * (0.2 + r4 * 0.6);
          const ah = view.h * (0.018 + r5 * 0.05);
          g.strokeStyle = layer.edge;
          g.globalAlpha = 0.8;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(ax, top);
          g.lineTo(ax, top - ah);
          g.stroke();
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(255, 78, 132, .75)';
          g.beginPath();
          g.arc(ax, top - ah, Math.max(1, 1.6 * view.s), 0, TAU);
          g.fill();
        }

        const pad = Math.max(4, 7 * view.s);
        const cols = Math.max(1, Math.floor((bw - pad * 2) / stepX));
        const rows = Math.max(1, Math.floor((bh - 8 * view.s) / stepY));
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const wr = hash((i + 1) * 17.17 + col * 4.3 + row * 9.1 + layer.seed);
            if (wr < 0.7) continue;
            g.globalAlpha = 0.16 + wr * 0.55;
            g.fillStyle = layer.window;
            g.fillRect(x + pad + col * stepX, top + pad + row * stepY, winW, winH);
          }
        }
        g.globalAlpha = 1;

        if (layer.signs && r1 > 0.64 && bh > view.h * 0.23 && bw > 42 * scale) {
          const signChars = ['夜', '霓', '上', '海', '行', '07'][(hash(i * 2.9 + 5) * 6) | 0];
          const sw = Math.max(15, 20 * view.s);
          const sh = Math.max(34, 43 * view.s);
          drawCitySign(
            g,
            x + bw * 0.64,
            top + bh * (0.18 + r2 * 0.2),
            sw,
            sh,
            signChars,
            r2 > 0.5 ? 'rgba(255, 90, 155, .8)' : 'rgba(100, 244, 255, .72)'
          );
        }
      }

      layer.canvas = canvas;
      layer.tileW = tileW;
    });
  }

  function measureView() {
    const oldGround = view.groundY;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    view.w = width;
    view.h = height;
    view.dpr = dpr;
    view.s = clamp(Math.min(height / 720, width / 960), 0.58, 1.3);
    view.groundY = Math.round(height * 0.79);
    view.playerX = clamp(width * 0.235, 96, 430);

    els.canvas.width = Math.round(width * dpr);
    els.canvas.height = Math.round(height * dpr);
    els.canvas.style.width = `${width}px`;
    els.canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    skyGradient = ctx.createLinearGradient(0, 0, 0, view.groundY + 30);
    skyGradient.addColorStop(0, '#040611');
    skyGradient.addColorStop(0.26, '#080b22');
    skyGradient.addColorStop(0.52, '#150d32');
    skyGradient.addColorStop(0.72, '#2d1039');
    skyGradient.addColorStop(0.88, '#57163f');
    skyGradient.addColorStop(1, '#7b2043');

    createStars();
    buildCityLayers();

    if (game && game.player) {
      const delta = view.groundY - oldGround;
      if (game.state === 'menu') {
        game.player.y = view.groundY;
      } else if (Number.isFinite(delta)) {
        game.player.y += delta;
      }
    }
  }

  /* ---------- audio ---------- */

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.muted = loadMuted();
      this.lastCoin = 0;
      this.syncButtons();
    }

    ensure() {
      if (this.muted) return false;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.62;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    toggle() {
      this.muted = !this.muted;
      saveMuted(this.muted);
      this.syncButtons();
      if (!this.muted) {
        this.ensure();
        if (this.master) {
          const t = this.ctx.currentTime;
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setTargetAtTime(0.62, t, 0.015);
        }
        this.ui();
      } else if (this.ctx && this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(0.0001, t, 0.02);
      }
    }

    syncButtons() {
      document.querySelectorAll('.js-sound').forEach((button) => {
        button.classList.toggle('is-muted', this.muted);
        button.setAttribute('aria-label', this.muted ? '开启声音' : '关闭声音');
      });
    }

    tone(freq, endFreq, duration, type = 'sine', volume = 0.05, delay = 0) {
      if (!this.ensure() || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.04);
    }

    noise(duration = 0.15, volume = 0.05, filterFreq = 900, type = 'lowpass', delay = 0) {
      if (!this.ensure() || !this.ctx) return;
      if (!this.noiseBuffer) {
        const length = Math.floor(this.ctx.sampleRate * 0.7);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      }
      const t = this.ctx.currentTime + delay;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(filterFreq, t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.35), t + duration);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t);
      source.stop(t + duration + 0.03);
    }

    ui() {
      this.tone(620, 780, 0.06, 'square', 0.018);
    }

    start() {
      if (!this.ensure()) return;
      this.tone(196, 196, 0.24, 'sine', 0.028);
      this.tone(294, 294, 0.28, 'triangle', 0.024, 0.045);
      this.tone(392, 588, 0.32, 'sine', 0.022, 0.09);
    }

    jump() {
      this.tone(280, 590, 0.14, 'triangle', 0.045);
      this.noise(0.06, 0.014, 1600, 'highpass');
    }

    doubleJump() {
      this.tone(500, 980, 0.16, 'triangle', 0.04);
      this.tone(760, 1180, 0.13, 'sine', 0.025, 0.025);
    }

    slide() {
      this.noise(0.2, 0.035, 1400, 'bandpass');
      this.tone(180, 95, 0.18, 'sine', 0.02);
    }

    land() {
      this.tone(120, 76, 0.09, 'sine', 0.035);
      this.noise(0.05, 0.016, 700);
    }

    coin(combo) {
      const time = nowMs();
      if (time - this.lastCoin < 28) return;
      this.lastCoin = time;
      const base = 780 + (combo % 8) * 42;
      this.tone(base, base * 1.4, 0.1, 'triangle', 0.026);
      this.tone(base * 2, base * 2, 0.07, 'sine', 0.012, 0.03);
    }

    power() {
      [392, 523, 659, 784].forEach((freq, index) => {
        this.tone(freq, freq * 1.02, 0.16, 'triangle', 0.032, index * 0.055);
      });
    }

    boostWarning(final = false) {
      const base = final ? 580 : 760;
      this.tone(base, base * 0.88, 0.11, 'square', 0.024);
      this.tone(base * 1.22, base * 1.22, 0.09, 'square', 0.02, 0.13);
      if (final) {
        this.tone(base * 0.75, base * 0.62, 0.2, 'triangle', 0.028, 0.25);
      }
    }

    shieldBreak() {
      this.noise(0.24, 0.06, 2600, 'highpass');
      this.tone(900, 240, 0.26, 'sawtooth', 0.035);
    }

    smash() {
      this.noise(0.15, 0.05, 1100);
      this.tone(160, 60, 0.16, 'square', 0.03);
    }

    hit() {
      this.noise(0.34, 0.07, 700);
      this.tone(140, 48, 0.5, 'sawtooth', 0.045);
    }

    milestone() {
      [659, 880, 1175].forEach((freq, index) => {
        this.tone(freq, freq, 0.2, 'sine', 0.027, index * 0.07);
      });
    }

    newRecord() {
      [523, 659, 784, 1047].forEach((freq, index) => {
        this.tone(freq, freq * 1.01, 0.3, 'triangle', 0.03, index * 0.09);
      });
    }

    death() {
      this.tone(330, 72, 0.66, 'sawtooth', 0.035);
      this.noise(0.4, 0.04, 900);
    }
  }

  const sound = new AudioEngine();

  /* ---------- shared visual state ---------- */

  function flashScreen(color) {
    els.flash.style.background = color || 'radial-gradient(circle at 50% 55%, rgba(255,83,138,.75), rgba(255,61,139,.24) 48%, transparent 76%)';
    els.flash.classList.remove('is-active');
    void els.flash.offsetWidth;
    els.flash.classList.add('is-active');
  }

  function showToast(kicker, title, sub, kind = '', duration = 2850) {
    els.toastKicker.textContent = kicker;
    els.toastTitle.textContent = title;
    els.toastSub.textContent = sub;
    els.toast.dataset.kind = kind;
    els.toast.classList.remove('show');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    const line = $('.toast-line', els.toast);
    if (line) {
      line.style.animation = 'none';
      void line.offsetWidth;
      line.style.animation = '';
      line.style.animationDuration = `${duration}ms`;
    }
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('show');
    }, duration);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    els.toast.classList.remove('show');
  }

  /* ---------- drawing: sky and city ---------- */

  function drawStars() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const drift = game ? game.cameraX * 0.008 : 0;
    for (const star of stars) {
      const x = mod(star.x - drift, view.w);
      const twinkle = 0.55 + Math.sin((game ? game.time : 0) * star.speed + star.phase) * 0.45;
      const alpha = star.alpha * twinkle;
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.r > 1.15 ? '#c9fbff' : '#d9e8ff';
      ctx.beginPath();
      ctx.arc(x, star.y, star.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSun() {
    const cx = view.w * 0.73;
    const cy = view.groundY * 0.43;
    const radius = Math.min(view.w * 0.185, view.h * 0.245);
    const time = game ? game.time : 0;

    ctx.save();
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.6);
    glow.addColorStop(0, 'rgba(255, 130, 166, .24)');
    glow.addColorStop(0.35, 'rgba(255, 76, 138, .12)');
    glow.addColorStop(0.7, 'rgba(255, 61, 139, .04)');
    glow.addColorStop(1, 'rgba(255, 61, 139, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius * 2.7, cy - radius * 2.7, radius * 5.4, radius * 5.4);

    const disc = ctx.createLinearGradient(0, cy - radius, 0, cy + radius);
    disc.addColorStop(0, '#ffe0b2');
    disc.addColorStop(0.3, '#ffc07e');
    disc.addColorStop(0.65, '#ff7b9f');
    disc.addColorStop(1, '#ff3d8b');

    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fillStyle = disc;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      const offset = radius * (0.03 + i * 0.115);
      const barHeight = radius * (0.012 + i * 0.007);
      ctx.fillStyle = `rgba(22, 9, 35, ${0.36 + i * 0.045})`;
      ctx.fillRect(cx - radius, cy + offset, radius * 2, barHeight);
    }
    ctx.restore();

    ctx.globalAlpha = 0.18 + Math.sin(time * 0.5) * 0.03;
    ctx.strokeStyle = '#ffd0da';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.04, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const halo = ctx.createLinearGradient(0, view.groundY * 0.58, 0, view.groundY + 20);
    halo.addColorStop(0, 'rgba(255, 108, 147, 0)');
    halo.addColorStop(0.55, 'rgba(255, 96, 141, .05)');
    halo.addColorStop(1, 'rgba(255, 61, 139, .13)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, view.groundY * 0.56, view.w, view.groundY * 0.46);
  }

  function drawCity() {
    const camX = game ? game.cameraX : 0;
    for (let l = 0; l < cityLayers.length; l++) {
      const layer = cityLayers[l];
      if (!layer.canvas) continue;
      const offset = mod(camX * layer.factor, layer.tileW);
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      for (let x = -offset; x < view.w; x += layer.tileW) {
        ctx.drawImage(layer.canvas, x, 0, layer.tileW, view.h);
      }
      ctx.restore();
    }
  }

  function drawFlyingCars() {
    const time = game ? game.time : 0;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const span = view.w + 360;
      const x = mod(time * (10 + i * 5) + i * 397 + 120, span) - 180;
      const y = view.groundY * (0.2 + i * 0.105) + Math.sin(time * 0.7 + i * 2) * 7;
      const color = i === 1 ? '255, 93, 155' : '100, 244, 255';
      const trail = ctx.createLinearGradient(x - 42, y, x, y);
      trail.addColorStop(0, `rgba(${color}, 0)`);
      trail.addColorStop(1, `rgba(${color}, .28)`);
      ctx.strokeStyle = trail;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 42, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(${color}, .8)`;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawMotes() {
    const time = game ? game.time : 0;
    const camX = game ? game.cameraX : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const span = view.w + 200;
      const x = mod(i * 173 + time * (4 + (i % 5) * 2) - camX * 0.07, span) - 100;
      const y = view.groundY * (0.2 + hash(i * 7.3) * 0.58) + Math.sin(time * 0.5 + i) * 13;
      const alpha = 0.06 + hash(i * 3.9) * 0.14;
      ctx.globalAlpha = alpha * (0.55 + Math.sin(time * 1.2 + i) * 0.45);
      ctx.fillStyle = i % 4 === 0 ? '#ff7aa9' : '#8de9ff';
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + hash(i * 8.1) * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- drawing: rooftop ---------- */

  function visibleGaps() {
    if (!game || game.state === 'menu') return [];
    const from = game.cameraX - 120;
    const to = game.cameraX + view.w + 120;
    return game.gaps
      .filter((gap) => gap.x + gap.w > from && gap.x < to)
      .sort((a, b) => a.x - b.x);
  }

  function roofSegments(gaps) {
    const from = game.cameraX - 120;
    const to = game.cameraX + view.w + 120;
    let segments = [[from, to]];
    for (const gap of gaps) {
      const next = [];
      for (const segment of segments) {
        const [a, b] = segment;
        const g0 = gap.x;
        const g1 = gap.x + gap.w;
        if (g1 <= a || g0 >= b) {
          next.push(segment);
        } else {
          if (g0 > a) next.push([a, Math.min(b, g0)]);
          if (g1 < b) next.push([Math.max(a, g1), b]);
        }
      }
      segments = next;
    }
    return segments.filter(([a, b]) => b - a > 1);
  }

  function drawGapBack(gap) {
    const x = gap.x - game.cameraX;
    const w = gap.w;
    if (x > view.w + 80 || x + w < -80) return;
    const top = view.groundY;
    const depth = view.h - top;

    const dark = ctx.createLinearGradient(0, top, 0, view.h);
    dark.addColorStop(0, 'rgba(3, 4, 10, .94)');
    dark.addColorStop(0.42, 'rgba(8, 5, 18, .96)');
    dark.addColorStop(0.82, 'rgba(24, 5, 22, .94)');
    dark.addColorStop(1, 'rgba(35, 7, 25, .98)');
    ctx.fillStyle = dark;
    ctx.fillRect(x, top - 2, w, depth + 2);

    ctx.save();
    const glow = ctx.createRadialGradient(x + w / 2, view.h, 4, x + w / 2, view.h, w * 1.4);
    glow.addColorStop(0, 'rgba(255, 61, 139, .2)');
    glow.addColorStop(0.5, 'rgba(255, 61, 139, .07)');
    glow.addColorStop(1, 'rgba(255, 61, 139, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - w * 0.7, top, w * 2.4, depth);

    /* Neon spilling over the broken lip. */
    const lip = ctx.createLinearGradient(0, top, 0, top + 54 * game.s);
    lip.addColorStop(0, 'rgba(255, 76, 141, .3)');
    lip.addColorStop(0.35, 'rgba(255, 61, 139, .08)');
    lip.addColorStop(1, 'rgba(255, 61, 139, 0)');
    ctx.fillStyle = lip;
    ctx.fillRect(x, top, w, 54 * game.s);

    /* Faint floors receding into the alley. */
    ctx.strokeStyle = 'rgba(112, 136, 202, .1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = top + depth * (0.17 + i * 0.19);
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + w - 3, y);
      ctx.stroke();
    }

    /* Vertical droplets of light fall into the dark. */
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const lx = x + w * (0.12 + hash(i * 7.4 + gap.x) * 0.76);
      const ly = top + depth * (0.18 + hash(i * 2.3 + gap.x) * 0.62);
      ctx.globalAlpha = 0.08 + hash(i * 6.1) * 0.2;
      ctx.strokeStyle = i % 2 ? '#ff5a9e' : '#6feaff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly + 20 * game.s);
      ctx.stroke();
    }

    /* A couple of far-away windows keep the abyss from feeling empty. */
    for (let i = 0; i < 4; i++) {
      const wx = x + w * (0.18 + hash(i * 5.2 + gap.x) * 0.64);
      const wy = top + depth * (0.22 + hash(i * 7.9 + gap.x) * 0.46);
      ctx.globalAlpha = 0.12 + hash(i * 3.1) * 0.2;
      ctx.fillStyle = i % 2 ? '#ff5a9e' : '#6feaff';
      ctx.fillRect(wx, wy, 2.5, 1.5);
    }
    ctx.restore();

    /* Bright danger rim along both sides of the hole. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 100, 160, .55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top - 0.5);
    ctx.lineTo(x + w, top - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoofSegment(a, b, gaps) {
    const sx = a - game.cameraX;
    const ex = b - game.cameraX;
    if (ex < -40 || sx > view.w + 40) return;
    const x = Math.max(-40, sx);
    const right = Math.min(view.w + 40, ex);
    const width = Math.max(0, right - x);
    if (width <= 0) return;

    const top = view.groundY;
    const bottom = view.h;
    const face = ctx.createLinearGradient(0, top, 0, bottom);
    face.addColorStop(0, '#11172c');
    face.addColorStop(0.12, '#0c1022');
    face.addColorStop(0.55, '#070a16');
    face.addColorStop(1, '#04050d');
    ctx.fillStyle = face;
    ctx.fillRect(x, top, width, bottom - top + 2);

    /* Top deck: a bright lip, then a dark inset walkway. */
    const deck = ctx.createLinearGradient(0, top, 0, top + 30 * game.s);
    deck.addColorStop(0, 'rgba(41, 62, 92, .88)');
    deck.addColorStop(0.18, 'rgba(22, 32, 55, .9)');
    deck.addColorStop(1, 'rgba(8, 11, 22, .2)');
    ctx.fillStyle = deck;
    ctx.fillRect(x, top, width, 32 * game.s);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(100, 244, 255, .58)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top + 0.75);
    ctx.lineTo(right, top + 0.75);
    ctx.stroke();
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(52, 197, 230, .42)';
    ctx.beginPath();
    ctx.moveTo(x, top + 2);
    ctx.lineTo(right, top + 2);
    ctx.stroke();
    ctx.restore();

    /* Roof seams and little running lights travel with the world. */
    const tile = 82 * game.s;
    const first = Math.ceil(a / tile) * tile;
    for (let wx = first; wx < b; wx += tile) {
      const px = wx - game.cameraX;
      if (px < -20 || px > view.w + 20) continue;
      ctx.fillStyle = 'rgba(111, 154, 205, .14)';
      ctx.fillRect(px, top + 4, 1, 18 * game.s);
      if (hash(wx * 0.17) > 0.72) {
        ctx.fillStyle = 'rgba(100, 244, 255, .25)';
        ctx.fillRect(px - 7, top + 26 * game.s, 14, 1);
      }
    }

    /* Staggered dashes along the edge suggest speed and height. */
    const dash = 150 * game.s;
    const dashStart = Math.ceil(a / dash) * dash;
    for (let wx = dashStart; wx < b; wx += dash) {
      const px = wx - game.cameraX;
      if (px < -50 || px > view.w + 50) continue;
      ctx.fillStyle = 'rgba(132, 181, 224, .11)';
      ctx.fillRect(px, top + 13 * game.s, 34 * game.s, 1);
    }

    /* Low-profile deck furniture is decorative only. */
    const propTile = 278 * game.s;
    const propStart = Math.ceil(a / propTile) * propTile;
    for (let wx = propStart; wx < b; wx += propTile) {
      const r = hash(wx * 0.031 + 4.7);
      if (r < 0.48) continue;
      const px = wx - game.cameraX;
      const ph = (5 + r * 9) * game.s;
      ctx.fillStyle = 'rgba(22, 30, 51, .85)';
      ctx.fillRect(px, top - ph, 20 * game.s, ph);
      ctx.fillStyle = 'rgba(95, 137, 180, .28)';
      ctx.fillRect(px, top - ph, 20 * game.s, 1);
      if (r > 0.78) {
        ctx.strokeStyle = 'rgba(117, 146, 199, .16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 5 * game.s, top - ph);
        ctx.lineTo(px + 5 * game.s, top - ph - 13 * game.s);
        ctx.stroke();
      }
    }

    /* Windows on the facade far below. */
    const winStepX = 36 * game.s;
    const winStepY = 42 * game.s;
    const winStart = Math.ceil(a / winStepX) * winStepX;
    for (let row = 0; row < 3; row++) {
      const wy = top + (48 + row * winStepY) * game.s;
      if (wy > view.h - 10) break;
      for (let wx = winStart; wx < b; wx += winStepX) {
        const px = wx - game.cameraX;
        if (px < -10 || px > view.w + 10) continue;
        const r = hash(wx * 0.11 + row * 7.1);
        if (r < 0.66) continue;
        ctx.globalAlpha = 0.07 + r * 0.16;
        ctx.fillStyle = row === 1 ? 'rgba(255, 89, 150, 1)' : 'rgba(93, 195, 233, 1)';
        ctx.fillRect(px, wy, 7 * game.s, 9 * game.s);
      }
    }
    ctx.globalAlpha = 1;

    /* Side faces at alley edges get a hot neon trim. */
    const leftIsGap = gaps.some((gap) => Math.abs(gap.x + gap.w - a) < 1);
    const rightIsGap = gaps.some((gap) => Math.abs(gap.x - b) < 1);
    if (leftIsGap) drawRoofEdge(sx, 'left');
    if (rightIsGap) drawRoofEdge(ex, 'right');

    /* Warning markings on both lips of a gap. */
    const gapAtRight = gaps.some((gap) => Math.abs(gap.x - b) < 1.5);
    const gapAtLeft = gaps.some((gap) => Math.abs(gap.x + gap.w - a) < 1.5);
    if (gapAtRight) {
      const warning = Math.min(100 * game.s, width);
      drawGapWarning(right - warning, warning, game.s);
      ctx.fillStyle = 'rgba(255, 61, 139, .85)';
      ctx.fillRect(right - 2 * game.s, top - 1, 2 * game.s, 3 * game.s);
    }
    if (gapAtLeft) {
      const warning = Math.min(100 * game.s, width);
      drawGapWarning(x, warning, game.s);
      ctx.fillStyle = 'rgba(255, 61, 139, .85)';
      ctx.fillRect(x, top - 1, 2 * game.s, 3 * game.s);
    }
  }

  function drawGapWarning(x, width, s) {
    if (width <= 0) return;
    const top = view.groundY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top + 3, width, 25 * s);
    ctx.clip();
    ctx.fillStyle = 'rgba(46, 7, 24, .7)';
    ctx.fillRect(x, top + 3, width, 25 * s);
    ctx.fillStyle = 'rgba(255, 61, 139, .34)';
    for (let i = 0; i < 11; i++) {
      ctx.save();
      ctx.translate(x + i * 15 * s, top + 5);
      ctx.rotate(-0.58);
      ctx.fillRect(0, -16 * s, 6.5 * s, 50 * s);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255, 101, 160, .42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top + 28 * s);
    ctx.lineTo(x + width, top + 28 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoofEdge(screenX, side) {
    if (screenX < -20 || screenX > view.w + 20) return;
    const top = view.groundY;
    const color = side === 'left' ? '100, 244, 255' : '255, 61, 139';
    const glow = ctx.createLinearGradient(0, top, 0, top + 190 * game.s);
    glow.addColorStop(0, `rgba(${color}, .72)`);
    glow.addColorStop(0.25, `rgba(${color}, .24)`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    ctx.save();
    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX, top);
    ctx.lineTo(screenX + (side === 'left' ? -1 : 1) * 2, top + 180 * game.s);
    ctx.stroke();

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = `rgba(${color}, .55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenX + (side === 'left' ? -7 : 7), top + 3);
    ctx.lineTo(screenX + (side === 'left' ? -4 : 4), top + 33 * game.s);
    ctx.stroke();

    /* Broken concrete teeth at the lip. */
    ctx.fillStyle = 'rgba(12, 16, 29, .95)';
    for (let i = 0; i < 3; i++) {
      const w = (8 + hash(screenX + i) * 10) * game.s;
      const h = (4 + hash(screenX * 2 + i) * 9) * game.s;
      const offset = (side === 'left' ? -1 : 1) * (4 + i * 5) * game.s;
      ctx.beginPath();
      ctx.moveTo(screenX + offset, top);
      ctx.lineTo(screenX + offset + w * (side === 'left' ? -1 : 1), top);
      ctx.lineTo(screenX + offset + w * 0.35 * (side === 'left' ? -1 : 1), top + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoof() {
    const gaps = visibleGaps();
    for (const gap of gaps) drawGapBack(gap);
    const segments = roofSegments(gaps);
    for (const [a, b] of segments) drawRoofSegment(a, b, gaps);
    if (game.isGapProtected()) drawDashBridges(gaps);
  }

  function drawDashBridges(gaps) {
    const s = game.s;
    const strength = game.boostTimer > 0
      ? 1
      : clamp(game.dashGraceTimer / BOOST_GRACE, 0, 1);
    if (strength <= 0.01) return;

    for (const gap of gaps) {
      const x = gap.x - game.cameraX;
      const w = gap.w;
      if (x > view.w + 40 || x + w < -40) continue;
      const y = view.groundY;
      const pulse = 0.65 + Math.sin(game.time * 16) * 0.35;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = strength;

      const glow = ctx.createLinearGradient(0, y, 0, y + 32 * s);
      glow.addColorStop(0, `rgba(255, 209, 102, ${0.22 * pulse})`);
      glow.addColorStop(0.35, 'rgba(255, 174, 87, .06)');
      glow.addColorStop(1, 'rgba(255, 174, 87, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, w, 32 * s);

      const line = ctx.createLinearGradient(x, 0, x + w, 0);
      line.addColorStop(0, `rgba(255, 209, 102, ${0.45 * pulse})`);
      line.addColorStop(0.5, `rgba(255, 245, 198, ${0.9 * pulse})`);
      line.addColorStop(1, `rgba(255, 209, 102, ${0.45 * pulse})`);
      ctx.fillStyle = line;
      ctx.fillRect(x, y - 1.5 * s, w, 2.6 * s);

      const spacing = 28 * s;
      const offset = mod(game.time * 260, spacing);
      ctx.strokeStyle = `rgba(255, 236, 176, ${0.5 * pulse})`;
      ctx.lineWidth = 1.2 * s;
      for (let cx = x + offset - spacing; cx < x + w; cx += spacing) {
        if (cx < x - spacing || cx > x + w) continue;
        ctx.beginPath();
        ctx.moveTo(cx, y + 4 * s);
        ctx.lineTo(cx + 6 * s, y + 9 * s);
        ctx.lineTo(cx + 12 * s, y + 4 * s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ---------- drawing: collectibles ---------- */

  function drawCoins() {
    if (!game || game.state === 'menu') return;
    const s = game.s;
    const baseY = view.groundY;
    ctx.save();
    for (const coin of game.coins) {
      const x = coin.x - game.cameraX;
      if (x < -40 || x > view.w + 40) continue;
      const y = baseY - coin.offset + Math.sin(game.time * 3 + coin.phase) * 3.5 * s;
      const spin = 0.46 + Math.abs(Math.cos(game.time * 4.4 + coin.phase)) * 0.54;
      const r = 10.5 * s;

      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, y, 1, x, y, r * 2.8);
      glow.addColorStop(0, 'rgba(255, 220, 128, .32)');
      glow.addColorStop(0.45, 'rgba(255, 186, 82, .13)');
      glow.addColorStop(1, 'rgba(255, 166, 70, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 2.8, y - r * 2.8, r * 5.6, r * 5.6);

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(spin, 1);
      ctx.shadowColor = 'rgba(255, 196, 82, .7)';
      ctx.shadowBlur = 9 * s;
      const grad = ctx.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#fff9da');
      grad.addColorStop(0.32, '#ffe08a');
      grad.addColorStop(0.7, '#ffc14f');
      grad.addColorStop(1, '#ff8e4f');
      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(255, 251, 226, .95)';
      ctx.lineWidth = Math.max(0.8, 1.1 * s);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.46);
      ctx.lineTo(r * 0.78, -r * 0.08);
      ctx.lineTo(0, r * 1.34);
      ctx.lineTo(-r * 0.78, -r * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = 'rgba(255, 255, 255, .95)';
      ctx.lineWidth = Math.max(0.8, 1.1 * s);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.82);
      ctx.lineTo(0, r * 0.76);
      ctx.stroke();
      ctx.restore();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPickups() {
    if (!game || game.state === 'menu') return;
    const s = game.s;
    for (const item of game.pickups) {
      const x = item.x - game.cameraX;
      if (x < -60 || x > view.w + 60) continue;
      const y = view.groundY - item.offset + Math.sin(game.time * 2.4 + item.phase) * 5 * s;
      const colors = {
        shield: ['#64f4ff', 'rgba(100,244,255,'],
        magnet: ['#ff5e9e', 'rgba(255,94,158,'],
        boost: ['#ffd166', 'rgba(255,209,102,'],
      };
      const [color, rgba] = colors[item.kind] || colors.shield;
      const radius = 18.5 * s;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, y, 2, x, y, radius * 2.5);
      glow.addColorStop(0, `${rgba}.32)`);
      glow.addColorStop(1, `${rgba}0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius * 2.5, y - radius * 2.5, radius * 5, radius * 5);
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(game.time * 0.7 + item.phase);
      ctx.strokeStyle = `${rgba}.55)`;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4 * s, 5 * s]);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.35, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.rotate(-game.time * 0.7 - item.phase);
      ctx.fillStyle = 'rgba(7, 12, 25, .9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3 * s;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = -Math.PI / 2 + (i / 6) * TAU;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * s;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.7 * s;
      ctx.lineCap = 'round';
      if (item.kind === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -7 * s);
        ctx.lineTo(6 * s, -4 * s);
        ctx.lineTo(5.4 * s, 2.2 * s);
        ctx.quadraticCurveTo(4 * s, 6 * s, 0, 8 * s);
        ctx.quadraticCurveTo(-4 * s, 6 * s, -5.4 * s, 2.2 * s);
        ctx.lineTo(-6 * s, -4 * s);
        ctx.closePath();
        ctx.stroke();
      } else if (item.kind === 'magnet') {
        ctx.beginPath();
        ctx.arc(0, 1 * s, 5.2 * s, Math.PI, 0);
        ctx.lineTo(5.2 * s, 6.5 * s);
        ctx.moveTo(-5.2 * s, 0);
        ctx.lineTo(-5.2 * s, 6.5 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-6.5 * s, 6.5 * s);
        ctx.lineTo(-3.6 * s, 6.5 * s);
        ctx.moveTo(6.5 * s, 6.5 * s);
        ctx.lineTo(3.6 * s, 6.5 * s);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(1.5 * s, -8 * s);
        ctx.lineTo(-5.5 * s, 1.5 * s);
        ctx.lineTo(-0.5 * s, 1.5 * s);
        ctx.lineTo(-2 * s, 8.5 * s);
        ctx.lineTo(6 * s, -2 * s);
        ctx.lineTo(1 * s, -2 * s);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }
  }

  /* ---------- drawing: obstacles ---------- */

  function drawObstacle(ob) {
    const x = ob.x - game.cameraX;
    if (x < -180 || x > view.w + 180) return;
    const s = game.s;
    const y = view.groundY - ob.base - ob.h;

    if (ob.type === 'crate') {
      drawCrate(ob, x, y, s);
    } else if (ob.type === 'vent') {
      drawVent(ob, x, y, s);
    } else if (ob.type === 'spikes') {
      drawSpikes(ob, x, y, s);
    } else if (ob.type === 'beam') {
      drawBeam(ob, x, y, s);
    } else if (ob.type === 'drone') {
      drawDrone(ob, x, y, s);
    }
  }

  function drawCrate(ob, x, y, s) {
    const w = ob.w;
    const h = ob.h;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, view.groundY + 1, w * 0.54, 3.4 * s, 0, 0, TAU);
    ctx.fill();

    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, '#24354e');
    body.addColorStop(0.5, '#121c31');
    body.addColorStop(1, '#080d19');
    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(111, 178, 220, .45)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, w, h, 4 * s);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(100, 244, 255, .18)';
    ctx.fillRect(x + 5 * s, y + 5 * s, w - 10 * s, 1.2 * s);
    ctx.strokeStyle = 'rgba(255, 93, 155, .42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8 * s, y + h - 9 * s);
    ctx.lineTo(x + w - 8 * s, y + h - 9 * s);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4 * s, y + h * 0.48, w - 8 * s, h * 0.28);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 203, 104, .65)';
    ctx.lineWidth = 3 * s;
    for (let i = -2; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 13 * s, y + h * 0.5);
      ctx.lineTo(x + i * 13 * s + 24 * s, y + h * 0.85);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(230, 242, 255, .55)';
    ctx.font = `700 ${7 * s}px "Bahnschrift", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('CARGO / 07', x + 8 * s, y + h * 0.35);
    ctx.restore();
  }

  function drawVent(ob, x, y, s) {
    const w = ob.w;
    const h = ob.h;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, view.groundY + 1, w * 0.58, 3.4 * s, 0, 0, TAU);
    ctx.fill();

    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, '#173f4b');
    body.addColorStop(0.42, '#0e2530');
    body.addColorStop(1, '#07121a');
    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(120, 240, 255, .38)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y + 7 * s, w, h - 7 * s, 5 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1d4a52';
    roundRectPath(ctx, x + 5 * s, y, w - 10 * s, 9 * s, 3 * s);
    ctx.fill();

    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.44);
    ctx.rotate(game.time * 3.2 + ob.phase);
    ctx.strokeStyle = 'rgba(102, 245, 255, .6)';
    ctx.lineWidth = 2 * s;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((i / 4) * TAU) * 11 * s, Math.sin((i / 4) * TAU) * 11 * s);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(102, 245, 255, .24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.44, 13 * s, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(114, 200, 220, .2)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 10 * s, y + h - (16 + i * 8) * s);
      ctx.lineTo(x + w - 10 * s, y + h - (16 + i * 8) * s);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 93, 155, .55)';
    ctx.fillRect(x + 6 * s, y + h - 5 * s, w - 12 * s, 1.2 * s);
    ctx.restore();
  }

  function drawSpikes(ob, x, y, s) {
    const w = ob.w;
    const h = ob.h;
    ctx.save();
    ctx.fillStyle = 'rgba(5, 7, 14, .92)';
    roundRectPath(ctx, x, view.groundY - 7 * s, w, 7 * s, 2 * s);
    ctx.fill();
    const count = 4;
    const step = w / count;
    for (let i = 0; i < count; i++) {
      const spikeGrad = ctx.createLinearGradient(0, y, 0, view.groundY);
      spikeGrad.addColorStop(0, '#ffe49a');
      spikeGrad.addColorStop(0.4, '#ffb24d');
      spikeGrad.addColorStop(1, '#a6314d');
      ctx.fillStyle = spikeGrad;
      ctx.strokeStyle = 'rgba(255, 234, 171, .55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + step * (i + 0.07), view.groundY - 2 * s);
      ctx.lineTo(x + step * (i + 0.5), y);
      ctx.lineTo(x + step * (i + 0.93), view.groundY - 2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x + step * (i + 0.5), y + 7 * s, 1.6 * s, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255, 61, 139, .35)';
    ctx.fillRect(x, view.groundY - 9 * s, w, 1);
    ctx.restore();
  }

  function drawBeam(ob, x, y, s) {
    const w = ob.w;
    const h = ob.h;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(147, 165, 219, .32)';
    ctx.lineWidth = 1.2;
    for (const cx of [x + 12 * s, x + w - 12 * s]) {
      ctx.beginPath();
      ctx.moveTo(cx, -20);
      ctx.quadraticCurveTo(cx + 5 * s, y * 0.5, cx, y + 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.shadowColor = 'rgba(255, 61, 139, .65)';
    ctx.shadowBlur = 22 * s;
    ctx.fillStyle = 'rgba(37, 8, 31, .92)';
    roundRectPath(ctx, x, y, w, h, 3 * s);
    ctx.fill();
    ctx.restore();

    const body = ctx.createLinearGradient(x, y, x, y + h);
    body.addColorStop(0, 'rgba(74, 22, 55, .95)');
    body.addColorStop(0.5, 'rgba(29, 10, 31, .96)');
    body.addColorStop(1, 'rgba(13, 7, 20, .95)');
    ctx.fillStyle = body;
    roundRectPath(ctx, x, y, w, h, 3 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 74, 145, .75)';
    ctx.lineWidth = 1.3 * s;
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.2 + Math.sin(game.time * 4 + ob.phase) * 0.08;
    ctx.fillStyle = '#ff3d8b';
    ctx.fillRect(x + 4 * s, y + h * 0.32, w - 8 * s, 1.5 * s);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff9ec4';
    ctx.font = `700 ${7.4 * s}px "Bahnschrift", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SLIDE / 滑铲', x + w / 2, y + h * 0.34);
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 226, 237, .72)';
    ctx.font = `700 ${10 * s}px "Bahnschrift", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('↓', x + w / 2, y + h * 0.69);

    ctx.strokeStyle = 'rgba(255, 74, 145, .4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const px = x + w * (0.13 + i * 0.21);
      ctx.beginPath();
      ctx.moveTo(px - 3 * s, y + h - 7 * s);
      ctx.lineTo(px, y + h - 3 * s);
      ctx.lineTo(px + 3 * s, y + h - 7 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrone(ob, x, y, s) {
    const w = ob.w;
    const h = ob.h;
    const bob = Math.sin(game.time * 3.2 + ob.phase) * 3.4 * s;
    const cx = x + w / 2;
    const cy = y + h / 2 + bob;
    ctx.save();

    const cone = ctx.createLinearGradient(0, cy, 0, view.groundY);
    cone.addColorStop(0, 'rgba(255, 61, 139, .14)');
    cone.addColorStop(1, 'rgba(255, 61, 139, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * s, cy);
    ctx.lineTo(cx + 6 * s, cy);
    ctx.lineTo(cx + 42 * s, view.groundY);
    ctx.lineTo(cx - 42 * s, view.groundY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(13, 17, 31, .96)';
    ctx.strokeStyle = 'rgba(255, 93, 155, .6)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, cx - w * 0.34, cy - 8 * s, w * 0.68, 16 * s, 7 * s);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(150, 193, 230, .55)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.46, cy - 9 * s);
    ctx.lineTo(cx - w * 0.2, cy - 4 * s);
    ctx.moveTo(cx + w * 0.46, cy - 9 * s);
    ctx.lineTo(cx + w * 0.2, cy - 4 * s);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx - w * 0.42, cy - 10 * s);
    ctx.rotate(game.time * 24 + ob.phase);
    ctx.strokeStyle = 'rgba(143, 221, 255, .45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * s, 2.5 * s, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(cx + w * 0.42, cy - 10 * s);
    ctx.rotate(-game.time * 24 + ob.phase);
    ctx.strokeStyle = 'rgba(143, 221, 255, .45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 * s, 2.5 * s, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const eyeGlow = ctx.createRadialGradient(cx, cy + 1, 0, cx, cy + 1, 12 * s);
    eyeGlow.addColorStop(0, 'rgba(255, 70, 120, .65)');
    eyeGlow.addColorStop(1, 'rgba(255, 70, 120, 0)');
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 12 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff557e';
    ctx.beginPath();
    ctx.arc(cx + 2 * s, cy + 1, 2.4 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    ctx.beginPath();
    ctx.arc(cx + 2.6 * s, cy + 0.5, 0.7 * s, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 93, 155, .5)';
    ctx.fillRect(cx - w * 0.26, cy + 9 * s, w * 0.52, 1);
    ctx.restore();
  }

  /* ---------- drawing: player ---------- */

  function drawLimb(points, width, color, s) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawScarf(t, mode) {
    const baseY = mode === 'slide' ? -30 : -64;
    const baseX = mode === 'slide' ? 10 : 0;
    const wave = Math.sin(t * 9.2);
    const wave2 = Math.sin(t * 7.4 + 1.8);
    ctx.save();
    ctx.lineCap = 'round';
    for (let layer = 0; layer < 2; layer++) {
      const length = mode === 'slide' ? 44 : 58;
      const drop = mode === 'slide' ? 2 : (mode === 'air' ? -14 : 7);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(
        baseX - 18,
        baseY - 7 + wave * 4 + drop * 0.2,
        baseX - 33,
        baseY + 8 - wave2 * 5 + drop,
        baseX - length - layer * 7,
        baseY - 2 + wave * 8 + drop * 0.7
      );
      ctx.strokeStyle = layer === 0 ? 'rgba(255, 61, 139, .9)' : 'rgba(255, 172, 207, .55)';
      ctx.lineWidth = layer === 0 ? 6.4 : 3.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (!game || !game.player) return;
    const p = game.player;
    const s = game.s;
    const px = view.playerX;
    const py = p.y;
    const mode = p.sliding ? 'slide' : (!p.onGround ? 'air' : 'run');
    const overGap = game.state !== 'menu' && !game.isGapProtected() && game.isOverGap(game.cameraX + px);

    ctx.save();

    /* Shadow stays on the rooftop and fades with height. */
    if (!overGap && py < view.groundY + 16 * s) {
      const height = Math.max(0, view.groundY - py);
      const fade = clamp(1 - height / (280 * s), 0.08, 1);
      const shadowW = (p.sliding ? 38 : 26) * s * (0.9 + fade * 0.25);
      const grad = ctx.createRadialGradient(px, view.groundY + 2, 0, px, view.groundY + 2, shadowW);
      grad.addColorStop(0, `rgba(0, 0, 0, ${0.38 * fade})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(px - shadowW, view.groundY - 2, shadowW * 2, 9 * s);
    }

    /* Dash aura and speed streaks. */
    if (game.boostTimer > 0) {
      const pulse = 0.5 + Math.sin(game.time * 18) * 0.5;
      const aura = ctx.createRadialGradient(px, py - 38 * s, 2, px, py - 38 * s, 88 * s);
      aura.addColorStop(0, `rgba(255, 214, 120, ${0.24 + pulse * 0.06})`);
      aura.addColorStop(0.45, 'rgba(255, 110, 150, .1)');
      aura.addColorStop(1, 'rgba(255, 93, 155, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(px - 100 * s, py - 140 * s, 200 * s, 180 * s);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const y = py - (22 + i * 13) * s;
        const len = (45 + i * 28) * s;
        const grad = ctx.createLinearGradient(px - len, y, px, y);
        grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
        grad.addColorStop(1, `rgba(255, 209, 102, ${0.18 - i * 0.025})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.3 * s;
        ctx.beginPath();
        ctx.moveTo(px - len, y);
        ctx.lineTo(px, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.translate(px, py);
    ctx.scale(s, s);

    if (p.flip > 0 && p.alive) {
      const progress = clamp(1 - p.flip, 0, 1);
      ctx.translate(0, -40);
      ctx.rotate(progress * TAU);
      ctx.translate(0, 40);
    }
    if (!p.alive) {
      ctx.translate(0, -36);
      ctx.rotate(p.spin || 0);
      ctx.translate(0, 36);
    }

    const blink = game.invuln > 0 && Math.floor(game.time * 18) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 1;

    if (mode === 'slide') {
      drawSlidePlayer(p, s);
    } else {
      drawRunPlayer(p, mode, s);
    }

    if (game.isMagnetActive()) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const angle = game.time * 2.8 + (i / 4) * TAU;
        const radius = (30 + Math.sin(game.time * 3 + i) * 5) * s;
        ctx.fillStyle = `rgba(255, 94, 158, ${0.35 + i * 0.06})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius, -36 * s + Math.sin(angle) * radius * 0.55, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();

    if (game.shieldCharges > 0) {
      const y = py - (p.sliding ? 25 : 42) * s;
      const radius = (p.sliding ? 42 : 55) * s + Math.sin(game.time * 4.2) * 2.4 * s;
      ctx.save();
      const aura = ctx.createRadialGradient(px, y, radius * 0.45, px, y, radius);
      aura.addColorStop(0, 'rgba(100, 244, 255, 0)');
      aura.addColorStop(0.75, 'rgba(100, 244, 255, .05)');
      aura.addColorStop(1, 'rgba(100, 244, 255, .24)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(px, y, radius, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(100, 244, 255, .5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.arc(px, y, radius, game.time * 0.4, game.time * 0.4 + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, y, radius - 5 * s, 0, TAU);
      ctx.stroke();

      /* One little orbit light per stored shield charge. */
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < game.shieldCharges; i++) {
        const angle = game.time * 1.5 + (i / Math.max(1, game.shieldCharges)) * TAU;
        const ox = px + Math.cos(angle) * (radius + 3 * s);
        const oy = y + Math.sin(angle) * (radius * 0.52 + 4 * s);
        ctx.fillStyle = i === 0 ? '#ffffff' : '#64f4ff';
        ctx.beginPath();
        ctx.arc(ox, oy, 2.2 * s, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawRunPlayer(p, mode, s) {
    const t = game.time;
    const run = p.runPhase;
    const air = mode === 'air';
    const rising = air && p.vy < 0;
    const bob = air ? 0 : Math.abs(Math.sin(run)) * 1.6;
    const swing = air ? 0.25 : Math.sin(run);
    const swing2 = air ? -0.2 : Math.sin(run + Math.PI);
    const liftA = air ? 0 : Math.max(0, Math.cos(run)) * 11;
    const liftB = air ? 0 : Math.max(0, Math.cos(run + Math.PI)) * 11;

    drawScarf(t, mode);

    ctx.save();
    ctx.translate(0, -bob);

    let backFoot;
    let frontFoot;
    let backKnee;
    let frontKnee;

    if (!air) {
      backFoot = { x: 15 * swing2, y: -liftB };
      frontFoot = { x: 15 * swing, y: -liftA };
      backKnee = { x: backFoot.x * 0.45 + 3, y: -20 - liftB * 0.4 };
      frontKnee = { x: frontFoot.x * 0.45 + 5, y: -20 - liftA * 0.4 };
    } else if (rising) {
      backFoot = { x: -19, y: -13 };
      frontFoot = { x: 18, y: -26 };
      backKnee = { x: -9, y: -22 };
      frontKnee = { x: 20, y: -18 };
    } else {
      backFoot = { x: -12, y: -24 };
      frontFoot = { x: 16, y: -9 };
      backKnee = { x: -13, y: -28 };
      frontKnee = { x: 10, y: -24 };
    }

    /* Back arm. */
    const backArm = air
      ? [{ x: 0, y: -60 }, { x: -8, y: -52 }, { x: -13, y: -43 }]
      : [{ x: 0, y: -60 }, { x: -5 * swing + 2, y: -51 }, { x: -13 * swing + 3, y: -44 }];
    drawLimb(backArm, 5.6, '#14233e', s);
    drawLimb([backArm[2], { x: backArm[2].x + 2, y: backArm[2].y + 2 }], 4.4, '#2c7892', s);

    /* Back leg. */
    drawLimb([{ x: 0, y: -39 }, backKnee, backFoot], 6.2, '#14233e', s);
    drawShoe(backFoot.x, backFoot.y, s, 'rgba(80, 201, 226, .72)');

    /* Torso and jacket. */
    const torso = ctx.createLinearGradient(-10, -66, 11, -35);
    torso.addColorStop(0, '#29446f');
    torso.addColorStop(0.5, '#1a2d4f');
    torso.addColorStop(1, '#0d192d');
    ctx.beginPath();
    ctx.moveTo(-9, -37);
    ctx.bezierCurveTo(-13, -49, -9, -61, 1, -65);
    ctx.lineTo(8, -62);
    ctx.bezierCurveTo(13, -54, 11, -44, 7, -36);
    ctx.closePath();
    ctx.fillStyle = torso;
    ctx.strokeStyle = 'rgba(118, 210, 240, .38)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 61, 139, .78)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -62);
    ctx.lineTo(6, -49);
    ctx.lineTo(5, -38);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 244, 255, .38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -58);
    ctx.lineTo(-9, -43);
    ctx.stroke();

    ctx.fillStyle = 'rgba(100, 244, 255, .9)';
    ctx.fillRect(-1, -56, 1.3, 7);
    ctx.fillStyle = 'rgba(100, 244, 255, .25)';
    ctx.fillRect(-6, -46, 1, 8);

    /* A small shoulder lamp gives the silhouette a readable edge. */
    ctx.fillStyle = 'rgba(255, 61, 139, .85)';
    ctx.beginPath();
    ctx.arc(-6.5, -59, 1.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 188, 218, .5)';
    ctx.beginPath();
    ctx.arc(-6.5, -59, 4.4, 0, TAU);
    ctx.fill();

    /* Head with a visor, helmet silhouette. */
    ctx.save();
    ctx.translate(4, -73);
    ctx.fillStyle = '#0e1830';
    ctx.beginPath();
    ctx.arc(0, 0, 9.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 206, 236, .52)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#2d4a70';
    ctx.beginPath();
    ctx.arc(-1, -1.5, 8.1, Math.PI * 1.05, Math.PI * 1.98);
    ctx.fill();

    ctx.fillStyle = 'rgba(100, 244, 255, .92)';
    ctx.beginPath();
    ctx.moveTo(1, -3.8);
    ctx.lineTo(9, -2.8);
    ctx.lineTo(8.5, 1.2);
    ctx.lineTo(1, 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 61, 139, .9)';
    ctx.fillRect(-8.4, -0.6, 2, 3.2);
    ctx.restore();

    /* Front leg. */
    drawLimb([{ x: 1, y: -39 }, frontKnee, frontFoot], 6.8, '#20365a', s);
    drawShoe(frontFoot.x, frontFoot.y, s, '#7df7ff');

    /* Front arm. */
    const frontArm = air
      ? [{ x: 2, y: -60 }, { x: 11, y: -55 }, { x: 17, y: -64 }]
      : [{ x: 3, y: -60 }, { x: 8 * swing + 3, y: -51 }, { x: 13 * swing + 5, y: -44 }];
    drawLimb(frontArm, 5.8, '#243d63', s);
    drawLimb([frontArm[2], { x: frontArm[2].x + 2, y: frontArm[2].y + 2 }], 4.8, '#7df7ff', s);

    ctx.restore();
  }

  function drawShoe(x, y, s, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 7 * s;
    ctx.fillStyle = color;
    roundRectPath(ctx, x - 6, y - 2.6, 13, 4.6, 2.2);
    ctx.fill();
    ctx.restore();
  }

  function drawSlidePlayer(p, s) {
    const t = game.time;
    drawScarf(t, 'slide');
    ctx.save();

    /* Trailing arm and leg. */
    drawLimb([{ x: -4, y: -26 }, { x: -16, y: -19 }, { x: -24, y: -10 }], 5.2, '#101a31', s);
    drawLimb([{ x: -2, y: -24 }, { x: 9, y: -20 }, { x: 5, y: -8 }], 6.2, '#101a31', s);
    drawShoe(5, -7, s, 'rgba(87, 207, 235, .65)');

    const torso = ctx.createLinearGradient(-14, -39, 24, -23);
    torso.addColorStop(0, '#132039');
    torso.addColorStop(1, '#1d3152');
    ctx.beginPath();
    ctx.moveTo(-14, -24);
    ctx.bezierCurveTo(-4, -36, 12, -39, 23, -31);
    ctx.lineTo(18, -22);
    ctx.bezierCurveTo(5, -24, -2, -19, -12, -18);
    ctx.closePath();
    ctx.fillStyle = torso;
    ctx.strokeStyle = 'rgba(104, 177, 221, .25)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 61, 139, .7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -26);
    ctx.lineTo(11, -31);
    ctx.stroke();
    ctx.fillStyle = 'rgba(100, 244, 255, .8)';
    ctx.fillRect(2, -35, 6, 1.2);

    /* Head tucked low. */
    ctx.save();
    ctx.translate(25, -34);
    ctx.fillStyle = '#0b1223';
    ctx.beginPath();
    ctx.arc(0, 0, 8.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 159, 201, .35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(100, 244, 255, .85)';
    ctx.beginPath();
    ctx.moveTo(1, -3.5);
    ctx.lineTo(7.8, -2.5);
    ctx.lineTo(7.3, 0.8);
    ctx.lineTo(1, 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 61, 139, .8)';
    ctx.fillRect(-7.5, -0.5, 1.8, 2.8);
    ctx.restore();

    /* Extended front leg. */
    drawLimb([{ x: 8, y: -27 }, { x: 25, y: -17 }, { x: 37, y: -7 }], 6.8, '#1a2d4c', s);
    drawShoe(37, -6, s, '#7df7ff');

    /* Front arm tucked forward. */
    drawLimb([{ x: 16, y: -32 }, { x: 27, y: -26 }, { x: 31, y: -19 }], 5.4, '#1b3154', s);
    drawLimb([{ x: 31, y: -19 }, { x: 34, y: -17 }], 4.2, '#64f4ff', s);

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const len = (24 + i * 9) * s;
      ctx.globalAlpha = 0.25 - i * 0.06;
      ctx.strokeStyle = i % 2 ? '#ff3d8b' : '#64f4ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-18 * s - len, -5 * s - i * 3 * s);
      ctx.lineTo(-18 * s, -5 * s - i * 3 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- particles and text ---------- */

  function drawParticles() {
    if (!game) return;
    ctx.save();
    for (const p of game.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha * p.alpha;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.fillStyle = p.color;
      if (p.shape === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.45 + alpha * 0.55), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    if (!game) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of game.texts) {
      const alpha = clamp(item.life / item.maxLife, 0, 1);
      const scale = 1 + (1 - alpha) * 0.16;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = item.color;
      ctx.font = `700 ${item.size * scale}px "Bahnschrift", "Microsoft YaHei", sans-serif`;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = item.size * 0.7;
      ctx.fillText(item.text, item.x, item.y);
    }
    ctx.restore();
  }

  function drawSpeedLines() {
    if (!game || (game.state !== 'playing' && game.state !== 'dying')) return;
    const speedRatio = clamp(game.speed / (game.s * 750), 0, 1.7);
    const intensity = clamp((speedRatio - 0.5) * 1.8, 0, 0.8) + (game.boostTimer > 0 ? 0.25 : 0);
    if (intensity <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 15; i++) {
      const seed = i * 93.7 + 7.1;
      const y = view.groundY - hash(seed) * view.h * 0.64;
      const speed = 420 + i * 65;
      const x = mod(game.time * speed * (1 + intensity) + hash(seed + 2.1) * view.w * 2, view.w + 380) - 190;
      const length = (35 + hash(seed + 1.2) * 150) * (0.5 + intensity);
      ctx.globalAlpha = (0.04 + intensity * 0.1) * (0.3 + hash(seed + 3.3) * 0.7);
      ctx.strokeStyle = i % 4 === 0 ? '#ff6ca6' : '#74eaff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- scene ---------- */

  function drawScene() {
    if (!game) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#04050d';
    ctx.fillRect(0, 0, view.w, view.h);

    const shake = game.shake || 0;
    const sx = shake > 0 ? rand(-shake, shake) : 0;
    const sy = shake > 0 ? rand(-shake, shake) : 0;

    ctx.save();
    ctx.translate(sx, sy);

    ctx.fillStyle = skyGradient || '#080b22';
    ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
    drawStars();
    drawSun();
    drawFlyingCars();
    drawCity();
    drawMotes();
    drawRoof();
    drawCoins();
    drawPickups();
    for (const obstacle of game.obstacles) drawObstacle(obstacle);
    drawPlayer();
    drawParticles();
    drawSpeedLines();
    drawTexts();

    ctx.restore();

    if (game.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(game.hitFlash, 0, 1) * 0.36;
      ctx.fillStyle = '#ff3d8b';
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }

    if (game.boostTimer > 0) {
      const boost = ctx.createLinearGradient(0, 0, view.w, 0);
      boost.addColorStop(0, 'rgba(255, 61, 139, .03)');
      boost.addColorStop(0.8, 'rgba(255, 186, 94, .035)');
      boost.addColorStop(1, 'rgba(255, 209, 102, .08)');
      ctx.fillStyle = boost;
      ctx.fillRect(0, 0, view.w, view.h);

      if (game.boostTimer <= BOOST_WARN_TIME) {
        const pulse = 0.5 + Math.sin(game.time * 14) * 0.5;
        const edge = 0.035 + pulse * 0.07;
        const warning = ctx.createLinearGradient(0, 0, 0, view.h);
        warning.addColorStop(0, `rgba(255, 209, 102, ${edge * 1.8})`);
        warning.addColorStop(0.12, 'rgba(255, 209, 102, 0)');
        warning.addColorStop(0.88, 'rgba(255, 209, 102, 0)');
        warning.addColorStop(1, `rgba(255, 209, 102, ${edge * 1.8})`);
        ctx.fillStyle = warning;
        ctx.fillRect(0, 0, view.w, view.h);
        ctx.strokeStyle = `rgba(255, 209, 102, ${0.16 + pulse * 0.24})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 3);
        ctx.lineTo(view.w, 3);
        ctx.moveTo(0, view.h - 3);
        ctx.lineTo(view.w, view.h - 3);
        ctx.stroke();
      }
    }

    /* Blend the bottom of the scene into the HUD / controls. */
    const bottomFade = ctx.createLinearGradient(0, view.h * 0.78, 0, view.h);
    bottomFade.addColorStop(0, 'rgba(3, 4, 10, 0)');
    bottomFade.addColorStop(1, 'rgba(3, 4, 10, .54)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, view.h * 0.78, view.w, view.h * 0.22);
  }

  /* ---------- game ---------- */

  const OBSTACLE_SPECS = {
    crate: { w: 62, h: 58, base: 0 },
    vent: { w: 78, h: 96, base: 0 },
    spikes: { w: 108, h: 30, base: 0 },
    beam: { w: 122, h: 82, base: 58 },
    drone: { w: 68, h: 50, base: 60 },
  };

  const SHIELD_MAX = 3;
  const BOOST_DURATION = 30;
  const BOOST_SPEED_MULT = 3;
  const BOOST_WARN_TIME = 1.8;
  const BOOST_FINAL_WARN_TIME = 0.55;
  const BOOST_GRACE = 0.8;

  /* All powerups now arrive roughly twice as often as before. */
  const POWERUP_FIRST_DISTANCE = 2800;
  const POWERUP_SPAWN_MIN = 2350;
  const POWERUP_SPAWN_MAX = 3500;

  const PATTERNS = [
    { id: 'crate', min: 0, weight: 3.2 },
    { id: 'vent', min: 0, weight: 2.2 },
    { id: 'beam', min: 0.045, weight: 2.4 },
    { id: 'gap', min: 0.07, weight: 2.4 },
    { id: 'spikes', min: 0.18, weight: 2 },
    { id: 'drone', min: 0.27, weight: 2 },
    { id: 'double', min: 0.38, weight: 2.1 },
    { id: 'longGap', min: 0.58, weight: 1.6 },
    { id: 'stagger', min: 0.7, weight: 1.2 },
  ];

  class Game {
    constructor() {
      this.state = 'menu';
      this.time = 0;
      this.cameraX = 0;
      this.speed = 0;
      this.distance = 0;
      this.shards = 0;
      this.shardPoints = 0;
      this.bonusPoints = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboTimer = 0;
      this.magnetTimer = 0;
      this.boostTimer = 0;
      this.boostWarned = false;
      this.boostFinalWarned = false;
      this.dashGraceTimer = 0;
      this.invuln = 0;
      this.shieldCharges = 0;
      this.shake = 0;
      this.hitFlash = 0;
      this.hudClock = 0;
      this.deathTimer = 0;
      this.deathCause = 'hit';
      this.lastPattern = '';
      this.nextSpawnX = 0;
      this.nextPowerupX = 0;
      this.nextMilestone = 250;
      this.auraTimer = 0;
      this.best = loadBest();
      this.particles = [];
      this.texts = [];
      this.obstacles = [];
      this.coins = [];
      this.pickups = [];
      this.gaps = [];
      this.applyScale();
      this.player = this.createPlayer();
      this.setupMenu();
    }

    applyScale() {
      this.s = view.s;
      this.gravity = 3200 * this.s;
      this.jumpV = 1180 * this.s;
      this.doubleJumpV = 980 * this.s;
      this.playerH = 82 * this.s;
      this.slideH = 36 * this.s;
      this.playerHalf = 14 * this.s;
    }

    createPlayer() {
      return {
        y: view.groundY,
        vy: 0,
        onGround: true,
        jumps: 0,
        coyote: 0,
        jumpBuffer: 0,
        sliding: false,
        slideHeld: false,
        slideTimer: 0,
        runPhase: 0,
        flip: 0,
        spin: 0,
        alive: true,
        dustTimer: 0,
        sparkTimer: 0,
      };
    }

    setupMenu() {
      this.applyScale();
      this.player = this.createPlayer();
      this.player.y = view.groundY;
      this.cameraX = 0;
      this.speed = 95 * this.s;
      this.distance = 0;
      this.shards = 0;
      this.shardPoints = 0;
      this.bonusPoints = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboTimer = 0;
      this.magnetTimer = 0;
      this.boostTimer = 0;
      this.boostWarned = false;
      this.boostFinalWarned = false;
      this.dashGraceTimer = 0;
      this.invuln = 0;
      this.shieldCharges = 0;
      this.shake = 0;
      this.hitFlash = 0;
      this.obstacles = [];
      this.coins = [];
      this.pickups = [];
      this.gaps = [];
      this.particles = [];
      this.texts = [];
      this.deathTimer = 0;
      this.auraTimer = 0;
      this.state = 'menu';
      this.setUIState('menu');
      this.updateBestLabels();
      hideToast();
    }

    startRun() {
      sound.ensure();
      sound.start();
      this.applyScale();
      this.player = this.createPlayer();
      this.cameraX = 0;
      this.speed = 460 * this.s;
      this.distance = 0;
      this.shards = 0;
      this.shardPoints = 0;
      this.bonusPoints = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.comboTimer = 0;
      this.magnetTimer = 0;
      this.boostTimer = 0;
      this.boostWarned = false;
      this.boostFinalWarned = false;
      this.dashGraceTimer = 0;
      this.invuln = 0;
      this.shieldCharges = 0;
      this.shake = 0;
      this.hitFlash = 0;
      this.obstacles = [];
      this.coins = [];
      this.pickups = [];
      this.gaps = [];
      this.particles = [];
      this.texts = [];
      this.deathTimer = 0;
      this.deathCause = 'hit';
      this.lastPattern = '';
      this.nextSpawnX = view.w + 760 * this.s;
      this.nextPowerupX = POWERUP_FIRST_DISTANCE * this.s;
      this.nextMilestone = 250;
      this.auraTimer = 0;
      this.hudClock = 0;
      this.setUIState('playing');
      this.updateHUD(0, true);
      hideToast();
      vibrate(10);
    }

    toMenu() {
      sound.ui();
      this.setupMenu();
    }

    setUIState(state) {
      this.state = state;
      els.app.dataset.state = state;
      els.menuScreen.hidden = state !== 'menu';
      els.pauseScreen.hidden = state !== 'paused';
      els.gameoverScreen.hidden = state !== 'gameover';
      const hudHidden = state === 'menu' || state === 'gameover';
      els.hud.setAttribute('aria-hidden', hudHidden ? 'true' : 'false');
      els.touchControls.setAttribute('aria-hidden', state === 'playing' ? 'false' : 'true');
      if (state === 'paused') {
        els.pauseDistance.textContent = `${Math.floor(this.distance)} m`;
        els.pauseScore.textContent = Math.floor(this.getScore()).toLocaleString('en-US');
      }
    }

    togglePause() {
      if (this.state === 'playing') {
        this.player.slideHeld = false;
        this.player.sliding = false;
        this.player.slideTimer = 0;
        this.setUIState('paused');
        sound.ui();
      } else if (this.state === 'paused') {
        this.setUIState('playing');
        sound.ui();
      }
    }

    resume() {
      if (this.state === 'paused') {
        this.setUIState('playing');
        sound.ui();
      }
    }

    updateBestLabels() {
      const distance = this.best.distance || 0;
      els.hudBest.textContent = String(distance);
      els.menuBest.textContent = distance > 0 ? `${distance} m` : '—';
    }

    getScore() {
      return this.distance * 10 + this.shardPoints + this.bonusPoints;
    }

    comboMultiplier() {
      return 1 + Math.min(4, this.combo * 0.1);
    }

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 54);
      this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);

      if (this.state === 'menu') {
        this.speed = 95 * this.s;
        this.cameraX += this.speed * dt;
        this.player.runPhase += dt * 8.7;
        this.player.dustTimer -= dt;
        if (this.player.dustTimer <= 0) {
          this.player.dustTimer = 0.1;
          this.emitFootDust(0.5);
        }
        this.updateParticles(dt);
        this.updateTexts(dt);
        return;
      }

      if (this.state === 'paused') {
        return;
      }

      if (this.state === 'gameover') {
        this.updateParticles(dt * 0.25);
        this.updateTexts(dt * 0.4);
        return;
      }

      if (this.state === 'dying') {
        this.updateDying(dt);
        this.updateParticles(dt);
        this.updateTexts(dt);
        this.updateHUD(dt);
        return;
      }

      this.updatePowerups(dt);
      this.updateSpeed(dt);
      this.distance += (this.speed / this.s / 26) * dt;
      this.cameraX += this.speed * dt;
      this.updatePlayer(dt);

      if (this.state !== 'playing') {
        this.updateParticles(dt);
        this.updateTexts(dt);
        this.updateHUD(dt);
        return;
      }

      this.updateWorld(dt);
      this.spawnAhead();
      this.checkPickups();
      this.checkObstacles();
      this.updateParticles(dt);
      this.updateTexts(dt);
      this.updateMilestones();
      this.updateHUD(dt);
    }

    updatePowerups(dt) {
      if (this.magnetTimer > 0) this.magnetTimer = Math.max(0, this.magnetTimer - dt);
      if (this.boostTimer > 0) {
        this.boostTimer = Math.max(0, this.boostTimer - dt);
        if (!this.boostWarned && this.boostTimer <= BOOST_WARN_TIME) {
          this.warnBoostEnding(false);
        }
        if (!this.boostFinalWarned && this.boostTimer <= BOOST_FINAL_WARN_TIME) {
          this.warnBoostEnding(true);
        }
        if (this.boostTimer === 0) {
          /* Short afterglow keeps the exit from being a blind collision. */
          this.dashGraceTimer = BOOST_GRACE;
          this.invuln = Math.max(this.invuln, BOOST_GRACE);
        }
      }
      if (this.dashGraceTimer > 0) {
        this.dashGraceTimer = Math.max(0, this.dashGraceTimer - dt);
      }
      if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.comboTimer = 0;
          this.combo = 0;
        }
      }
    }

    warnBoostEnding(final) {
      const px = view.playerX;
      if (final) {
        this.boostFinalWarned = true;
        showToast(
          'OVERDRIVE // 结束预警',
          '超载即将消失',
          '立刻准备闪避。结束后有 0.8 秒无敌缓冲，但别依赖它。',
          'pink',
          1500
        );
        sound.boostWarning(true);
        this.addText('BOOST ENDING', px, this.player.y - 154 * this.s, '#ff7aa9', 13);
        this.shake = Math.max(this.shake, 3);
        this.addBurst(px, this.player.y - 42 * this.s, 10, ['#ffd166', '#ff7aa9', '#fff3c4'], {
          speedMin: 25,
          speedMax: 110,
          sizeMin: 0.8,
          sizeMax: 2.3,
          lifeMin: 0.2,
          lifeMax: 0.5,
          gravity: -30,
          additive: true,
          scroll: 0.2,
        });
        vibrate(25);
      } else {
        this.boostWarned = true;
        showToast(
          'OVERDRIVE // 倒计时',
          '超载还剩约 1.8 秒',
          '效果结束后不再撞碎障碍，提前找好落点。',
          'gold',
          1900
        );
        sound.boostWarning(false);
        this.addText('BOOST 1.8s', px, this.player.y - 142 * this.s, '#ffd166', 12);
        vibrate(16);
      }
    }

    updateSpeed(dt) {
      const targetBase = (455 + Math.min(this.distance * 0.235, 310)) * this.s;
      let target = targetBase;
      if (this.boostTimer > 0) target *= BOOST_SPEED_MULT;
      if (this.player.sliding) target *= 0.93;
      const response = this.boostTimer > 0 ? 5.2 : 2.1;
      this.speed = lerp(this.speed, target, 1 - Math.exp(-dt * response));
    }

    updatePlayer(dt) {
      const p = this.player;
      p.runPhase += dt * (9.5 + (this.speed / this.s) * 0.012);
      p.dustTimer -= dt;
      p.sparkTimer -= dt;

      if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
      if (p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);
      if (p.flip > 0) p.flip = Math.max(0, p.flip - dt / 0.46);

      if (!p.onGround) {
        p.vy += this.gravity * dt;
        p.y += p.vy * dt;
      }

      const worldX = this.cameraX + view.playerX;
      const overGap = this.isGapProtected() ? false : this.isOverGap(worldX);

      if (p.y >= view.groundY) {
        if (!overGap) {
          if (!p.onGround) {
            if (p.vy > 230 * this.s) {
              this.emitLandingDust(p.vy);
              sound.land();
            }
            p.onGround = true;
            p.jumps = 0;
            p.coyote = 0.1;
            p.flip = 0;
          }
          p.y = view.groundY;
          p.vy = 0;
          if (p.jumpBuffer > 0) {
            p.jumpBuffer = 0;
            this.requestJump();
          }
        } else {
          if (p.onGround) {
            p.onGround = false;
            p.coyote = 0.11;
            p.vy = 60 * this.s;
          }
          if (p.y > view.groundY + 235 * this.s) {
            this.die('fall');
            return;
          }
        }
      } else if (p.onGround) {
        p.onGround = false;
        p.coyote = 0.11;
      }

      if (p.onGround) {
        if (p.slideHeld) p.slideTimer = Math.max(p.slideTimer, 0.14);
        if (p.slideTimer > 0) {
          p.slideTimer = Math.max(0, p.slideTimer - dt);
          p.sliding = p.slideTimer > 0;
        } else {
          p.sliding = false;
        }
      } else {
        p.sliding = false;
        if (p.slideTimer > 0) p.slideTimer = Math.max(0, p.slideTimer - dt);
      }

      if (p.onGround && !p.sliding && p.dustTimer <= 0) {
        p.dustTimer = 0.075;
        this.emitFootDust(0.55);
      }
      if (p.sliding && p.sparkTimer <= 0) {
        p.sparkTimer = 0.045;
        this.emitSlideSparks();
      }
      if (this.boostTimer > 0) {
        this.auraTimer -= dt;
        if (this.auraTimer <= 0) {
          this.auraTimer = 0.035;
          this.emitBoostTrail();
        }
      }
    }

    requestJump() {
      if (this.state !== 'playing') return;
      const p = this.player;
      p.jumpBuffer = 0.12;

      if (p.onGround || p.coyote > 0) {
        p.onGround = false;
        p.coyote = 0;
        p.jumps = 1;
        p.sliding = false;
        p.slideTimer = 0;
        p.flip = 0;
        p.vy = -this.jumpV;
        p.y -= 1.5 * this.s;
        p.jumpBuffer = 0;
        this.emitJumpDust();
        sound.jump();
        vibrate(7);
      } else if (p.jumps < 2) {
        p.jumps = 2;
        p.vy = -this.doubleJumpV;
        p.flip = 1;
        p.jumpBuffer = 0;
        this.emitDoubleJumpBurst();
        sound.doubleJump();
        vibrate(10);
      }
    }

    setSlide(active) {
      if (this.state !== 'playing') return;
      const p = this.player;
      if (active) {
        p.slideHeld = true;
        if (p.onGround) {
          if (!p.sliding) sound.slide();
          p.sliding = true;
          p.slideTimer = Math.max(p.slideTimer, 0.55);
        } else {
          p.vy = Math.min(p.vy + 660 * this.s, 1500 * this.s);
        }
      } else {
        p.slideHeld = false;
      }
    }

    isOverGap(worldX) {
      if (this.state === 'menu') return false;
      for (const gap of this.gaps) {
        if (worldX > gap.x + 4 * this.s && worldX < gap.x + gap.w - 4 * this.s) return true;
      }
      return false;
    }

    isGapProtected() {
      return this.boostTimer > 0 || this.dashGraceTimer > 0;
    }

    isMagnetActive() {
      return this.magnetTimer > 0 || this.boostTimer > 0;
    }

    updateWorld(dt) {
      const behind = this.cameraX - 260 * this.s;
      this.obstacles = this.obstacles.filter((ob) => ob.x + ob.w > behind);
      this.coins = this.coins.filter((coin) => coin.x > this.cameraX - 120 * this.s);
      this.pickups = this.pickups.filter((item) => item.x > this.cameraX - 160 * this.s);
      this.gaps = this.gaps.filter((gap) => gap.x + gap.w > this.cameraX - 380 * this.s);

      if (this.isMagnetActive()) {
        const dashMagnet = this.boostTimer > 0;
        const targetX = this.cameraX + view.playerX;
        const targetScreenY = this.player.y - (this.player.sliding ? 28 : 46) * this.s;
        const targetOffset = view.groundY - targetScreenY;
        const range = (dashMagnet ? 760 : 335) * this.s;
        const pull = dashMagnet ? 13 : 8.5;
        for (const coin of this.coins) {
          const coinScreenY = view.groundY - coin.offset;
          const dx = targetX - coin.x;
          const dy = targetScreenY - coinScreenY;
          if (dx * dx + dy * dy > range * range) continue;
          const k = 1 - Math.exp(-dt * pull);
          coin.x += dx * k;
          coin.offset += (targetOffset - coin.offset) * k;
        }
      }
    }

    spawnAhead() {
      const behind = this.cameraX + view.w + 400 * this.s;
      if (this.nextSpawnX < behind) this.nextSpawnX = behind;
      const horizon = this.cameraX + view.w + 760 * this.s;
      let safety = 0;

      while (this.nextSpawnX < horizon && safety < 8) {
        safety++;
        const x = this.nextSpawnX;
        const span = this.spawnPattern(x);
        const difficulty = clamp(this.distance / 1200, 0, 1);
        const gap = this.speed * lerp(1.38, 0.96, difficulty) + 88 * this.s;
        this.nextSpawnX = x + Math.max(span, 40 * this.s) + gap;
      }

      if (this.nextPowerupX < this.cameraX + view.w + 760 * this.s) {
        let x = Math.max(this.nextPowerupX, this.cameraX + view.w + 130 * this.s);
        for (const gap of this.gaps) {
          if (x > gap.x - 120 * this.s && x < gap.x + gap.w + 120 * this.s) {
            x = gap.x + gap.w + 170 * this.s;
          }
        }
        for (const ob of this.obstacles) {
          if (x > ob.x - 90 * this.s && x < ob.x + ob.w + 90 * this.s) {
            x = ob.x + ob.w + 170 * this.s;
          }
        }
        this.addPickup(x);
        this.nextPowerupX = x + (POWERUP_SPAWN_MIN + Math.random() * (POWERUP_SPAWN_MAX - POWERUP_SPAWN_MIN)) * this.s;
      }
    }

    choosePattern() {
      const difficulty = clamp(this.distance / 1200, 0, 1);
      const available = PATTERNS.filter((entry) => difficulty >= entry.min);
      let total = 0;
      for (const entry of available) total += entry.weight;
      let chosen = available[0];
      let ticket = Math.random() * total;
      for (const entry of available) {
        ticket -= entry.weight;
        if (ticket <= 0) {
          chosen = entry;
          break;
        }
      }
      if (this.lastPattern === chosen.id && available.length > 1) {
        const alternatives = available.filter((entry) => entry.id !== chosen.id);
        chosen = pick(alternatives);
      }
      this.lastPattern = chosen.id;
      return chosen.id;
    }

    spawnPattern(x) {
      const s = this.s;
      const difficulty = clamp(this.distance / 1200, 0, 1);
      const id = this.choosePattern();
      let span = 0;

      if (id === 'crate') {
        const ob = this.addObstacle('crate', x);
        this.addJumpArc(x + ob.w / 2, 7);
        span = ob.w;
      } else if (id === 'vent') {
        const ob = this.addObstacle('vent', x);
        this.addJumpArc(x + ob.w / 2, 7);
        span = ob.w;
      } else if (id === 'beam') {
        const ob = this.addObstacle('beam', x);
        for (let i = 0; i < 4; i++) {
          this.addCoin(x + ob.w * (0.14 + i * 0.24), 23 * s);
        }
        span = ob.w;
      } else if (id === 'gap') {
        const gapW = (120 + 68 * difficulty) * s;
        this.addGap(x, gapW);
        this.addJumpArc(x + gapW / 2, 8);
        span = gapW;
      } else if (id === 'spikes') {
        const ob = this.addObstacle('spikes', x);
        this.addJumpArc(x + ob.w / 2, 7);
        span = ob.w;
      } else if (id === 'drone') {
        const ob = this.addObstacle('drone', x);
        for (let i = 0; i < 3; i++) {
          this.addCoin(x + ob.w * (0.18 + i * 0.32), 22 * s);
        }
        span = ob.w;
      } else if (id === 'double') {
        const first = this.addObstacle('crate', x);
        const second = this.addObstacle('crate', x + 76 * s);
        this.addJumpArc(x + 70 * s, 8);
        span = second.x + second.w - x;
      } else if (id === 'longGap') {
        const gapW = 188 * s;
        this.addGap(x, gapW);
        this.addJumpArc(x + gapW / 2, 8);
        span = gapW;
      } else if (id === 'stagger') {
        const first = this.addObstacle('crate', x);
        const beamX = x + first.w + Math.max(350 * s, this.speed * 1.2);
        const second = this.addObstacle('beam', beamX);
        this.addJumpArc(x + first.w / 2, 7);
        for (let i = 0; i < 3; i++) {
          this.addCoin(beamX + second.w * (0.2 + i * 0.3), 22 * s);
        }
        span = second.x + second.w - x;
      }

      return span;
    }

    addObstacle(type, x) {
      const spec = OBSTACLE_SPECS[type];
      const ob = {
        type,
        x,
        w: spec.w * this.s,
        h: spec.h * this.s,
        base: spec.base * this.s,
        phase: rand(0, TAU),
      };
      this.obstacles.push(ob);
      return ob;
    }

    addGap(x, w) {
      this.gaps.push({ x, w });
    }

    addCoin(x, offset) {
      this.coins.push({
        x,
        offset,
        phase: rand(0, TAU),
      });
    }

    /**
     * Lay coins on the exact parabola a full single jump traces.
     * The coins sit at upper-body height, so one well-timed jump
     * collects the whole string instead of only the apex.
     */
    addJumpArc(centerX, count = 7) {
      const airTime = (this.jumpV * 2) / this.gravity;
      const apexTime = this.jumpV / this.gravity;
      const speed = Math.max(this.speed, 260 * this.s);
      const startX = centerX - speed * apexTime;
      const bodyOffset = 74 * this.s;
      for (let i = 0; i < count; i++) {
        const fraction = count === 1 ? 0.5 : i / (count - 1);
        const t = fraction * airTime;
        const jumpHeight = this.jumpV * t - 0.5 * this.gravity * t * t;
        this.addCoin(startX + speed * t, jumpHeight + bodyOffset);
      }
    }

    addPickup(x) {
      /* Dash is deliberately twice as common as it was: 60% / 20% / 20%. */
      const roll = Math.random();
      const kind = roll < 0.2 ? 'shield' : roll < 0.4 ? 'magnet' : 'boost';
      this.pickups.push({
        x,
        offset: (70 + Math.random() * 55) * this.s,
        kind,
        phase: rand(0, TAU),
      });
    }

    checkPickups() {
      const p = this.player;
      const px = this.cameraX + view.playerX;
      const top = p.y - (p.sliding ? this.slideH : this.playerH);
      const half = 18 * this.s;

      for (let i = this.coins.length - 1; i >= 0; i--) {
        const coin = this.coins[i];
        const screenX = coin.x - this.cameraX;
        if (screenX < -80 || screenX > view.w + 80) continue;
        const sy = view.groundY - coin.offset;
        const nx = clamp(coin.x, px - half, px + half);
        const ny = clamp(sy, top, p.y);
        const dx = nx - coin.x;
        const dy = ny - sy;
        if (dx * dx + dy * dy < (30 * this.s) * (30 * this.s)) {
          this.coins.splice(i, 1);
          this.collectCoin(screenX, sy);
        }
      }

      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const item = this.pickups[i];
        const screenX = item.x - this.cameraX;
        if (screenX < -80 || screenX > view.w + 80) continue;
        const sy = view.groundY - item.offset;
        const nx = clamp(item.x, px - half, px + half);
        const ny = clamp(sy, top, p.y);
        const dx = nx - item.x;
        const dy = ny - sy;
        if (dx * dx + dy * dy < (36 * this.s) * (36 * this.s)) {
          this.pickups.splice(i, 1);
          this.collectPowerup(item.kind, screenX, sy);
        }
      }
    }

    collectCoin(screenX, screenY) {
      this.shards++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = 2.55;
      const mult = this.comboMultiplier();
      const points = Math.round(12 * mult);
      this.shardPoints += points;
      this.addBurst(screenX, screenY, 9, ['#ffd166', '#fff3c4', '#ff9b6a'], {
        speedMin: 45,
        speedMax: 190,
        sizeMin: 1.2,
        sizeMax: 2.8,
        lifeMin: 0.22,
        lifeMax: 0.52,
        gravity: 120,
        additive: true,
        scroll: 0.35,
      });
      this.addText(`+${points}`, screenX + 6 * this.s, screenY - 15 * this.s, '#ffd166', 13);
      sound.coin(this.combo);
      if (this.combo === 5 || this.combo === 10 || this.combo === 20 || this.combo === 30) {
        this.addText(`COMBO ×${mult.toFixed(1)}`, view.playerX + 20 * this.s, ptop(this) - 15 * this.s, '#ff8bb8', 11);
      }
    }

    collectPowerup(kind, x, y) {
      const colors = {
        shield: ['#64f4ff', '#ffffff'],
        magnet: ['#ff5e9e', '#ffc1d8'],
        boost: ['#ffd166', '#fff0c2'],
      };
      const colorSet = colors[kind] || colors.shield;
      this.addBurst(x, y, 22, colorSet, {
        speedMin: 60,
        speedMax: 280,
        sizeMin: 1.4,
        sizeMax: 4,
        lifeMin: 0.32,
        lifeMax: 0.9,
        gravity: 160,
        additive: true,
        scroll: 0.2,
      });
      this.shake = Math.max(this.shake, 5);
      sound.power();
      vibrate(16);

      if (kind === 'shield') {
        const before = this.shieldCharges;
        this.shieldCharges = Math.min(SHIELD_MAX, this.shieldCharges + 1);
        if (before === 0) {
          showToast('POWER UP // 护盾', '相位护盾', '抵挡一次撞击；继续拾取可叠加，最多储存 3 层。', 'cyan');
        } else if (before < SHIELD_MAX) {
          showToast('POWER UP // 护盾', `相位护盾 ×${this.shieldCharges}`, `护盾已叠加，当前可抵挡 ${this.shieldCharges} 次撞击。`, 'cyan');
        } else {
          showToast('POWER UP // 护盾', `护盾已满 ×${SHIELD_MAX}`, '护盾层数已达上限，先用掉一层再拾取。', 'cyan');
        }
        this.addText(
          before >= SHIELD_MAX ? 'SHIELD MAX' : `SHIELD ×${this.shieldCharges}`,
          x,
          y - 26 * this.s,
          '#64f4ff',
          13
        );
      } else if (kind === 'magnet') {
        this.magnetTimer = 8;
        showToast('POWER UP // 磁场', '磁力收束', '自动吸取附近 335 范围内的能量碎片。', 'pink');
        this.addText('MAGNET', x, y - 26 * this.s, '#ff7bb0', 13);
      } else {
        this.boostTimer = BOOST_DURATION;
        this.boostWarned = false;
        this.boostFinalWarned = false;
        this.dashGraceTimer = 0;
        showToast(
          'POWER UP // 超载疾行',
          '超载疾行',
          `${BOOST_DURATION} 秒极速冲刺（3× 速度）：自动磁吸、免疫所有伤害，并生成跨越断崖的能量桥。`,
          'gold',
          3200
        );
        this.addText('OVERDRIVE DASH', x, y - 26 * this.s, '#ffd166', 13);
        flashScreen('radial-gradient(circle at 50% 55%, rgba(255,209,102,.45), rgba(255,93,155,.12) 48%, transparent 76%)');
      }
    }

    checkObstacles() {
      if (this.state !== 'playing') return;
      const p = this.player;
      const px = this.cameraX + view.playerX;
      const height = p.sliding ? this.slideH : this.playerH;
      const left = px - this.playerHalf;
      const right = px + this.playerHalf;
      const top = p.y - height;
      const bottom = p.y;

      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const ob = this.obstacles[i];
        const obLeft = ob.x + 3 * this.s;
        const obRight = ob.x + ob.w - 3 * this.s;
        const obTop = view.groundY - ob.base - ob.h + 3 * this.s;
        const obBottom = view.groundY - ob.base - 3 * this.s;
        if (right <= obLeft || left >= obRight || bottom <= obTop || top >= obBottom) continue;

        const sx = ob.x + ob.w / 2 - this.cameraX;
        const sy = view.groundY - ob.base - ob.h / 2;

        if (this.boostTimer > 0) {
          this.obstacles.splice(i, 1);
          this.bonusPoints += 60;
          this.addBurst(sx, sy, 18, ['#ffd166', '#ff6ca6', '#fff2c5'], {
            speedMin: 80,
            speedMax: 330,
            sizeMin: 1.4,
            sizeMax: 4.2,
            lifeMin: 0.25,
            lifeMax: 0.75,
            gravity: 420,
            additive: true,
            scroll: 0.45,
          });
          this.addText('+60', sx, sy - 18 * this.s, '#ffd166', 12);
          this.shake = Math.max(this.shake, 9);
          sound.smash();
          continue;
        }

        if (this.invuln > 0) {
          this.obstacles.splice(i, 1);
          this.addBurst(sx, sy, 12, ['#64f4ff', '#ffffff'], {
            speedMin: 60,
            speedMax: 220,
            additive: true,
            scroll: 0.4,
          });
          continue;
        }

        if (this.shieldCharges > 0) {
          this.shieldCharges -= 1;
          this.invuln = 1.35;
          this.obstacles.splice(i, 1);
          this.shake = Math.max(this.shake, 13);
          this.hitFlash = Math.max(this.hitFlash, 0.55);
          flashScreen('radial-gradient(circle at 50% 55%, rgba(100,244,255,.65), rgba(100,244,255,.18) 48%, transparent 76%)');
          this.addBurst(sx, sy, 28, ['#64f4ff', '#ffffff', '#9ba8ff'], {
            speedMin: 90,
            speedMax: 330,
            sizeMin: 1.5,
            sizeMax: 4.5,
            lifeMin: 0.3,
            lifeMax: 0.95,
            gravity: 190,
            additive: true,
            scroll: 0.4,
          });
          if (this.shieldCharges > 0) {
            this.addText(`SHIELD -1 · ${this.shieldCharges} LEFT`, view.playerX, p.y - 100 * this.s, '#64f4ff', 13);
            showToast(
              'IMPACT // 承受',
              `护盾破裂 · 还剩 ${this.shieldCharges} 层`,
              '短暂无敌已启动，下一层护盾仍在生效。',
              'cyan',
              2100
            );
          } else {
            this.addText('SHIELD BREAK', view.playerX, p.y - 100 * this.s, '#64f4ff', 13);
            showToast('IMPACT // 承受', '护盾碎裂', '短暂无敌已启动，继续向前。', 'cyan');
          }
          sound.shieldBreak();
          vibrate(25);
          continue;
        }

        this.die('hit');
        return;
      }
    }

    updateMilestones() {
      while (this.distance >= this.nextMilestone) {
        this.bonusPoints += 250;
        showToast('MILESTONE', `${this.nextMilestone} m`, '城市正在加速 · 里程奖励 +250', 'gold');
        this.addText(`${this.nextMilestone} M`, view.playerX + 25 * this.s, view.groundY - 180 * this.s, '#ffd166', 16);
        sound.milestone();
        this.nextMilestone += 250;
      }
    }

    die(cause) {
      if (this.state !== 'playing') return;
      this.state = 'dying';
      this.deathCause = cause;
      this.deathTimer = 0;
      const p = this.player;
      p.alive = false;
      p.sliding = false;
      p.slideHeld = false;
      p.jumpBuffer = 0;
      p.flip = 0;
      if (cause === 'hit') {
        p.vy = -560 * this.s;
        p.spin = rand(-2.8, 2.8);
        this.shake = Math.max(this.shake, 24);
        this.hitFlash = 1;
        flashScreen();
        vibrate(45);
      } else {
        p.vy = Math.max(p.vy, 190 * this.s);
        p.spin = rand(-1, 1);
        this.shake = Math.max(this.shake, 8);
        this.hitFlash = 0.7;
        flashScreen('radial-gradient(circle at 50% 55%, rgba(255,61,139,.55), rgba(60,32,90,.18) 50%, transparent 78%)');
        vibrate(20);
      }
      sound.hit();
      sound.death();
      this.setUIState('dying');
    }

    updateDying(dt) {
      this.deathTimer += dt;
      this.speed = Math.max(0, this.speed - dt * 740 * this.s);
      this.cameraX += this.speed * dt * 0.22;
      const p = this.player;
      p.vy += this.gravity * 0.74 * dt;
      p.y += p.vy * dt;
      p.spin += dt * (this.deathCause === 'hit' ? 4.2 : 1.2);
      if (this.deathTimer > 1.02) {
        this.finishRun();
      }
    }

    finishRun() {
      if (this.state === 'gameover') return;
      const previousDistance = this.best.distance || 0;
      const previousScore = this.best.score || 0;
      const finalDistance = Math.floor(this.distance);
      const finalScore = Math.floor(this.getScore());
      const newRecord = finalDistance > previousDistance || finalScore > previousScore;

      this.best = {
        distance: Math.max(previousDistance, finalDistance),
        score: Math.max(previousScore, finalScore),
        runs: (this.best.runs || 0) + 1,
      };
      saveBest(this.best);
      this.updateBestLabels();
      hideToast();

      els.newBest.hidden = !newRecord || finalDistance < 10;
      if (newRecord) {
        els.resultTitle.textContent = finalDistance >= 900 ? '天台传说' : finalDistance >= 500 ? '风驰电掣' : finalDistance >= 200 ? '渐入佳境' : '信号丢失';
      } else {
        els.resultTitle.textContent = this.deathCause === 'fall' ? '一脚踏空' : '撞线了';
      }

      const subs = finalDistance >= 900
        ? '城市把最高的那束光留给了你。'
        : finalDistance >= 500
          ? '风还没追上你，再跑一次。'
          : finalDistance >= 200
            ? '节奏已经找到了，下一次更远。'
            : '天台的风还在催你向前。';
      els.resultSub.textContent = subs;
      els.resultDistance.textContent = String(finalDistance);
      els.resultScore.textContent = finalScore.toLocaleString('en-US');
      els.resultShards.textContent = String(this.shards);
      els.resultCombo.textContent = String(this.maxCombo);
      els.resultBest.innerHTML = `本机最佳 <strong>${this.best.distance} m</strong>`;
      this.setUIState('gameover');
      this.updateHUD(0, true);
      if (newRecord) {
        window.setTimeout(() => sound.newRecord(), 280);
      } else {
        window.setTimeout(() => sound.milestone(), 300);
      }
    }

    addBurst(x, y, count, colors, options = {}) {
      const s = this.s;
      const speedMin = (options.speedMin ?? 50) * s;
      const speedMax = (options.speedMax ?? 220) * s;
      const sizeMin = (options.sizeMin ?? 1.2) * s;
      const sizeMax = (options.sizeMax ?? 3.4) * s;
      const lifeMin = options.lifeMin ?? 0.25;
      const lifeMax = options.lifeMax ?? 0.7;
      const gravity = (options.gravity ?? 280) * s;
      const baseAngle = options.angle ?? -Math.PI / 2;
      const spread = options.spread ?? Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + rand(-spread / 2, spread / 2);
        const speed = rand(speedMin, speedMax);
        const life = rand(lifeMin, lifeMax);
        this.particles.push({
          x: x + rand(-2, 2) * s,
          y: y + rand(-2, 2) * s,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity,
          life,
          maxLife: life,
          size: rand(sizeMin, sizeMax),
          color: colors[(Math.random() * colors.length) | 0],
          alpha: options.alpha ?? 1,
          additive: Boolean(options.additive),
          shape: options.shape ?? 'dot',
          scroll: options.scroll ?? 0.3,
        });
      }
      if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
    }

    emitFootDust(strength = 1) {
      if (!this.player) return;
      const x = view.playerX + rand(-8, 7) * this.s;
      const y = this.player.y - 1 * this.s;
      this.addBurst(x, y, strength > 0.7 ? 3 : 2, ['#7dc6d8', '#4f6f99', '#ff79a8'], {
        speedMin: 22 * strength,
        speedMax: 95 * strength,
        sizeMin: 0.8,
        sizeMax: 2.3,
        lifeMin: 0.18,
        lifeMax: 0.42,
        gravity: 150,
        angle: Math.PI,
        spread: 1.1,
        additive: false,
        scroll: 0.8,
        alpha: 0.6,
      });
    }

    emitJumpDust() {
      const x = view.playerX;
      const y = this.player.y;
      this.addBurst(x, y, 9, ['#64f4ff', '#ff5e9e', '#a8c9ff'], {
        speedMin: 30,
        speedMax: 145,
        sizeMin: 0.8,
        sizeMax: 2.6,
        lifeMin: 0.2,
        lifeMax: 0.48,
        gravity: 250,
        angle: Math.PI,
        spread: 1.55,
        additive: true,
        scroll: 0.7,
      });
    }

    emitLandingDust(vy) {
      const strength = clamp(vy / (1000 * this.s), 0.3, 2);
      this.addBurst(view.playerX, view.groundY - 2, 8 + Math.round(strength * 5), ['#8ccad8', '#6182a9', '#ff6ca6'], {
        speedMin: 35,
        speedMax: 170 * strength,
        sizeMin: 0.8,
        sizeMax: 2.8,
        lifeMin: 0.18,
        lifeMax: 0.5,
        gravity: 280,
        angle: Math.PI,
        spread: 1.8,
        scroll: 0.65,
        alpha: 0.75,
      });
      this.shake = Math.max(this.shake, Math.min(4, strength * 2));
    }

    emitDoubleJumpBurst() {
      this.addBurst(view.playerX, this.player.y - 34 * this.s, 16, ['#64f4ff', '#ff69a7', '#ffffff'], {
        speedMin: 55,
        speedMax: 210,
        sizeMin: 1,
        sizeMax: 3.2,
        lifeMin: 0.24,
        lifeMax: 0.6,
        gravity: 120,
        additive: true,
        scroll: 0.1,
        shape: 'streak',
      });
    }

    emitSlideSparks() {
      const y = this.player.y - 4 * this.s;
      this.addBurst(view.playerX - 12 * this.s, y, 2, ['#ffcf79', '#ff5e9e', '#ffefe1'], {
        speedMin: 50,
        speedMax: 180,
        sizeMin: 0.7,
        sizeMax: 1.8,
        lifeMin: 0.12,
        lifeMax: 0.3,
        gravity: 620,
        angle: Math.PI,
        spread: 0.8,
        additive: true,
        scroll: 1,
        shape: 'streak',
      });
    }

    emitBoostTrail() {
      const p = this.player;
      this.addBurst(view.playerX - 12 * this.s, p.y - 22 * this.s, 3, ['#ffd166', '#ff6ca6', '#fff4ca'], {
        speedMin: 30,
        speedMax: 130,
        sizeMin: 1,
        sizeMax: 2.8,
        lifeMin: 0.18,
        lifeMax: 0.45,
        gravity: -40,
        additive: true,
        scroll: 0.8,
        alpha: 0.9,
      });
    }

    addText(text, x, y, color, size) {
      this.texts.push({
        text,
        x,
        y,
        color,
        size: size * this.s,
        life: 0.85,
        maxLife: 0.85,
      });
    }

    updateParticles(dt) {
      const scrollSpeed = this.speed * (this.state === 'playing' ? 1 : 0.35);
      for (const p of this.particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt - scrollSpeed * dt * p.scroll;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.vx *= Math.pow(0.985, dt * 60);
      }
      if (this.particles.some((p) => p.life <= 0)) {
        this.particles = this.particles.filter((p) => p.life > 0);
      }
    }

    updateTexts(dt) {
      for (const item of this.texts) {
        item.life -= dt;
        item.y -= 28 * dt;
      }
      if (this.texts.some((item) => item.life <= 0)) {
        this.texts = this.texts.filter((item) => item.life > 0);
      }
    }

    updateHUD(dt = 0, force = false) {
      this.hudClock += dt;
      if (!force && this.hudClock < 0.045) return;
      this.hudClock = 0;

      els.distance.textContent = String(Math.floor(this.distance)).padStart(4, '0');
      els.score.textContent = Math.floor(this.getScore()).toLocaleString('en-US');
      els.shards.textContent = String(this.shards);
      els.hudBest.textContent = String(this.best.distance || 0);

      const hasCombo = this.combo >= 2;
      els.comboBadge.classList.toggle('is-on', hasCombo);
      els.comboBadge.classList.toggle('is-hot', this.combo >= 15);
      els.comboBadge.setAttribute('aria-hidden', hasCombo ? 'false' : 'true');
      els.comboValue.textContent = String(this.combo);
      els.comboMult.textContent = this.comboMultiplier().toFixed(1);
      const comboRatio = hasCombo ? clamp(this.comboTimer / 2.55, 0, 1) : 0;
      els.comboBar.style.transform = `scaleX(${comboRatio})`;

      const active = {
        shield: this.shieldCharges > 0,
        magnet: this.isMagnetActive(),
        boost: this.boostTimer > 0,
      };
      for (const kind of ['shield', 'magnet', 'boost']) {
        const el = powerEls[kind];
        el.classList.toggle('is-active', active[kind]);
        const timer = el.querySelector('b');
        if (kind === 'shield') {
          timer.textContent = this.shieldCharges > 0 ? `×${this.shieldCharges}` : '';
          el.classList.remove('is-ending');
        } else if (kind === 'magnet') {
          timer.textContent = this.magnetTimer > 0
            ? `${Math.ceil(this.magnetTimer)}s`
            : (this.boostTimer > 0 ? 'AUTO' : '');
          el.classList.remove('is-ending');
        } else {
          const ending = this.boostTimer > 0 && this.boostTimer <= BOOST_WARN_TIME;
          el.classList.toggle('is-ending', ending);
          timer.textContent = `${Math.max(0, this.boostTimer).toFixed(1)}s`;
        }
      }

      const speedRatio = clamp(this.speed / (this.s * 850), 0.08, 1);
      els.speedFill.style.width = `${Math.round(speedRatio * 100)}%`;
    }
  }

  function ptop(g) {
    return g.player.y - (g.player.sliding ? g.slideH : g.playerH);
  }

  /* ---------- UI / input ---------- */

  function syncTouchClass() {
    const coarse = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    els.app.classList.toggle('has-touch', Boolean(coarse));
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (request) {
        try {
          const result = request.call(root);
          if (result && result.catch) result.catch(() => {});
        } catch (_) {
          /* ignore */
        }
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try {
          const result = exit.call(document);
          if (result && result.catch) result.catch(() => {});
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  function bindUI() {
    window.addEventListener('pointerdown', () => { userActivated = true; }, { capture: true, once: true });
    window.addEventListener('keydown', () => { userActivated = true; }, { capture: true, once: true });

    els.startBtn.addEventListener('click', () => game.startRun());
    els.retryBtn.addEventListener('click', () => game.startRun());
    els.menuBtn.addEventListener('click', () => game.toMenu());
    els.resumeBtn.addEventListener('click', () => game.resume());
    els.restartPauseBtn.addEventListener('click', () => game.startRun());
    els.quitPauseBtn.addEventListener('click', () => game.toMenu());
    els.pauseBtn.addEventListener('click', () => game.togglePause());

    document.querySelectorAll('.js-sound').forEach((button) => {
      button.addEventListener('click', () => sound.toggle());
    });

    els.fullscreenBtn.addEventListener('click', toggleFullscreen);
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
      els.fullscreenBtn.style.display = 'none';
    }

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    els.canvas.addEventListener('pointerdown', onCanvasPointerDown);
    els.canvas.addEventListener('pointermove', onCanvasPointerMove);
    els.canvas.addEventListener('pointerup', onCanvasPointerUp);
    els.canvas.addEventListener('pointercancel', onCanvasPointerCancel);
    els.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    let gesture = null;

    function onCanvasPointerDown(event) {
      if (game.state !== 'playing') return;
      if (event.pointerType === 'mouse') {
        game.requestJump();
        return;
      }
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: nowMs(),
        used: false,
      };
      if (els.canvas.setPointerCapture) {
        try { els.canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
    }

    function onCanvasPointerMove(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.used) return;
      if (Math.abs(dy) > 32 || Math.abs(dx) > 52) {
        if (dy < 0 && Math.abs(dy) >= Math.abs(dx)) {
          game.requestJump();
          gesture.used = true;
        } else if (dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
          game.setSlide(true);
          window.setTimeout(() => game.setSlide(false), 620);
          gesture.used = true;
        } else {
          gesture.used = true;
        }
      }
    }

    function onCanvasPointerUp(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const elapsed = nowMs() - gesture.start;
      if (!gesture.used && elapsed < 380) {
        game.requestJump();
      }
      gesture = null;
    }

    function onCanvasPointerCancel() {
      gesture = null;
      game.setSlide(false);
    }

    els.touchJump.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (els.touchJump.setPointerCapture) {
        try { els.touchJump.setPointerCapture(event.pointerId); } catch (_) {}
      }
      if (game.state === 'playing') game.requestJump();
    });
    els.touchJump.addEventListener('pointerup', (event) => event.preventDefault());
    els.touchJump.addEventListener('contextmenu', (event) => event.preventDefault());

    els.touchSlide.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (els.touchSlide.setPointerCapture) {
        try { els.touchSlide.setPointerCapture(event.pointerId); } catch (_) {}
      }
      if (game.state === 'playing') game.setSlide(true);
    });
    els.touchSlide.addEventListener('pointerup', (event) => {
      event.preventDefault();
      game.setSlide(false);
    });
    els.touchSlide.addEventListener('pointercancel', () => game.setSlide(false));
    els.touchSlide.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('visibilitychange', () => {
      /* Never auto-pause. The run stays alive in the background. */
      if (game.state === 'playing') game.setSlide(false);
      lastTime = performance.now();
    });

    document.addEventListener('fullscreenchange', updateFullscreenLabel);
    document.addEventListener('webkitfullscreenchange', updateFullscreenLabel);

    let resizeFrame = 0;
    window.addEventListener('resize', () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        measureView();
      });
    });

    window.addEventListener('blur', () => {
      /* Losing focus no longer pauses the run; only release held input. */
      if (game.state === 'playing') game.setSlide(false);
    });
  }

  function updateFullscreenLabel() {
    const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    els.fullscreenBtn.setAttribute('aria-label', active ? '退出全屏' : '切换全屏');
    els.fullscreenBtn.setAttribute('title', active ? '退出全屏 (F)' : '全屏 (F)');
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code;
    const target = event.target;
    const onControl = target && target.closest && target.closest('button, a, input, select, textarea');
    const jumpKey = code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
    const slideKey = code === 'ArrowDown' || code === 'KeyS';

    if (code === 'KeyM' && !event.repeat) {
      sound.toggle();
      return;
    }

    if (code === 'KeyF' && !event.repeat) {
      toggleFullscreen();
      return;
    }

    if (game.state === 'menu') {
      if ((code === 'Enter' || code === 'Space') && !onControl) {
        event.preventDefault();
        game.startRun();
      }
      return;
    }

    if (game.state === 'gameover') {
      if (code === 'KeyR' && !event.repeat) {
        event.preventDefault();
        game.startRun();
      }
      return;
    }

    if (code === 'KeyP' || code === 'Escape') {
      if (!event.repeat) {
        event.preventDefault();
        game.togglePause();
      }
      return;
    }

    if (game.state === 'paused') {
      if (code === 'KeyR' && !event.repeat) {
        event.preventDefault();
        game.startRun();
      }
      return;
    }

    if (jumpKey) {
      event.preventDefault();
      if (!event.repeat) game.requestJump();
      return;
    }

    if (slideKey) {
      event.preventDefault();
      if (!event.repeat) game.setSlide(true);
    }
  }

  function onKeyUp(event) {
    const code = event.code;
    if (code === 'ArrowDown' || code === 'KeyS') {
      if (game.state === 'playing') game.setSlide(false);
    }
  }

  /* ---------- main loop ---------- */

  let lastTime = performance.now();

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (game) {
      game.update(dt);
      drawScene();
    }
    requestAnimationFrame(frame);
  }

  function init() {
    measureView();
    game = new Game();
    syncTouchClass();
    bindUI();
    updateFullscreenLabel();
    const params = new URLSearchParams(window.location.search);
    if (params.get('play') === '1') game.startRun();
    if (params.has('debug')) window.__NEON_RUN__ = game;
    requestAnimationFrame(frame);
  }

  init();
})();
