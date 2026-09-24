import * as THREE from 'three';
import type { Enemy, GameAPI } from './types';
import { SerpentRig, SerpentHead, makeSerpentMaterial, type RigOptions, type SerpentLook } from './serpent';
import { softDot } from './textures';
import { angleDiff, clamp, damp, TAU } from './util';
import type { Hazards } from './hazards';

export type EternalId = 'ember' | 'tide' | 'gale' | 'root' | 'stone' | 'void' | 'astra';

export interface EternalDef {
  id: EternalId;
  name: string;
  title: string;
  color: string;
  look: SerpentLook;
  radius: number;
  length: number;
  speed: number;
  hits: number;
  spikes?: RigOptions['spikes'];
  horns?: boolean;
  crown?: boolean;
}

export const ETERNALS: Record<EternalId, EternalDef> = {
  ember: {
    id: 'ember', name: 'IGNIS', title: 'The Burning Coil', color: '#ff6a1a',
    look: { color: '#1a0804', belly: 3, rune: '#ff6a1a', runeIntensity: 3.2, eye: '#ffcf4a', iridescence: 0.2, emissiveBase: '#2a0600' },
    radius: 1.6, length: 60, speed: 9.5, hits: 3, spikes: { count: 40, color: '#1a0a04', emissive: '#ff5a0a', kind: 'flame', size: 1 }, horns: true,
  },
  tide: {
    id: 'tide', name: 'THALASSA', title: 'Mother of the Deep', color: '#3ad8ff',
    look: { color: '#0a2a3a', belly: 2.6, rune: '#3ad8ff', runeIntensity: 2.4, eye: '#aaf4ff', iridescence: 1 },
    radius: 2.0, length: 80, speed: 9, hits: 3, spikes: { count: 44, color: '#1a4a5a', emissive: '#2ab8ff', kind: 'blade', size: 1.3 }, crown: true,
  },
  gale: {
    id: 'gale', name: 'ZEPHYRA', title: 'Breath Between Worlds', color: '#e8f4ff',
    look: { color: '#c8d8e8', belly: 1.3, rune: '#8ad8ff', runeIntensity: 2.2, eye: '#ffffff', iridescence: 0.9, roughness: 0.6 },
    radius: 1.4, length: 46, speed: 12, hits: 3, spikes: { count: 50, color: '#f0f8ff', emissive: '#aee8ff', kind: 'blade', size: 1.6 }, crown: true,
  },
  root: {
    id: 'root', name: 'SYLVARA', title: 'The Grove That Hungers', color: '#8aff4a',
    look: { color: '#2a2012', belly: 1.8, rune: '#8aff4a', runeIntensity: 2.4, eye: '#eaff9a', iridescence: 0.2 },
    radius: 1.8, length: 70, speed: 9, hits: 3, spikes: { count: 46, color: '#3a2a14', emissive: '#4aff2a', kind: 'blade', size: 1.2 }, horns: true,
  },
  stone: {
    id: 'stone', name: 'KORRATH', title: 'The Mountain That Moves', color: '#e8c07a',
    look: { color: '#3a3632', belly: 1.5, rune: '#ffc86a', runeIntensity: 2.0, eye: '#ffcf8a', iridescence: 0, roughness: 1 },
    radius: 3.4, length: 110, speed: 6.5, hits: 4, spikes: { count: 40, color: '#4a4640', kind: 'plate', size: 1.6 }, horns: true,
  },
  void: {
    id: 'void', name: 'NIHIL', title: 'Your Shadow, Hungry', color: '#b06aff',
    look: { color: '#050308', belly: 1.1, rune: '#b06aff', runeIntensity: 2.8, eye: '#e0b0ff', iridescence: 1, transparent: true, opacity: 0.35 },
    radius: 1.2, length: 45, speed: 10, hits: 3, spikes: { count: 30, color: '#0a0610', emissive: '#8a3aff', kind: 'crystal', size: 1 },
  },
  astra: {
    id: 'astra', name: 'CHRONOS-ASTRA', title: 'Keeper of the Hours', color: '#ffd28a',
    look: { color: '#141430', belly: 2.2, rune: '#ffd28a', runeIntensity: 3, eye: '#ffffff', iridescence: 1, emissiveBase: '#05051a' },
    radius: 1.7, length: 75, speed: 9, hits: 4, spikes: { count: 40, color: '#2a2a5a', emissive: '#8a9aff', kind: 'crystal', size: 1.2 }, crown: true,
  },
};

