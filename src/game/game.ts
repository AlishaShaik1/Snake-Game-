import * as THREE from 'three';
import { occlusionUniforms } from './props';
import { Engine } from './engine';
import { World, shaftMaterial, type Reserved } from './world';
import { BIOMES } from './biomes';
import { Aeren, ABILITY_INFO } from './serpent';
import { Pickups, FOOD, type FoodKind, type FieldDef, type Pickup } from './pickups';
import { Bursts, Rings } from './particles';
import { Hazards } from './hazards';
import { Projectiles } from './enemies';
import { Director, showSubtitle, type Line, type Shot } from './cinematic';
import { audio, type Mood, type Intensity } from './audio';
import { useUI, toast, updateSave, type ChoiceOption } from './store';
import type { Enemy, GameAPI } from './types';
import { damp, pointInPoly, clamp } from './util';
import { MEMORIES } from './story/memories';
import type { ChapterDef } from './story/chapters';

export class Abort extends Error {
  constructor() { super('abort'); }
}

class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  touchTurn = 0;
  touchBoost = false;
  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('touchstart', this.ts, { passive: false });
    el.addEventListener('touchmove', this.ts, { passive: false });
    el.addEventListener('touchend', this.te);
  }
  private kd = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) this.pressed.add(k);
    this.keys.add(k);
  };
  private ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private ts = (e: TouchEvent) => {
    e.preventDefault();
    let turn = 0, boost = false;
    for (const t of Array.from(e.touches)) {
      const x = t.clientX / window.innerWidth;
      if (x < 0.35) turn -= 1;
      else if (x > 0.65) turn += 1;
      else boost = true;
    }
    this.touchTurn = clamp(turn, -1, 1);
    this.touchBoost = boost || e.touches.length >= 2;
    if (e.type === 'touchstart') this.pressed.add('tap');
  };
  private te = (e: TouchEvent) => this.ts(e);
  consume(k: string) {
    const had = this.pressed.has(k);
    this.pressed.delete(k);
    return had;
  }
  get turn() {
    let t = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) t -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) t += 1;
    const gp = navigator.getGamepads?.()[0];
    if (gp && Math.abs(gp.axes[0]) > 0.2) t += gp.axes[0];
    return clamp(t + this.touchTurn, -1, 1);
  }
  get boost() {
    const gp = navigator.getGamepads?.()[0];
    return this.keys.has('shift') || this.keys.has('w') || this.keys.has('arrowup') || this.touchBoost || !!(gp && (gp.buttons[0]?.pressed || gp.buttons[7]?.pressed));
  }
  endFrame() {
    this.pressed.clear();
  }
  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
  }
}

interface Waiter { pred: () => boolean; resolve: () => void; reject: (e: any) => void; token: number }

export class Game implements GameAPI {
  engine: Engine;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world!: World;
  player: Aeren;
  pickups: Pickups;
  bursts = new Bursts();
  rings = new Rings();
  hazards = new Hazards();
  projectiles = new Projectiles();
  enemies: Enemy[] = [];
  /** chapter-scoped scene objects (cleared on chapter change) */
  stage = new THREE.Group();
  director: Director;
  input: Input;
  time = 0;
  paused = false;
  chapters: ChapterDef[] = [];
  chapterIdx = 0;
  sectionIdx = 0;
  private token = 0;
  private waiters: Waiter[] = [];
  private hooks: ((dt: number) => void)[] = [];
  private coilHooks: ((poly: { x: number; z: number }[]) => void)[] = [];
  private eatHooks: ((p: Pickup) => void)[] = [];
  camMode: 'chase' | 'classic' | 'boss' | 'far' = 'chase';
  userCam: 'chase' | 'classic' = 'chase';
  private camPos = new THREE.Vector3(0, 10, 20);
  private camLook = new THREE.Vector3();
  private heroLight: THREE.PointLight;
  private lightPool: { l: THREE.PointLight; t: number; dur: number; i: number }[] = [];
  private marker: THREE.Group;
  markerTarget: THREE.Vector3 | (() => THREE.Vector3) | null = null;
  boss: { name: string; title: string; color: string; hp: () => number } | null = null;
  private hudT = 0;
  private combo = 0;
  private comboT = 0;
  private dying = false;
  stats = { eaten: 0, byKind: {} as Record<string, number>, crushed: 0 };
  cineLive = false;
  private memoryOpen = false;
  private interactPrompt: { pos: THREE.Vector3; r: number; label: string; resolve: () => void; token: number } | null = null;
  private tmpV = new THREE.Vector3();
  private starting = false;

