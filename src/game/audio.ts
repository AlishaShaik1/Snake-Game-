/**
 * Fully procedural audio: adaptive score, ambience beds and SFX, synthesized with WebAudio.
 * No external sound assets are needed (optional voice-over clips are streamed from /audio).
 */
export type Mood = 'silent' | 'cavern' | 'dusk' | 'dream' | 'dead' | 'city' | 'fire' | 'deep' | 'sky' | 'root' | 'stone' | 'void' | 'astral' | 'fall' | 'final' | 'heart';
export type Intensity = 0 | 1 | 2 | 3; // ambient, tension, combat, boss

const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

const MOODS: Record<Mood, { root: number; scale: string; tempo: number; bright: number; noise: number }> = {
  silent: { root: 45, scale: 'minor', tempo: 60, bright: 0.2, noise: 0 },
  cavern: { root: 38, scale: 'phrygian', tempo: 56, bright: 0.25, noise: 0.25 },
  dusk: { root: 45, scale: 'dorian', tempo: 70, bright: 0.55, noise: 0.15 },
  dream: { root: 50, scale: 'lydian', tempo: 50, bright: 0.8, noise: 0.05 },
  dead: { root: 40, scale: 'harmonic', tempo: 66, bright: 0.3, noise: 0.35 },
  city: { root: 43, scale: 'dorian', tempo: 72, bright: 0.5, noise: 0.2 },
  fire: { root: 41, scale: 'phrygian', tempo: 84, bright: 0.45, noise: 0.5 },
  deep: { root: 36, scale: 'minor', tempo: 54, bright: 0.3, noise: 0.4 },
  sky: { root: 48, scale: 'lydian', tempo: 78, bright: 0.75, noise: 0.35 },
  root: { root: 43, scale: 'dorian', tempo: 70, bright: 0.5, noise: 0.2 },
  stone: { root: 33, scale: 'minor', tempo: 60, bright: 0.25, noise: 0.3 },
  void: { root: 37, scale: 'harmonic', tempo: 58, bright: 0.15, noise: 0.2 },
  astral: { root: 52, scale: 'lydian', tempo: 64, bright: 0.85, noise: 0.05 },
  fall: { root: 40, scale: 'harmonic', tempo: 96, bright: 0.5, noise: 0.6 },
  final: { root: 35, scale: 'phrygian', tempo: 88, bright: 0.4, noise: 0.4 },
  heart: { root: 47, scale: 'minor', tempo: 60, bright: 0.6, noise: 0.1 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioSystem {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noiseBuf!: AudioBuffer;
  mood: Mood = 'silent';
  intensity: Intensity = 0;
  private nextBeat = 0;
  private beat = 0;
  private chordIdx = 0;
  private timer: number | null = null;
  private ambNodes: AudioNode[] = [];
  private duck = 1;
  private vols = { master: 0.8, music: 0.6, sfx: 0.8 };
  private currentVoice: HTMLAudioElement | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.music.connect(this.master);
    this.sfxBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.8, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.nextBeat = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vols = { master, music, sfx };
    this.applyVolumes();
  }
  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vols.master, t, 0.1);
    this.music.gain.setTargetAtTime(this.vols.music * 0.55 * this.duck, t, 0.3);
    this.sfxBus.gain.setTargetAtTime(this.vols.sfx, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vols.sfx * 0.6, t, 0.3);
  }

  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  setMood(m: Mood) {
    if (!this.ctx) { this.mood = m; return; }
    if (m === this.mood && this.ambNodes.length) return;
    this.mood = m;
    this.buildAmbience();
  }
  setIntensity(i: Intensity) {
    this.intensity = i;
  }

  private buildAmbience() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const n of this.ambNodes) {
      try {
        if ((n as any).gain) (n as GainNode).gain.setTargetAtTime(0, t, 0.8);
        setTimeout(() => { try { (n as any).stop?.(); n.disconnect(); } catch { /* */ } }, 3000);
      } catch { /* */ }
    }
    this.ambNodes = [];
    if (this.mood === 'silent') return;
    const cfg = MOODS[this.mood];
    // Drone: two detuned oscillators through a slowly-moving lowpass.
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.16, t, 2);
    out.connect(this.ambBus);
    out.connect(this.reverbSend);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300 + cfg.bright * 500;
    lp.Q.value = 2;
    lp.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 200;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    const oscs: OscillatorNode[] = [];
    for (const [det, type] of [[-7, 'sawtooth'], [6, 'sawtooth'], [0, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(cfg.root - 12);
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = type === 'sine' ? 0.6 : 0.18;
      o.connect(g).connect(lp);
      o.start();
      oscs.push(o);
    }
    // Wind / rumble noise bed.
    const nsrc = ctx.createBufferSource();
    nsrc.buffer = this.noiseBuf;
    nsrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400 + cfg.bright * 900;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = cfg.noise * 0.35;
    const nl = ctx.createOscillator();
    nl.frequency.value = 0.08;
    const nlg = ctx.createGain();
    nlg.gain.value = cfg.noise * 0.2;
    nl.connect(nlg).connect(ng.gain);
    nl.start();
    nsrc.connect(bp).connect(ng).connect(out);
    nsrc.start();
    this.ambNodes.push(out, lfo, nsrc, nl, ...oscs);
  }

  // ---------------- Generative score ----------------
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mood === 'silent') return;
    const cfg = MOODS[this.mood];
    const tempo = cfg.tempo * (this.intensity >= 2 ? 1.25 : 1);
    const spb = 60 / tempo / 2; // eighth notes
    while (this.nextBeat < ctx.currentTime + 0.25) {
      this.playStep(this.nextBeat, this.beat, cfg, spb);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private playStep(t: number, step: number, cfg: (typeof MOODS)[Mood], spb: number) {
    const scale = SCALES[cfg.scale];
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const progression = [0, 5, 3, 4, 0, 6, 3, 4];
    if (inBar === 0) this.chordIdx = progression[bar % progression.length];
    const deg = (i: number) => {
      const o = Math.floor(i / 7);
      return cfg.root + scale[((i % 7) + 7) % 7] + o * 12;
    };
    const c = this.chordIdx;
    // Pad chord every 2 bars
    if (inBar === 0 && bar % 2 === 0) {
      const notes = [deg(c), deg(c + 2), deg(c + 4), deg(c + 7)];
      for (const n of notes) this.pad(t, mtof(n), spb * 32, 0.05 + cfg.bright * 0.02);
      this.choir(t, mtof(deg(c + 7) + 12), spb * 30, 0.025 * (this.intensity >= 1 ? 1.6 : 1));
    }
    // Harp / piano-like arpeggio (sparser when calm)
    const density = [0.28, 0.45, 0.55, 0.65][this.intensity];
    if (Math.random() < density && inBar % 2 === 0) {
      const n = deg(c + [0, 2, 4, 7, 9, 4][Math.floor(Math.random() * 6)] + 7);
      this.pluck(t, mtof(n), 0.06);
    }
    // Low strings pulse in tension+
    if (this.intensity >= 1 && inBar % 4 === 0) this.bass(t, mtof(deg(c) - 12), spb * 3.5, 0.12);
    // Percussion
    if (this.intensity >= 2) {
      if (inBar === 0 || inBar === 6 || inBar === 10) this.taiko(t, 1);
      if (inBar % 4 === 2) this.taiko(t, 0.45, 110);
      if (this.intensity >= 3 && inBar % 2 === 1) this.tick(t);
      if (this.intensity >= 3 && (inBar === 0 || inBar === 8)) this.brass(t, [mtof(deg(c)), mtof(deg(c + 4))], spb * 5);
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private pad(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + MOODS[this.mood].bright * 1200;
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    lp.connect(g);
    g.connect(this.music);
    g.connect(this.reverbSend);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private choir(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 4;
    vib.connect(vg).connect(o.detune);
    // "aah" formants
    const sum = ctx.createGain();
    for (const [ff, q, gg] of [[700, 8, 1], [1150, 10, 0.6], [2800, 12, 0.25]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = gg;
      o.connect(bp).connect(bg).connect(sum);
    }
    sum.connect(g);
    g.connect(this.music);
    g.connect(this.reverbSend);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  private pluck(t: number, f: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    this.env(g, t, 0.005, vol, 2.2);
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.music);
    g.connect(this.reverbSend);
    o.start(t); o2.start(t);
    o.stop(t + 2.4); o2.stop(t + 2.4);
  }

  private bass(t: number, f: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.02, vol, dur);
    o.connect(lp).connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private brass(t: number, fs: number[], dur: number) {
    const ctx = this.ctx!;
    for (const f of fs) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.linearRampToValueAtTime(1800, t + 0.12);
      lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = ctx.createGain();
      this.env(g, t, 0.06, 0.07, dur);
      o.connect(lp).connect(g);
      g.connect(this.music);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private taiko(t: number, vol: number, f0 = 70) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.55 * vol, 0.6);
    o.connect(g);
    g.connect(this.music);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 0.7);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    this.env(ng, t, 0.002, 0.25 * vol, 0.12);
    n.connect(lp).connect(ng).connect(this.music);
    n.start(t);
    n.stop(t + 0.2);
  }

  private tick(t: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.05, 0.05);
    n.connect(hp).connect(g).connect(this.music);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }

  // ---------------- SFX ----------------
  sfx(name: string, p = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.sfxBus;
    const noise = (dur: number, type: BiquadFilterType, freq: number, vol: number, q = 1, freqEnd?: number, rev = 0.3) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      this.env(g, t, 0.005, vol, dur);
      n.connect(f).connect(g).connect(out);
      if (rev) { const rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg).connect(this.reverbSend); }
      n.start(t, Math.random() * 1.5);
      n.stop(t + dur + 0.05);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, rev = 0.3) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(out);
      if (rev) { const rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg).connect(this.reverbSend); }
      o.start(t + delay);
      o.stop(t + delay + dur + 0.05);
    };
    switch (name) {
      case 'eat': {
        const f = 420 * Math.pow(2, Math.min(p, 12) / 12);
        noise(0.07, 'bandpass', 2500, 0.35, 2);
        tone('sine', f, f * 1.5, 0.18, 0.18);
        tone('triangle', f * 2, f * 3, 0.25, 0.06, 0.04, 0.6);
        break;
      }
      case 'fruit':
        noise(0.1, 'bandpass', 1800, 0.35, 1.5);
        [0, 4, 7, 12].forEach((s, i) => tone('triangle', 520 * Math.pow(2, s / 12), 520 * Math.pow(2, s / 12), 0.6, 0.08, i * 0.05, 0.8));
        break;
      case 'memory':
        [0, 7, 12, 16, 19, 24].forEach((s, i) => tone('sine', 330 * Math.pow(2, s / 12), 330 * Math.pow(2, s / 12) * 1.003, 2.5, 0.07, i * 0.09, 1));
        noise(2.5, 'highpass', 5000, 0.04, 1, undefined, 1);
        break;
      case 'bite':
        noise(0.12, 'lowpass', 1400, 0.6, 1, 300);
        tone('square', 180, 60, 0.15, 0.12);
        break;
      case 'hit':
        noise(0.35, 'lowpass', 1800, 0.7, 1, 200);
        tone('sawtooth', 160, 40, 0.3, 0.25);
        break;
      case 'block':
        tone('square', 1800, 900, 0.08, 0.07);
        noise(0.08, 'highpass', 3000, 0.25);
        break;
      case 'boom':
        noise(1.6 * p, 'lowpass', 900, 0.9, 0.8, 40, 0.6);
        tone('sine', 90, 25, 1.2 * p, 0.7, 0, 0.5);
        break;
      case 'crunch':
        noise(0.4, 'bandpass', 900, 0.8, 1.5, 200);
        for (let i = 0; i < 5; i++) tone('square', 300 + Math.random() * 400, 60, 0.08, 0.08, i * 0.04, 0.1);
        break;
      case 'coil':
        tone('sine', 220, 880, 0.5, 0.15, 0, 0.8);
        tone('sine', 330, 1320, 0.5, 0.1, 0.05, 0.8);
        noise(0.5, 'bandpass', 3000, 0.12, 4, 6000, 0.8);
        break;
      case 'laser':
        tone('sawtooth', 1400, 200, 0.25, 0.08);
        break;
      case 'charge':
        tone('sawtooth', 80, 400, 1.0, 0.12);
        noise(1.0, 'bandpass', 500, 0.2, 3, 3000);
        break;
      case 'roar': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90 * p, t);
        o.frequency.linearRampToValueAtTime(140 * p, t + 0.4);
        o.frequency.exponentialRampToValueAtTime(45 * p, t + 2.2);
        const sum = ctx.createGain();
        for (const [ff, q] of [[500, 5], [900, 6], [2200, 8]]) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(ff, t);
          bp.frequency.linearRampToValueAtTime(ff * 0.6, t + 2.2);
          bp.Q.value = q;
          o.connect(bp).connect(sum);
        }
        const g = ctx.createGain();
        this.env(g, t, 0.15, 0.9, 2.2);
        sum.connect(g).connect(out);
        const rg = ctx.createGain(); rg.gain.value = 0.7; g.connect(rg).connect(this.reverbSend);
        o.start(t);
        o.stop(t + 2.5);
        noise(2.2, 'bandpass', 700, 0.35, 1, 200, 0.6);
        break;
      }
      case 'heartbeat':
        tone('sine', 62, 38, 0.22, 0.9 * p, 0, 0.4);
        tone('sine', 58, 34, 0.25, 0.6 * p, 0.28, 0.4);
        break;
      case 'crack':
        for (let i = 0; i < 6; i++) setTimeout(() => this.sfx('crackOne'), i * 40 + Math.random() * 30);
        break;
      case 'crackOne':
        noise(0.06, 'highpass', 2000 + Math.random() * 3000, 0.4, 2);
        break;
      case 'whoosh':
        noise(0.7, 'bandpass', 300, 0.35, 1.5, 2400, 0.4);
        break;
      case 'rewind':
        tone('sawtooth', 1200, 100, 0.8, 0.08, 0, 0.8);
        tone('sine', 200, 1600, 0.8, 0.1, 0, 0.8);
        break;
      case 'ui':
        tone('sine', 880, 1320, 0.08, 0.06, 0, 0.3);
        break;
      case 'uiConfirm':
        tone('sine', 660, 660, 0.3, 0.08, 0, 0.6);
        tone('sine', 990, 990, 0.4, 0.06, 0.06, 0.6);
        break;
      case 'splash':
        noise(0.6, 'lowpass', 2500, 0.4, 1, 300, 0.5);
        break;
      case 'gust':
        noise(1.8, 'bandpass', 250, 0.5, 0.8, 900, 0.3);
        break;
      case 'death':
        tone('sine', 440, 110, 2.5, 0.2, 0, 1);
        tone('sine', 660, 165, 2.5, 0.12, 0.1, 1);
        break;
      case 'ability':
        tone('triangle', 300, 1200, 0.4, 0.1, 0, 0.7);
        tone('sine', 600, 2400, 0.5, 0.06, 0.1, 0.9);
        break;
      case 'bell':
        [1, 2.76, 5.4].forEach((m, i) => tone('sine', 220 * m, 220 * m, 4, 0.12 / (i + 1), 0, 1));
        break;
      case 'deep':
        tone('sine', 55, 30, 4, 0.8, 0, 0.8);
        noise(3, 'lowpass', 200, 0.5, 1, 40, 0.5);
        break;
    }
  }

  /** Play a voice-over clip if present (optional asset). Ducks the score. */
  voice(url?: string) {
    if (!url) return;
    try {
      this.currentVoice?.pause();
      const a = new Audio(url);
      a.volume = Math.min(1, this.vols.master * 1.1);
      this.currentVoice = a;
      this.duck = 0.4;
      this.applyVolumes();
      a.onended = () => { this.duck = 1; this.applyVolumes(); };
      a.play().catch(() => { this.duck = 1; this.applyVolumes(); });
    } catch { /* */ }
  }
  stopVoice() {
    this.currentVoice?.pause();
    this.currentVoice = null;
    this.duck = 1;
    this.applyVolumes();
  }
}

export const audio = new AudioSystem();