// ============================================================ Eternal serpent boss
export class EternalBoss implements Enemy {
  obj = new THREE.Group();
  pos = new THREE.Vector3();
  radius: number;
  alive = true;
  minCoil = 0;
  isBoss = true;
  tag: string;
  rig: SerpentRig;
  hp: number;
  maxHp: number;
  heading = 0;
  fwd = new THREE.Vector3(0, 0, 1);
  mode: 'roam' | 'hunt' | 'lunge' | 'stunned' | 'submerged' | 'rising' | 'dormant' | 'dead' = 'roam';
  private mt = 0;
  private modeDur = 3;
  private roamTarget = new THREE.Vector3();
  private core: THREE.Group;
  private coreCd = 0;
  yOff = 0;
  yTarget = 0;
  private timers = { a: 3, b: 5, c: 8 };
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  opacity = 1;
  onHit?: (hp: number) => void;
  hazards: Hazards;
  speedMul = 1;
  constructor(public def: EternalDef, pos: THREE.Vector3, g: GameAPI, hazards: Hazards) {
    this.hazards = hazards;
    this.radius = def.radius;
    this.hp = this.maxHp = def.hits;
    this.tag = def.id;
    this.pos.copy(pos);
    this.rig = new SerpentRig({ look: def.look, radius: def.radius, spikes: def.spikes, horns: def.horns, crown: def.crown, step: 0.35 });
    this.rig.reset(this.pos, this.fwd, def.length, g.world.height, def.radius * 0.8);
    this.obj.add(this.rig.group);
    // glowing essence core on the tail
    this.core = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color).multiplyScalar(4) }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color(def.color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(5);
    this.core.add(orb, halo);
    this.obj.add(this.core);
    if (def.id === 'gale') this.yOff = this.yTarget = 7;
    this.pickRoam(g);
  }

  private pickRoam(g: GameAPI) {
    const R = g.world.radius * 0.6;
    const a = Math.random() * TAU;
    this.roamTarget.set(Math.cos(a) * R * Math.random(), 0, Math.sin(a) * R * Math.random());
  }
  private setMode(m: EternalBoss['mode'], dur: number) {
    this.mode = m;
    this.mt = 0;
    this.modeDur = dur;
  }
  get coreOpen() {
    if (this.coreCd > 0 || this.mode === 'dormant' || this.mode === 'dead') return false;
    switch (this.def.id) {
      case 'tide': return this.mode !== 'submerged' && this.mode !== 'rising';
      case 'gale': return this.yOff < 2.2;
      case 'void': return this.mode === 'stunned';
      default: return true;
    }
  }
  stun(sec: number) {
    this.setMode('stunned', sec);
  }
  tailPos(out: THREE.Vector3) {
    return this.rig.sample(this.rig.length * 0.93, out);
  }

  update(dt: number, t: number, g: GameAPI) {
    const p = g.player;
    const id = this.def.id;
    this.mt += dt;
    this.coreCd = Math.max(0, this.coreCd - dt);
    let sp = this.def.speed * this.speedMul * (1 + (this.maxHp - this.hp) * 0.12);
    if (this.def.id === 'gale' && this.yTarget < 1) sp *= 0.5;
    let turn = 1.6;
    let jaw = 0.15;
    let target: THREE.Vector3 | null = null;

    switch (this.mode) {
      case 'dormant':
        sp = 0;
        break;
      case 'roam':
        target = this.roamTarget;
        if (this.pos.distanceTo(this.tmp.copy(this.roamTarget).setY(this.pos.y)) < 6) this.pickRoam(g);
        if (this.mt > this.modeDur) this.setMode('hunt', 4 + Math.random() * 2);
        break;
      case 'hunt':
        target = this.tmp.copy(p.pos).addScaledVector(p.fwd, 5);
        turn = 2.0;
        sp *= 1.1;
        if (this.mt > this.modeDur) { this.setMode('lunge', 1.3); g.sfx('roar', 1 / Math.sqrt(this.radius)); }
        break;
      case 'lunge':
        sp *= 2.1;
        turn = 0.5;
        jaw = 1;
        target = p.pos;
        if (this.mt > this.modeDur) { this.setMode('roam', 3 + Math.random() * 2); this.pickRoam(g); }
        break;
      case 'stunned':
        sp = 0;
        jaw = 0.7;
        if (Math.random() < 0.3) g.bursts.emit(this.pos.clone().setY(this.pos.y + this.radius), { count: 1, color: this.def.color, speed: 2, size: 0.8, life: 1, gravity: -2 });
        if (this.mt > this.modeDur) this.setMode('roam', 3);
        break;
      case 'submerged':
        sp *= 1.3;
        target = p.pos;
        if (Math.random() < 0.6) g.bursts.emit(this.pos.clone().setY(g.world.height(this.pos.x, this.pos.z) + 0.5), { count: 2, color: '#c8f4ff', speed: 2, size: 0.5, life: 1.2, gravity: -4, up: 3 });
        if (this.mt > this.modeDur) {
          // telegraph eruption beneath the player
          const spot = p.pos.clone().addScaledVector(p.fwd, p.speed * 0.9);
          g.rings.add(spot.clone().setY(g.world.height(spot.x, spot.z)), 5.5, '#5ad8ff', 1.2, 'tele');
          g.sfx('deep');
          this.roamTarget.copy(spot);
          this.setMode('rising', 1.25);
        }
        break;
      case 'rising':
        sp = 0;
        if (this.mt > this.modeDur) {
          this.pos.set(this.roamTarget.x, this.pos.y, this.roamTarget.z);
          this.heading = Math.random() * TAU;
          this.yOff = 0;
          this.yTarget = 0;
          g.sfx('splash');
          g.sfx('roar', 0.8);
          g.shake(1.2);
          g.bursts.emit(this.pos, { count: 120, color: '#aeeaff', speed: 14, size: 0.9, life: 1.4 });
          g.rings.add(this.pos.clone().setY(g.world.height(this.pos.x, this.pos.z)), 9, '#5ad8ff', 0.8);
          if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < 5.5 + p.radius) g.hurt(3, this.pos.clone(), 'erupt');
          this.rig.reset(this.pos, new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), this.rig.length, g.world.height, this.radius * 0.8);
          this.setMode('roam', 6);
        }
        break;
    }

    // --- element behaviours
    this.timers.a -= dt; this.timers.b -= dt; this.timers.c -= dt;
    if (this.mode !== 'dormant' && this.mode !== 'dead') {
      switch (id) {
        case 'ember':
          if (this.timers.a <= 0) {
            this.timers.a = 0.16;
            const d = this.rig.length * (0.35 + Math.random() * 0.6);
            this.rig.sample(d, this.tmp2);
            this.tmp2.y = g.world.height(this.tmp2.x, this.tmp2.z);
            this.hazards.addFire(this.tmp2, 5 + Math.random() * 2);
          }
          if (this.timers.b <= 0) {
            this.timers.b = Math.max(3.2, 5.5 - (this.maxHp - this.hp));
            for (let i = 0; i < 2 + (this.maxHp - this.hp); i++) {
              const spot = p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)).addScaledVector(p.fwd, p.speed * 1.2);
              this.hazards.meteor(spot, g, 4, 1.6 + Math.random() * 0.4, 2, '#ff5a1a');
            }
          }
          break;
        case 'tide':
          if (this.mode === 'roam' && this.timers.b <= 0) {
            this.timers.b = 13;
            this.setMode('submerged', 3.5);
            this.yTarget = -this.radius * 3.5;
            g.sfx('splash');
          }
          break;
        case 'gale':
          if (this.timers.b <= 0) {
            this.timers.b = 10;
            this.yTarget = 0.4;
            // glide low and slow over the central island — the window to strike
            const a = Math.random() * TAU;
            this.roamTarget.set(Math.cos(a) * 8, 0, Math.sin(a) * 8);
            this.setMode('roam', 6);
            g.hint('Zephyra swoops low — bite the glowing tail now!', 2500);
          }
          if (this.yTarget < 1 && this.timers.b < 3.5) this.yTarget = 7;
          if (this.timers.c <= 0) {
            this.timers.c = 7 + Math.random() * 3;
            const a = Math.random() * TAU;
            this.hazards.gust(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 6.5, 3.2, g);
            g.hint('A gale is rising — steer against the wind!', 2000);
          }
          break;
        case 'root':
          if (this.timers.b <= 0) {
            this.timers.b = Math.max(2.8, 4.8 - (this.maxHp - this.hp) * 0.7);
            const ahead = p.pos.clone().addScaledVector(p.fwd, 8 + p.speed * 0.5);
            const side = new THREE.Vector3(p.fwd.z, 0, -p.fwd.x);
            this.hazards.rootWall(ahead.clone().addScaledVector(side, -9), ahead.clone().addScaledVector(side, 9), g);
          }
          break;
        case 'stone':
          if (this.timers.b <= 0) {
            this.timers.b = Math.max(1.6, 2.8 - (this.maxHp - this.hp) * 0.3);
            for (let i = 0; i < 2; i++) {
              const spot = p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16)).addScaledVector(p.fwd, p.speed);
              this.hazards.meteor(spot, g, 3.8, 1.5, 2, '#e8c07a');
            }
          }
          break;
        case 'astra':
          if (this.timers.c <= 0) {
            this.timers.c = 9;
            // blink
            g.bursts.emit(this.pos, { count: 60, color: '#ffd28a', speed: 8, size: 0.7, life: 0.8 });
            this.pickRoam(g);
            this.pos.set(this.roamTarget.x, this.pos.y, this.roamTarget.z);
            this.heading = Math.random() * TAU;
            this.rig.reset(this.pos, new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), this.rig.length, g.world.height, this.radius * 0.8);
            g.bursts.emit(this.pos, { count: 60, color: '#ffd28a', speed: 8, size: 0.7, life: 0.8 });
            g.sfx('rewind');
          }
          break;
      }
    }

    // --- movement
    if (id === 'void' && this.mode !== 'stunned' && this.mode !== 'dormant' && this.mode !== 'dead') {
      // mirrors the player through the arena centre
      const mx = -p.pos.x, mz = -p.pos.z;
      const dx = mx - this.pos.x, dz = mz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, p.speed * 1.05 * dt + d * dt * 0.8);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.heading = Math.atan2(dx, dz);
      }
    } else {
      if (target) {
        const aim = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
        this.heading += clamp(angleDiff(this.heading, aim), -1, 1) * turn * dt * 1.4;
      }
      this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.pos.addScaledVector(this.fwd, sp * dt);
    }
    this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    if (g.world.confine(this.pos)) this.pickRoam(g);
    this.yOff = damp(this.yOff, this.yTarget, 2.2, dt);
    const gy = Math.max(g.world.height(this.pos.x, this.pos.z), id === 'gale' ? 1 : -50, g.world.waterLevel);
    this.pos.y = damp(this.pos.y, gy + this.radius * 0.8 + this.yOff, 8, dt);
    this.rig.spine.head.copy(this.pos);
    if (id === 'gale') {
      // the whole body rises and dives with the head, so the tail core comes within reach on a swoop
      const k = 1 - Math.exp(-dt * 2.5);
      for (const q of this.rig.spine.pts) q.y += (this.pos.y - q.y) * k;
    }
    this.rig.jaw = jaw;
    this.rig.render(dt, t, this.fwd);

    // void visibility
    if (id === 'void') {
      const seen = this.mode === 'stunned' || p.abilities.has('moon');
      this.opacity = damp(this.opacity, seen ? 0.95 : 0.25, 4, dt);
      this.rig.mat.opacity = this.opacity;
    }
    if (id === 'tide') this.rig.group.visible = this.yOff > -this.radius * 3;

    // tail core
    this.tailPos(this.tmp2);
    this.core.position.copy(this.tmp2);
    this.core.position.y += this.radius * 0.6;
    const open = this.coreOpen;
    this.core.scale.setScalar((open ? 1 + Math.sin(t * 8) * 0.15 : 0.45) * Math.max(0.6, this.radius / 1.6));
    this.core.visible = this.rig.group.visible;

    if (!p.alive || this.mode === 'dormant' || this.mode === 'dead') return;
    // bite the tail core
    if (open && this.core.position.distanceTo(p.pos) < this.radius * 0.9 + p.radius * 2 + 0.6) {
      this.hp -= 1;
      this.coreCd = 2.8;
      this.rig.length *= 0.86;
      p.grow(5);
      p.invuln = Math.max(p.invuln, 1.2);
      this.rig.u.uFlash.value = 3;
      g.sfx('bite');
      g.sfx('roar', 1 / Math.sqrt(this.radius));
      g.shake(1);
      g.flash(this.def.color);
      g.bursts.emit(this.core.position, { count: 100, color: this.def.color, speed: 12, size: 0.9, life: 1.2 });
      g.light(this.core.position, this.def.color, 100, 0.6);
      this.onHit?.(this.hp);
      if (this.hp <= 0) { this.alive = false; this.mode = 'dead'; return; }
      this.setMode('lunge', 1.2);
      return;
    }
    // contact damage
    const harmful = this.mode !== 'stunned' && this.mode !== 'submerged' && this.mode !== 'rising' && this.yOff < 3;
    if (!harmful || p.invuln > 0) return;
    if (p.pos.distanceTo(this.pos) < this.radius * 1.5 + p.radius) {
      g.hurt(this.def.id === 'stone' ? 4 : 2, this.pos.clone(), 'boss');
      return;
    }
    for (let d = this.radius * 2.5; d < this.rig.length * 0.8; d += this.radius * 1.2) {
      this.rig.sample(d, this.tmp);
      if (this.tmp.distanceTo(p.pos) < this.radius * 0.95 + p.radius) {
        g.hurt(1, this.tmp.clone(), 'boss');
        break;
      }
    }
  }
  dispose() {
    this.rig.dispose();
  }
}