  constructor(container: HTMLElement) {
    const s = useUI.getState().save.settings;
    this.engine = new Engine(container, s.quality);
    this.engine.shakeEnabled = s.shake;
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;
    this.userCam = s.camera;
    this.player = new Aeren();
    this.pickups = new Pickups(() => this.world);
    this.scene.add(this.stage, this.player.rig.group, this.pickups.group, this.bursts.points, this.rings.group, this.hazards.group, this.projectiles.group);
    this.director = new Director(this.camera, (on, target) => { this.engine.dofWanted = on; this.engine.dofTarget.copy(target); }, (v) => this.engine.shake(v));
    this.input = new Input(this.engine.renderer.domElement);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 40, 2);
      this.scene.add(l);
      this.lightPool.push({ l, t: 0, dur: 1, i: 0 });
    }
    // hero light: a soft key/fill that follows Aeren so the serpent always reads, even in the Void
    this.heroLight = new THREE.PointLight('#ffe6cc', 0, 18, 2);
    this.scene.add(this.heroLight);
    // objective beacon
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.4, 80, 16, 1, true).translate(0, 40, 0),
      shaftMaterial(new THREE.Color('#ffd89a').multiplyScalar(1.4), 0.5),
    );
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd89a').multiplyScalar(3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.2;
    this.marker.add(beam, ring);
    this.marker.visible = false;
    this.scene.add(this.marker);
    // an empty placeholder world so render works before the first chapter
    this.world = new World(BIOMES.cavern, this.engine, []);
    this.player.rig.group.visible = false;
    this.engine.onFrame(this.frame);
  }

  // ================================================================== API used by enemies
  hurt(n: number, at?: THREE.Vector3, source?: string) {
    if (!this.player.alive || this.director.active) return;
    const drops = this.player.damage(n);
    if (!drops.length) return;
    audio.sfx('hit');
    this.engine.shake(0.9);
    this.engine.aberrate(0.012);
    useUI.setState((s) => ({ damage: s.damage + 1 }));
    this.scatter(drops);
    if (at) this.bursts.emit(at, { count: 30, color: '#ff4a3a', speed: 7, size: 0.6, life: 0.6 });
  }
  cut(index: number) {
    if (!this.player.alive || this.director.active) return;
    const drops = this.player.cutAt(index);
    if (!drops.length) return;
    audio.sfx('hit');
    this.engine.shake(1.1);
    this.engine.aberrate(0.015);
    useUI.setState((s) => ({ damage: s.damage + 1 }));
    this.scatter(drops);
    toast('Memories torn away', `${drops.length} segments lost — eat the scattered matter to regrow`, 'warn', 2500);
  }
  private scatter(drops: THREE.Vector3[]) {
    const max = 30;
    const stepI = Math.max(1, Math.floor(drops.length / max));
    for (let i = 0; i < drops.length; i += stepI) {
      const d = drops[i];
      if (this.world.isVoid(d.x, d.z)) continue;
      this.pickups.spawn('matter', d, { vel: new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 4, (Math.random() - 0.5) * 6), life: 14 });
      this.bursts.emit(d, { count: 4, color: '#ffb84a', speed: 3, size: 0.5, life: 0.5 });
    }
  }
  shake(v: number) { this.engine.shake(v); }
  flash(color: string) { useUI.setState({ flash: { color, id: Math.random() } }); }
  sfx(name: string, p?: number) { audio.sfx(name, p); }
  hint(text: string | null, ms = 3500) {
    useUI.setState({ hint: text });
    if (text) {
      const t = text;
      setTimeout(() => { if (useUI.getState().hint === t) useUI.setState({ hint: null }); }, ms);
    }
  }
  addEnemy(e: Enemy) {
    this.enemies.push(e);
    this.scene.add(e.obj);
  }
  removeEnemy(e: Enemy) {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    this.scene.remove(e.obj);
    e.dispose();
  }
  light(pos: THREE.Vector3, color: string, intensity: number, dur: number) {
    const s = this.lightPool.find((x) => x.i === 0) ?? this.lightPool.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.l.position.copy(pos);
    s.l.color.set(color);
    s.i = intensity;
    s.t = 0;
    s.dur = dur;
  }

  // ================================================================== script helpers
  private check(token: number) {
    if (token !== this.token) throw new Abort();
  }
  get tok() { return this.token; }

  wait(sec: number): Promise<void> {
    const end = this.time + sec;
    return this.waitUntil(() => this.time >= end);
  }
  waitUntil(pred: () => boolean): Promise<void> {
    const token = this.token;
    return new Promise((resolve, reject) => this.waiters.push({ pred, resolve, reject, token }));
  }
  async cinematic(shots: Shot[], opts: { live?: boolean } = {}) {
    const token = this.token;
    this.cineLive = !!opts.live;
    this.player.jawTarget = 0;
    await this.director.play(shots);
    this.cineLive = false;
    this.check(token);
  }
  /** In-game dialogue: subtitles while gameplay continues. */
  async say(lines: Line[]) {
    const token = this.token;
    try {
      for (const l of lines) {
        this.check(token);
        const dur = l.dur ?? Math.max(2.6, l.text.length * 0.055);
        showSubtitle(l.who, l.text, dur, l.voice);
        await this.wait(dur + 0.25);
      }
    } catch (e) {
      // dialogue is fire-and-forget; a chapter change simply cuts it off
      if (!(e instanceof Abort)) throw e;
    }
  }
  async objective(text: string, done: () => boolean, opts: { sub?: () => string; marker?: THREE.Vector3 | (() => THREE.Vector3) } = {}) {
    useUI.setState({ objective: text, objectiveSub: opts.sub?.() ?? null });
    this.markerTarget = opts.marker ?? null;
    toast('New Objective', text, 'info', 3000);
    const subFn = opts.sub;
    const h = (subFn ? () => { const v = subFn(); if (useUI.getState().objectiveSub !== v) useUI.setState({ objectiveSub: v }); } : null);
    if (h) this.hooks.push(h);
    try {
      await this.waitUntil(done);
    } finally {
      if (h) this.hooks = this.hooks.filter((x) => x !== h);
    }
    this.markerTarget = null;
    useUI.setState({ objective: null, objectiveSub: null });
    audio.sfx('uiConfirm');
  }
  hook(fn: (dt: number) => void) {
    this.hooks.push(fn);
    return () => { this.hooks = this.hooks.filter((x) => x !== fn); };
  }
  onCoil(fn: (poly: { x: number; z: number }[]) => void) {
    this.coilHooks.push(fn);
    return () => { this.coilHooks = this.coilHooks.filter((x) => x !== fn); };
  }
  onEat(fn: (p: Pickup) => void) {
    this.eatHooks.push(fn);
    return () => { this.eatHooks = this.eatHooks.filter((x) => x !== fn); };
  }
  field(def: FieldDef | null) {
    this.pickups.field = def;
  }
  spawn(kind: FoodKind, pos: THREE.Vector3, opts: Parameters<Pickups['spawn']>[2] = {}) {
    return this.pickups.spawn(kind, pos, opts);
  }
  spawnMany(kind: FoodKind, n: number, center?: THREE.Vector3, radius = 30) {
    for (let i = 0; i < n; i++) {
      const p = this.pickups.randomSpot(radius, center ?? new THREE.Vector3(), this.player.pos);
      if (p) this.pickups.spawn(kind, p);
    }
  }
  memory(id: string, pos: THREE.Vector3, hidden = false) {
    if (useUI.getState().save.fragments.includes(id)) return null;
    return this.pickups.spawn('memory', pos, { data: id, hidden });
  }
  setBoss(b: Game['boss']) {
    this.boss = b;
    if (!b) useUI.setState({ boss: null });
  }
  music(mood: Mood | null, intensity: Intensity = 0) {
    if (mood) audio.setMood(mood);
    audio.setIntensity(intensity);
  }
  async choice(prompt: string, options: ChoiceOption[], sub?: string): Promise<string> {
    const token = this.token;
    let picked: string | null = null;
    useUI.setState({ choice: { prompt, sub, options }, screen: 'choice' });
    (window as any).__serpentChoose = (id: string) => { picked = id; };
    await this.waitUntil(() => picked !== null);
    this.check(token);
    useUI.setState({ choice: null, screen: 'playing' });
    audio.sfx('uiConfirm');
    return picked!;
  }
  interact(pos: THREE.Vector3, r: number, label: string): Promise<void> {
    const token = this.token;
    return new Promise((resolve, reject) => {
      this.interactPrompt = { pos, r, label, resolve, token };
      this.waiters.push({ pred: () => false, resolve: () => {}, reject, token });
    });
  }
  async fade(to: number, dur: number) {
    const from = useUI.getState().fade;
    const start = this.time;
    await this.waitUntil(() => {
      const k = Math.min(1, (this.time - start) / dur);
      useUI.setState({ fade: from + (to - from) * k });
      return k >= 1;
    });
  }
  setCam(mode: Game['camMode']) {
    this.camMode = mode;
  }
  snapCamera() {
    const p = this.player;
    this.camPos.copy(p.pos).addScaledVector(p.fwd, -10).add(new THREE.Vector3(0, 5, 0));
    this.camLook.copy(p.pos);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
  clearStage() {
    for (const c of [...this.stage.children]) {
      this.stage.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    }
  }
  clearEnemies() {
    for (const e of [...this.enemies]) this.removeEnemy(e);
  }

  // ================================================================== chapter flow
  async startChapter(index: number, section = 0, showCard = true) {
    if (this.starting) return;
    this.starting = true;
    audio.init();
    this.token++;
    for (const w of this.waiters) w.reject(new Abort());
    this.waiters = [];
    this.hooks = [];
    this.coilHooks = [];
    this.eatHooks = [];
    this.interactPrompt = null;
    this.director.abort();
    this.dying = false;
    this.paused = false;
    this.memoryOpen = false;
    const ch = this.chapters[index];
    this.chapterIdx = index;
    this.sectionIdx = section;
    useUI.setState({
      chapter: index,
      card: showCard ? { act: ch.act, title: ch.title, subtitle: ch.subtitle, art: ch.art, quote: ch.quote } : null,
      screen: showCard ? 'card' : 'playing',
      objective: null, objectiveSub: null, boss: null, subtitle: null, letterbox: false, choice: null, prompt: null, hint: null, memory: null, ending: null,
      fade: showCard ? 0 : 1,
    });
    audio.stopVoice();
    audio.setIntensity(0);
    const cardStart = performance.now();
    await new Promise((r) => setTimeout(r, 60));
    // teardown
    this.clearEnemies();
    this.pickups.clear();
    this.hazards.clear();
    this.projectiles.clear();
    this.rings.clear();
    this.clearStage();
    this.boss = null;
    this.markerTarget = null;
    this.world.dispose();
    const biome = BIOMES[ch.biome];
    this.world = new World(biome, this.engine, ch.reserved ?? []);
    audio.setMood(biome.mood);
    // player
    const sec = ch.sections[section];
    const st = { ...ch.start, ...(sec.start ?? {}) };
    this.player.size = this.player.targetSize = st.size;
    this.player.speedMul = 1;
    this.player.abilities.clear();
    this.player.frozen = false;
    this.player.stamina = 1;
    this.player.rig.u.uBandCount.value = 0;
    this.applyRunes();
    this.player.place(new THREE.Vector3(st.pos[0], 0, st.pos[1]), st.heading, this.world, st.segments);
    this.player.rig.group.visible = true;
    this.player.rig.render(0.016, this.time, this.player.fwd);
    this.snapCamera();
    this.camMode = 'chase';
    // compile shaders during the card
    try {
      // KHR_parallel_shader_compile lets the driver build programs off the main thread while the card animates
      await this.engine.renderer.compileAsync(this.scene, this.camera);
    } catch {
      this.engine.renderer.compile(this.scene, this.camera);
    }
    updateSave((s) => { s.lastChapter = index; s.lastSection = section; });
    const minCard = showCard ? 4200 : 300;
    const elapsed = performance.now() - cardStart;
    if (elapsed < minCard) await new Promise((r) => setTimeout(r, minCard - elapsed));
    this.starting = false;
    useUI.setState({ screen: 'playing', card: null });
    if (!showCard) this.fade(0, 0.8).catch(() => {});
    this.runSections(index, section, this.token);
  }

  /** Aeren's runes gain the colour of each Eternal consumed. */
  applyRunes(count?: number) {
    const order = ['ember', 'tide', 'gale', 'root', 'stone', 'void', 'astra'];
    const colors: Record<string, string> = { ember: '#ff6a1a', tide: '#3ad8ff', gale: '#e8f4ff', root: '#8aff4a', stone: '#e8c07a', void: '#b06aff', astra: '#ffd28a' };
    const ch = this.chapters[this.chapterIdx];
    const n = count ?? ch?.eternalsConsumed ?? 0;
    const consumed = order.slice(0, n);
    const u = this.player.rig.u;
    consumed.forEach((id, i) => u.uBands.value[i].set(colors[id]));
    u.uBandCount.value = consumed.length;
    const hatch = ch?.id === 'prologue' || ch?.id === 'hatchling';
    this.player.rig.mat.color.set(hatch ? '#4a4450' : '#141216');
    this.player.rig.mat.iridescence = hatch ? 1 : 0.6;
  }

  private async runSections(index: number, from: number, token: number) {
    const ch = this.chapters[index];
    try {
      for (let s = from; s < ch.sections.length; s++) {
        this.check(token);
        this.sectionIdx = s;
        updateSave((sv) => { sv.lastChapter = index; sv.lastSection = s; });
        await ch.sections[s].run(this);
      }
      this.check(token);
      // chapter complete
      updateSave((sv) => { sv.unlocked = Math.max(sv.unlocked, index + 1); });
      if (!ch.final && index + 1 < this.chapters.length) this.startChapter(index + 1);
    } catch (e) {
      if (!(e instanceof Abort)) console.error(e);
    }
  }

  retry() {
    this.startChapter(this.chapterIdx, this.sectionIdx, false);
  }

  quitToTitle() {
    this.token++;
    for (const w of this.waiters) w.reject(new Abort());
    this.waiters = [];
    this.hooks = [];
    this.director.abort();
    this.clearEnemies();
    this.pickups.clear();
    this.hazards.clear();
    this.projectiles.clear();
    this.player.rig.group.visible = false;
    this.clearStage();
    audio.setIntensity(0);
    audio.stopVoice();
    useUI.setState({ screen: 'title', objective: null, boss: null, subtitle: null, letterbox: false, choice: null, hint: null, prompt: null, memory: null, fade: 0, ending: null });
  }

  setPaused(p: boolean) {
    this.paused = p;
    useUI.setState({ screen: p ? 'paused' : 'playing' });
  }

  closeMemory() {
    this.memoryOpen = false;
    useUI.setState({ memory: null });
  }

  // ================================================================== main loop
  private frame = (dtRaw: number, _t: number) => {
    const ui = useUI.getState();
    // input that works in any state
    if (this.input.consume('escape') || this.input.consume('p')) {
      if (ui.screen === 'playing' && !this.director.active && !this.memoryOpen) this.setPaused(true);
      else if (ui.screen === 'paused') this.setPaused(false);
    }
    if (this.memoryOpen && (this.input.consume(' ') || this.input.consume('e') || this.input.consume('enter'))) this.closeMemory();
    if (this.director.active && (this.input.consume('enter') || this.input.consume(' ') || this.input.consume('escape'))) this.director.skip();
    if (this.input.consume('v')) {
      this.userCam = this.userCam === 'chase' ? 'classic' : 'chase';
      updateSave((s) => { s.settings.camera = this.userCam; });
      toast('Camera', this.userCam === 'classic' ? 'Classic overhead view' : 'Cinematic chase view', 'info', 1500);
    }

    const active = ui.screen === 'playing' && !this.paused && !this.memoryOpen && !this.starting;
    const dt = active ? dtRaw * (this.dying ? 0.25 : 1) : 0;
    this.time += dt;
    const t = this.time;

    // waiters
    if (this.waiters.length) {
      const ready = this.waiters.filter((w) => w.token === this.token && w.pred());
      if (ready.length) {
        this.waiters = this.waiters.filter((w) => !ready.includes(w));
        ready.forEach((w) => w.resolve());
      }
    }

    if (active) {
      if (this.director.active) {
        this.director.update(dt);
        if (this.cineLive) this.updateActors(dt, t);
        this.player.frozen = true;
        this.player.update(dt, t, { turn: 0, boost: false }, this.world);
        this.player.frozen = false;
      } else {
        this.updateGameplay(dt, t);
        this.updateCamera(dt);
      }
      for (const h of [...this.hooks]) h(dt);
    }
    {
      const p = this.player;
      const hemiI = this.world.hemi?.intensity ?? 0.6;
      this.heroLight.visible = p.rig.group.visible;
      this.heroLight.intensity = (8 + Math.max(0, 1 - hemiI) * 22) * (1 + p.size * 0.3);
      this.heroLight.distance = 14 + p.size * 6;
      this.heroLight.position.set(p.pos.x - p.fwd.x * 2.5, p.pos.y + 3.2 + p.size * 1.5, p.pos.z - p.fwd.z * 2.5);
    }
    // props between the camera and Aeren dissolve (only the 'inside' test during cinematics)
    occlusionUniforms.uOccCam.value.copy(this.camera.position);
    if (this.director.active) occlusionUniforms.uOccTarget.value.copy(this.camera.position);
    else occlusionUniforms.uOccTarget.value.copy(this.player.pos);
    // always-on visuals
    this.bursts.update(dtRaw);
    this.rings.update(dtRaw);
    for (const L of this.lightPool) {
      if (L.i > 0) {
        L.t += dtRaw;
        const k = Math.max(0, 1 - L.t / L.dur);
        L.l.intensity = L.i * k * k;
        if (k <= 0) { L.i = 0; L.l.intensity = 0; }
      }
    }
    this.world.update(dtRaw, performance.now() / 1000, this.player.pos, this.camera);
    this.updateMarker(t);
    this.input.endFrame();
  };

  private updateActors(dt: number, t: number) {
    for (const e of [...this.enemies]) {
      e.update(dt, t, this);
    }
  }

  private updateGameplay(dt: number, t: number) {
    const p = this.player;
    const inp = { turn: this.dying ? 0 : this.input.turn, boost: this.dying ? false : this.input.boost };
    p.update(dt, t, inp, this.world);

    // falling into the abyss
    if (p.pos.y < -20 && p.alive) {
      const drops = p.invuln > 0 ? 0 : 3;
      p.segments = Math.max(0, p.segments - drops);
      p.targetSegments = Math.min(p.targetSegments, p.segments);
      if (p.segments < 3) p.alive = false;
      else {
        audio.sfx('whoosh');
        this.flash('#000000');
        toast('You fell', 'The abyss took part of you', 'warn', 2000);
        p.place(p.lastSafe.clone(), p.lastSafeHeading, this.world);
        this.snapCamera();
      }
    }
    // lava
    if (this.world.lavaLevel > -900 && !p.abilities.has('ember') && p.alive) {
      const h = this.world.height(p.pos.x, p.pos.z);
      if (h < this.world.lavaLevel) this.hurt(1, p.pos.clone(), 'lava');
    }

    // enemies
    for (const e of [...this.enemies]) {
      e.update(dt, t, this);
      if (!e.alive && !e.isBoss) {
        this.removeEnemy(e);
        this.stats.crushed++;
      }
    }
    this.projectiles.update(dt, this);
    this.hazards.update(dt, this);

    // pickups
    const moon = p.abilities.has('moon');
    const nearest = this.pickups.update(dt, t, p, (it) => this.eat(it), moon);
    p.jawTarget = nearest < p.radius * 7 ? 1 : 0;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    // coils
    const loop = p.checkLoop();
    if (loop) this.handleLoop(loop.poly);

    // interaction prompt
    if (this.interactPrompt && this.interactPrompt.token === this.token) {
      const ip = this.interactPrompt;
      const near = Math.hypot(p.pos.x - ip.pos.x, p.pos.z - ip.pos.z) < ip.r;
      const want = near ? ip.label : null;
      if (useUI.getState().prompt !== want) useUI.setState({ prompt: want });
      if (near && (this.input.consume('e') || this.input.consume('enter') || this.input.consume('tap'))) {
        this.interactPrompt = null;
        useUI.setState({ prompt: null });
        audio.sfx('uiConfirm');
        ip.resolve();
      }
    }

    // camera mode
    this.camMode = this.boss ? 'boss' : this.camMode === 'far' ? 'far' : 'chase';

    // moon sight grading
    if (moon) this.engine.setGrade({ brightness: 0.06, hue: -0.08 });

    // death
    if (!p.alive && !this.dying) this.die();

    // HUD sync
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const abil = [...p.abilities.entries()].map(([id, tt]) => ({ id, name: ABILITY_INFO[id].name, color: ABILITY_INFO[id].color, t: tt, dur: ABILITY_INFO[id].dur }));
      useUI.setState({
        length: Math.floor(p.segments),
        stamina: p.stamina,
        abilities: abil,
        boss: this.boss ? { name: this.boss.name, title: this.boss.title, color: this.boss.color, hp: this.boss.hp() } : null,
        fps: Math.round(this.engine.fpsAvg),
      });
      if (!moon) this.engine.setGrade({ ...this.world.def.grade, brightness: this.world.def.grade.brightness ?? 0, hue: 0 });
    }
  }

  private handleLoop(poly: { x: number; z: number }[]) {
    const p = this.player;
    audio.sfx('coil');
    // glowing sigil along the loop
    for (let i = 0; i < poly.length; i += 2) {
      const q = poly[i];
      this.tmpV.set(q.x, this.world.height(q.x, q.z) + 0.6, q.z);
      this.bursts.emit(this.tmpV, { count: 2, color: '#ffd27a', speed: 1.5, size: 0.7, life: 0.9, up: 2, gravity: -1 });
    }
    let cx = 0, cz = 0;
    for (const q of poly) { cx += q.x; cz += q.z; }
    cx /= poly.length; cz /= poly.length;
    // mean radius of the loop; anything inside it — or within a forgiving crush radius — is caught
    let rr = 0;
    for (const q of poly) rr += Math.hypot(q.x - cx, q.z - cz);
    rr /= poly.length;
    const crushR = Math.max(3.2, rr * 1.7);
    this.rings.add(new THREE.Vector3(cx, this.world.height(cx, cz), cz), crushR, '#ffd27a', 0.8);
    p.rig.pulse();
    for (const e of [...this.enemies]) {
      if (!e.alive || !e.onCoil) continue;
      const er = (e as { radius?: number }).radius ?? 0;
      if (!pointInPoly(e.pos.x, e.pos.z, poly) && Math.hypot(e.pos.x - cx, e.pos.z - cz) > crushR + er) continue;
      if (!e.isBoss && p.segments < e.minCoil) {
        this.hint(`Too small to crush it — need ${e.minCoil} segments.`, 2500);
        continue;
      }
      e.onCoil(this);
      if (!e.isBoss) this.shake(0.5);
    }
    for (const h of [...this.coilHooks]) h(poly);
  }

  private eat(it: Pickup) {
    const p = this.player;
    const info = FOOD[it.kind];
    if (it.kind === 'memory') {
      this.collectMemory(it.data as string);
      return;
    }
    this.combo++;
    this.comboT = 1.6;
    p.grow(info.grow);
    this.stats.eaten++;
    this.stats.byKind[it.kind] = (this.stats.byKind[it.kind] ?? 0) + 1;
    this.bursts.emit(it.pos, { count: it.kind === 'heart' ? 120 : 22, color: info.color, speed: it.kind === 'heart' ? 14 : 4, size: 0.5, life: 0.7 });
    if (['ember', 'moon', 'blood', 'storm', 'void'].includes(it.kind)) {
      p.giveAbility(it.kind);
      audio.sfx('fruit');
      audio.sfx('ability');
      const a = ABILITY_INFO[it.kind];
      toast(a.name, a.desc, 'ability', 2600);
      this.light(it.pos, info.color, 40, 0.6);
    } else if (it.kind === 'heart') {
      audio.sfx('bite');
      audio.sfx('roar', 0.5);
      this.shake(1.5);
      this.flash(info.color);
    } else audio.sfx('eat', this.combo);
    for (const h of [...this.eatHooks]) h(it);
  }

  collectMemory(id: string) {
    const m = MEMORIES[id];
    if (!m) return;
    audio.sfx('memory');
    this.flash('#fff2c8');
    const already = useUI.getState().save.fragments.includes(id);
    if (!already) updateSave((s) => { s.fragments.push(id); });
    const idx = Object.keys(MEMORIES).indexOf(id) + 1;
    this.memoryOpen = true;
    useUI.setState({ memory: { title: m.title, text: m.text, index: idx } });
    this.player.grow(3);
  }

  private die() {
    this.dying = true;
    audio.sfx('death');
    audio.setIntensity(0);
    this.engine.setGrade({ saturation: -0.9 });
    const token = this.token;
    setTimeout(() => {
      if (token !== this.token) return;
      useUI.setState({ screen: 'dead' });
    }, 1400);
  }

  // ================================================================== camera
  private updateCamera(dt: number) {
    const p = this.player;
    const mode = this.userCam === 'classic' && this.camMode !== 'far' ? 'classic' : this.camMode;
    const lenK = Math.min(1, p.segments / 90);
    let dist = 6.5 + p.size * 3.2 + lenK * 5;
    let height = 3.2 + p.size * 2.2 + lenK * 3;
    let lookAhead = 4;
    let fov = 55;
    if (mode === 'boss') { dist *= 1.45; height *= 1.8; lookAhead = 2; fov = 58; }
    if (mode === 'far') { dist *= 2.2; height *= 2.6; fov = 55; }
    const target = this.tmpV;
    if (mode === 'classic') {
      target.set(p.pos.x, p.pos.y + 30 + p.size * 8 + lenK * 12, p.pos.z + 12 + lenK * 4);
      this.camPos.x = damp(this.camPos.x, target.x, 5, dt);
      this.camPos.y = damp(this.camPos.y, target.y, 3, dt);
      this.camPos.z = damp(this.camPos.z, target.z, 5, dt);
      this.camLook.set(damp(this.camLook.x, p.pos.x, 8, dt), damp(this.camLook.y, p.pos.y, 8, dt), damp(this.camLook.z, p.pos.z, 8, dt));
    } else {
      target.copy(p.pos).addScaledVector(p.fwd, -dist);
      target.y = p.pos.y + height;
      const gy = this.world.height(target.x, target.z) + 1.5;
      if (target.y < gy) target.y = gy;
      this.camPos.x = damp(this.camPos.x, target.x, 3.2, dt);
      this.camPos.y = damp(this.camPos.y, target.y, 2.5, dt);
      this.camPos.z = damp(this.camPos.z, target.z, 3.2, dt);
      const lx = p.pos.x + p.fwd.x * lookAhead, lz = p.pos.z + p.fwd.z * lookAhead;
      this.camLook.x = damp(this.camLook.x, lx, 6, dt);
      this.camLook.y = damp(this.camLook.y, p.pos.y + 0.8, 6, dt);
      this.camLook.z = damp(this.camLook.z, lz, 6, dt);
    }
    const boosting = this.input.boost && p.stamina > 0.05;
    const f = fov + (boosting ? 8 : 0) + (p.abilities.has('storm') ? 5 : 0);
    this.camera.fov = damp(this.camera.fov, f, 3, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private updateMarker(t: number) {
    if (!this.markerTarget || this.director.active) {
      this.marker.visible = false;
      if (useUI.getState().markerScreen) useUI.setState({ markerScreen: null });
      return;
    }
    const m = typeof this.markerTarget === 'function' ? this.markerTarget() : this.markerTarget;
    this.marker.visible = true;
    this.marker.position.set(m.x, this.world.height(m.x, m.z), m.z);
    this.marker.children[1].scale.setScalar(1 + Math.sin(t * 3) * 0.1);
    // screen-space indicator
    const v = this.tmpV.copy(m).setY(this.marker.position.y + 2).project(this.camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    const ang = Math.atan2(y, x);
    const dist = Math.round(Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z));
    if (!onScreen) {
      const s = Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.85);
      x /= s; y /= s;
    }
    useUI.setState({ markerScreen: { x: (x * 0.5 + 0.5) * 100, y: (1 - (y * 0.5 + 0.5)) * 100, onScreen, angle: ang, dist } });
  }

  dispose() {
    this.token++;
    this.input.dispose();
    this.world.dispose();
    this.engine.dispose();
  }
}