// ============================================================ Astra's time echoes
export class Echo implements Enemy {
  obj = new THREE.Group();
  pos = new THREE.Vector3();
  radius = 0.5;
  alive = true;
  minCoil = 6;
  tag = 'echo';
  rig: SerpentRig;
  private t = 0;
  private fwd = new THREE.Vector3();
  constructor(private path: { x: number; z: number; h: number }[], length: number, g: GameAPI) {
    this.rig = new SerpentRig({ look: { color: '#3a2a08', belly: 1.5, rune: '#ffd28a', runeIntensity: 3, eye: '#ffffff', transparent: true, opacity: 0.45, emissiveBase: '#3a2a0a' }, radius: g.player.radius, step: 0.25 });
    const p0 = path[0];
    this.pos.set(p0.x, g.world.height(p0.x, p0.z) + 0.4, p0.z);
    this.rig.reset(this.pos, new THREE.Vector3(Math.sin(p0.h), 0, Math.cos(p0.h)), length, g.world.height, 0.4);
    this.rig.length = length;
    this.obj.add(this.rig.group);
  }
  update(dt: number, time: number, g: GameAPI) {
    this.t += dt;
    const f = this.t / 0.1;
    const i = Math.floor(f);
    if (i >= this.path.length - 1) {
      this.rig.mat.opacity = Math.max(0, this.rig.mat.opacity - dt);
      if (this.rig.mat.opacity <= 0.01) this.alive = false;
    } else {
      const a = this.path[i], b = this.path[i + 1];
      const k = f - i;
      this.pos.x = a.x + (b.x - a.x) * k;
      this.pos.z = a.z + (b.z - a.z) * k;
      const h = a.h + angleDiff(a.h, b.h) * k;
      this.fwd.set(Math.sin(h), 0, Math.cos(h));
    }
    this.pos.y = g.world.height(this.pos.x, this.pos.z) + this.rig.radius * 0.8;
    this.rig.spine.head.copy(this.pos);
    this.rig.render(dt, time, this.fwd);
    const p = g.player;
    if (this.rig.mat.opacity > 0.3 && p.invuln <= 0) {
      const tmp = new THREE.Vector3();
      for (let d = 0; d < this.rig.length * 0.8; d += 0.8) {
        this.rig.sample(d, tmp);
        if (tmp.distanceTo(p.pos) < this.rig.radius + p.radius * 1.2) { g.hurt(1, tmp.clone(), 'echo'); break; }
      }
    }
  }
  onCoil(g: GameAPI) {
    this.alive = false;
    g.bursts.emit(this.pos, { count: 50, color: '#ffd28a', speed: 8, size: 0.6, life: 0.8 });
    g.sfx('coil');
  }
  dispose() {
    this.rig.dispose();
  }
}

// ============================================================ The First Serpent
export class FirstSerpent implements Enemy {
  obj = new THREE.Group();
  pos = new THREE.Vector3(0, 40, -60);
  radius = 6;
  alive = true;
  minCoil = 30;
  isBoss = true;
  tag = 'first';
  rig: SerpentRig;
  arches: THREE.Mesh[] = [];
  archBases: THREE.Vector3[] = [];
  mode: 'sky' | 'aim' | 'dive' | 'stuck' | 'rise' | 'idle' = 'idle';
  private mt = 0;
  private target = new THREE.Vector3();
  private skyT = 0;
  private slamSpot = new THREE.Vector3();
  coilHits = 0;
  coilNeeded = 3;
  slamming = false;
  onCoilHit?: (n: number) => void;
  private fwd = new THREE.Vector3(0, 0, 1);
  private archMat: THREE.MeshPhysicalMaterial;
  private archU: any;
  constructor(g: GameAPI) {
    const look: SerpentLook = { color: '#2a241e', belly: 1.6, rune: '#ffcf8a', runeIntensity: 1.8, eye: '#fff2c8', iridescence: 0.5, roughness: 0.95 };
    this.rig = new SerpentRig({ look, radius: 5.5, spikes: { count: 50, color: '#2a241e', kind: 'blade', size: 1.3, emissive: '#3a2a10' }, horns: true, crown: true, step: 1.2, maxRings: 500 });
    this.rig.reset(this.pos, new THREE.Vector3(1, 0, 0), 150);
    // spine starts as a sky arc
    this.rig.spine.pts.forEach((pt, i) => pt.set(-i * 1.2, 40 + Math.sin(i * 0.03) * 10, -60 - Math.cos(i * 0.02) * 20));
    this.obj.add(this.rig.group);
    const { mat, uniforms } = makeSerpentMaterial(look);
    this.archMat = mat;
    this.archU = uniforms;
    // colossal arches: the world-serpent's body rising out of the earth
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5;
      const R = 70 + (i % 2) * 18;
      const ax = Math.cos(a) * R, az = Math.sin(a) * R;
      const tang = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const span = 36 + (i % 3) * 8;
      const A = new THREE.Vector3(ax, 0, az).addScaledVector(tang, -span / 2);
      const B = new THREE.Vector3(ax, 0, az).addScaledVector(tang, span / 2);
      A.y = g.world.height(A.x, A.z) - 6;
      B.y = g.world.height(B.x, B.z) - 6;
      const mid = new THREE.Vector3(ax, 30 + (i % 2) * 12, az);
      const curve = new THREE.CatmullRomCurve3([A, A.clone().lerp(mid, 0.4).setY(mid.y * 0.8), mid, B.clone().lerp(mid, 0.4).setY(mid.y * 0.8), B]);
      const tube = new THREE.TubeGeometry(curve, 80, 5.2, 16, false);
      // remap uvs: x around, y along (in radius units) + white vertex colour
      const uv = tube.attributes.uv as THREE.BufferAttribute;
      const len = curve.getLength();
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k), v = uv.getY(k);
        uv.setXY(k, v, u * (len / (5.2 * 2.2)));
      }
      tube.setAttribute('color', new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
      const m = new THREE.Mesh(tube, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.obj.add(m);
      this.arches.push(m);
      const base = new THREE.Vector3(ax, 0, az).addScaledVector(tang, -span / 2 + 3).multiplyScalar(0.92);
      base.y = g.world.height(base.x, base.z);
      this.archBases.push(base);
      g.world.colliders.push({ x: A.x, z: A.z, r: 6 }, { x: B.x, z: B.z, r: 6 });
    }
  }
  get headPos() {
    return this.pos;
  }
  startFight() {
    this.mode = 'sky';
    this.mt = 0;
    this.skyT = 5;
  }
  update(dt: number, t: number, g: GameAPI) {
    const p = g.player;
    this.mt += dt;
    this.archU.uTime.value = t;
    let jaw = 0.2;
    const gy = (x: number, z: number) => g.world.height(x, z);
    switch (this.mode) {
      case 'idle': {
        const a = t * 0.12;
        this.target.set(Math.cos(a) * 50, 42 + Math.sin(t * 0.5) * 5, Math.sin(a) * 50);
        break;
      }
      case 'sky': {
        const a = t * 0.18;
        this.target.set(p.pos.x + Math.cos(a) * 35, 34 + Math.sin(t * 0.7) * 4, p.pos.z + Math.sin(a) * 35);
        this.skyT -= dt;
        if (this.skyT <= 0 && this.slamming) {
          this.mode = 'aim';
          this.mt = 0;
          this.slamSpot.copy(p.pos).addScaledVector(p.fwd, p.speed * 1.3);
          g.world.confine(this.slamSpot);
          this.slamSpot.y = gy(this.slamSpot.x, this.slamSpot.z);
          g.rings.add(this.slamSpot, 9, '#ffcf8a', 1.9, 'tele');
          g.sfx('roar', 0.5);
        }
        break;
      }
      case 'aim':
        jaw = 1;
        this.target.copy(this.slamSpot).setY(this.slamSpot.y + 26);
        if (this.mt > 1.5) { this.mode = 'dive'; this.mt = 0; }
        break;
      case 'dive':
        jaw = 1;
        this.target.copy(this.slamSpot).setY(this.slamSpot.y + this.radius * 0.7);
        if (this.mt > 0.45) {
          this.mode = 'stuck';
          this.mt = 0;
          g.sfx('boom', 1.6);
          g.shake(2.2);
          g.flash('#ffe0b0');
          g.rings.add(this.slamSpot, 22, '#ffcf8a', 1);
          g.bursts.emit(this.slamSpot, { count: 200, color: '#ffcf8a', speed: 20, size: 1.2, life: 1.6 });
          g.light(this.slamSpot.clone().setY(this.slamSpot.y + 4), '#ffcf8a', 200, 0.8);
          if (Math.hypot(p.pos.x - this.slamSpot.x, p.pos.z - this.slamSpot.z) < 9 + p.radius) g.hurt(4, this.slamSpot, 'slam');
          else if (p.segments > 6) {
            const [bd, bi] = p.nearestBody(this.slamSpot, 4);
            if (bd < 8 && bi > 4) g.cut(Math.max(bi, Math.floor(p.segments) - 8));
          }
          g.hint(p.segments >= this.minCoil ? 'The First Serpent is pinned — COIL around its head!' : `Too small to coil the First Serpent's head (${this.minCoil} segments needed) — eat!`, 3000);
        }
        break;
      case 'stuck':
        jaw = 0.4;
        this.target.copy(this.slamSpot).setY(this.slamSpot.y + this.radius * 0.7);
        if (this.mt > 5.5) { this.mode = 'rise'; this.mt = 0; }
        break;
      case 'rise':
        this.target.copy(this.slamSpot).setY(this.slamSpot.y + 30);
        if (this.mt > 1.6) { this.mode = 'sky'; this.skyT = 4 + Math.random() * 2; }
        break;
    }
    const lam = this.mode === 'dive' ? 12 : this.mode === 'stuck' ? 10 : 1.2;
    const prev = this.pos.clone();
    this.pos.x = damp(this.pos.x, this.target.x, lam, dt);
    this.pos.y = damp(this.pos.y, this.target.y, lam, dt);
    this.pos.z = damp(this.pos.z, this.target.z, lam, dt);
    const mv = this.pos.clone().sub(prev);
    if (mv.lengthSq() > 1e-5) this.fwd.lerp(mv.normalize(), Math.min(1, dt * 3)).normalize();
    if (this.mode === 'stuck' || this.mode === 'aim' || this.mode === 'dive') {
      const toP = p.pos.clone().sub(this.pos).setY(0).normalize();
      if (this.mode === 'stuck') this.fwd.lerp(toP, dt * 2).normalize();
    }
    this.rig.spine.head.copy(this.pos);
    this.rig.jaw = jaw;
    this.rig.render(dt, t, this.fwd, this.radius * 2.2);
  }
  onCoil(g: GameAPI) {
    if (this.mode !== 'stuck') return;
    if (g.player.segments < this.minCoil) {
      g.hint(`Too small — you need ${this.minCoil} segments to bind the First Serpent.`, 3000);
      return;
    }
    this.coilHits++;
    g.sfx('crunch');
    g.sfx('roar', 0.45);
    g.shake(2);
    g.flash('#ffcf8a');
    g.bursts.emit(this.pos, { count: 200, color: '#ffcf8a', speed: 18, size: 1.2, life: 1.5 });
    this.rig.u.uFlash.value = 3;
    this.mode = 'rise';
    this.mt = 0;
    this.onCoilHit?.(this.coilHits);
  }
  dispose() {
    this.rig.dispose();
    for (const a of this.arches) a.geometry.dispose();
    this.archMat.dispose();
  }
}

export { SerpentHead };
