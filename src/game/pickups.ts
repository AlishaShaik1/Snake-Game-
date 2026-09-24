import * as THREE from 'three';
import { softDot } from './textures';
import { type World, fallPathX } from './world';
import type { Aeren } from './serpent';
import { TAU, damp } from './util';

export type FoodKind = 'seed' | 'insect' | 'critter' | 'essence' | 'matter' | 'ember' | 'moon' | 'blood' | 'storm' | 'void' | 'memory' | 'heart';

export const FOOD: Record<FoodKind, { grow: number; color: string; name: string; r: number }> = {
  seed: { grow: 1, color: '#ffd76a', name: 'Glowing Seed', r: 0.35 },
  insect: { grow: 1, color: '#c8ff6a', name: 'Lightwing', r: 0.3 },
  critter: { grow: 2, color: '#6affd8', name: 'Burrower', r: 0.5 },
  essence: { grow: 3, color: '#7ad8ff', name: 'Magic Fragment', r: 0.45 },
  matter: { grow: 1, color: '#ffb84a', name: 'Lost Matter', r: 0.35 },
  ember: { grow: 2, color: '#ff6a1a', name: 'Ember Fruit', r: 0.5 },
  moon: { grow: 2, color: '#a8d8ff', name: 'Moon Seed', r: 0.5 },
  blood: { grow: 2, color: '#ff1a3a', name: 'Blood Root', r: 0.5 },
  storm: { grow: 2, color: '#ffee3a', name: 'Storm Berry', r: 0.5 },
  void: { grow: 2, color: '#b04aff', name: 'Void Crystal', r: 0.5 },
  memory: { grow: 0, color: '#fff2c8', name: 'Memory Fragment', r: 0.8 },
  heart: { grow: 6, color: '#ff5a3a', name: 'Heart Node', r: 1.6 },
};

export interface Pickup {
  kind: FoodKind;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  spawnT: number;
  hidden: boolean;
  data?: any;
  field?: boolean;
  wings?: THREE.Object3D[];
  life?: number;
  scale: number;
}

const geoCache: Record<string, THREE.BufferGeometry> = {};
function geo(key: string, make: () => THREE.BufferGeometry) {
  return (geoCache[key] ??= make());
}
const matCache: Record<string, THREE.Material> = {};
function emat(color: string, k = 2.5) {
  const key = color + k;
  return (matCache[key] ??= new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3, metalness: 0.1 }));
}
function halo(color: string, size: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color(color).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  s.scale.setScalar(size);
  return s;
}

function buildMesh(kind: FoodKind): { obj: THREE.Object3D; wings?: THREE.Object3D[] } {
  const g = new THREE.Group();
  const c = FOOD[kind].color;
  switch (kind) {
    case 'seed': {
      const m = new THREE.Mesh(geo('seed', () => new THREE.IcosahedronGeometry(0.22, 1).scale(0.8, 1.2, 0.8)), emat(c, 3));
      g.add(m, halo(c, 1.4));
      break;
    }
    case 'insect': {
      g.add(new THREE.Mesh(geo('ins', () => new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1, 1.8)), emat(c, 4)));
      const wm = new THREE.MeshBasicMaterial({ color: '#e8fff0', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      const wings: THREE.Object3D[] = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(geo('wing', () => new THREE.PlaneGeometry(0.3, 0.14).translate(0.15, 0, 0)), wm);
        w.scale.x = s;
        g.add(w);
        wings.push(w);
      }
      g.add(halo(c, 1.1));
      return { obj: g, wings };
    }
    case 'critter': {
      const body = new THREE.Mesh(geo('crit', () => new THREE.SphereGeometry(0.28, 12, 8).scale(0.8, 0.55, 1.3)), new THREE.MeshStandardMaterial({ color: '#1a2a2a', roughness: 0.4, metalness: 0.3 }));
      body.castShadow = true;
      g.add(body);
      for (let i = 0; i < 3; i++) {
        const spot = new THREE.Mesh(geo('spot', () => new THREE.SphereGeometry(0.06, 6, 4)), emat(c, 4));
        spot.position.set(0, 0.14, -0.15 + i * 0.13);
        g.add(spot);
      }
      const legs = new THREE.Mesh(geo('legs', () => new THREE.BoxGeometry(0.7, 0.03, 0.4)), new THREE.MeshStandardMaterial({ color: '#0a1010' }));
      legs.position.y = -0.1;
      g.add(legs);
      const wings = [legs];
      return { obj: g, wings };
    }
    case 'essence': {
      const m = new THREE.Mesh(geo('ess', () => new THREE.OctahedronGeometry(0.3, 0).scale(0.7, 1.3, 0.7)), new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 2.5, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9 }));
      g.add(m, halo(c, 1.8));
      break;
    }
    case 'matter': {
      g.add(new THREE.Mesh(geo('mat', () => new THREE.IcosahedronGeometry(0.2, 0)), emat(c, 3)), halo(c, 1.0));
      break;
    }
    case 'ember': {
      const m = new THREE.Mesh(geo('fruit', () => new THREE.SphereGeometry(0.34, 16, 12).scale(1, 1.1, 1)), emat(c, 2.2));
      const leaf = new THREE.Mesh(geo('leafF', () => new THREE.ConeGeometry(0.12, 0.4, 5).translate(0, 0.45, 0)), emat('#ffd04a', 3));
      g.add(m, leaf, halo(c, 2.2));
      break;
    }
    case 'moon': {
      const m = new THREE.Mesh(geo('moon', () => new THREE.TorusGeometry(0.28, 0.1, 8, 20, Math.PI * 1.4)), emat(c, 2.8));
      g.add(m, halo(c, 2.2));
      break;
    }
    case 'blood': {
      const m = new THREE.Mesh(geo('blood', () => new THREE.TorusKnotGeometry(0.2, 0.07, 40, 6, 2, 3)), emat(c, 2.2));
      g.add(m, halo(c, 2.2));
      break;
    }
    case 'storm': {
      const m = new THREE.Mesh(geo('storm', () => new THREE.IcosahedronGeometry(0.28, 0)), emat(c, 3));
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(geo('stormSp', () => new THREE.ConeGeometry(0.05, 0.3, 4).translate(0, 0.3, 0)), emat('#ffffff', 3));
        sp.rotation.set(Math.random() * TAU, Math.random() * TAU, 0);
        m.add(sp);
      }
      g.add(m, halo(c, 2.2));
      break;
    }
    case 'void': {
      const m = new THREE.Mesh(geo('void', () => new THREE.OctahedronGeometry(0.32, 0).scale(0.6, 1.5, 0.6)), new THREE.MeshPhysicalMaterial({ color: '#2a0a4a', emissive: c, emissiveIntensity: 2.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }));
      g.add(m, halo(c, 2.2));
      break;
    }
    case 'memory': {
      const core = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(geo('memS', () => new THREE.OctahedronGeometry(0.28, 0).scale(0.45, 1.4, 0.45)), new THREE.MeshPhysicalMaterial({ color: '#fff8e0', emissive: c, emissiveIntensity: 3.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.95 }));
        s.position.set(Math.cos((i / 4) * TAU) * 0.3, (i % 2) * 0.2, Math.sin((i / 4) * TAU) * 0.3);
        s.rotation.z = (i - 1.5) * 0.3;
        core.add(s);
      }
      const beam = new THREE.Mesh(
        geo('beam', () => new THREE.CylinderGeometry(0.25, 0.6, 40, 12, 1, true).translate(0, 20, 0)),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe8b0').multiplyScalar(1.5), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      g.add(core, beam, halo(c, 4));
      break;
    }
    case 'heart': {
      const m = new THREE.Mesh(geo('heart', () => new THREE.IcosahedronGeometry(1, 2)), new THREE.MeshPhysicalMaterial({ color: '#4a0a04', emissive: c, emissiveIntensity: 2.5, roughness: 0.2, clearcoat: 1 }));
      const shell = new THREE.Mesh(geo('heartS', () => new THREE.IcosahedronGeometry(1.35, 1)), new THREE.MeshBasicMaterial({ color: '#ffd08a', wireframe: true, transparent: true, opacity: 0.35 }));
      g.add(m, shell, halo(c, 7));
      break;
    }
  }
  return { obj: g };
}

export interface FieldDef {
  count: number;
  kinds: Partial<Record<FoodKind, number>>;
  radius?: number;
  center?: THREE.Vector3;
  alongFall?: boolean;
}

export class Pickups {
  group = new THREE.Group();
  items: Pickup[] = [];
  field: FieldDef | null = null;
  private tmp = new THREE.Vector3();
  constructor(private world: () => World) {}

  spawn(kind: FoodKind, pos: THREE.Vector3, opts: { hidden?: boolean; data?: any; field?: boolean; vel?: THREE.Vector3; life?: number; scale?: number } = {}) {
    const { obj, wings } = buildMesh(kind);
    const w = this.world();
    const p = pos.clone();
    if (kind !== 'heart') p.y = Math.max(w.height(p.x, p.z), w.waterLevel, w.lavaLevel) + (kind === 'insect' ? 1.2 : kind === 'memory' ? 1.4 : 0.6);
    obj.position.copy(p);
    const item: Pickup = { kind, obj, pos: p, vel: opts.vel?.clone() ?? new THREE.Vector3(), t: Math.random() * 10, spawnT: 0, hidden: !!opts.hidden, data: opts.data, field: opts.field, wings, life: opts.life, scale: opts.scale ?? 1 };
    obj.scale.setScalar(0.001);
    this.group.add(obj);
    this.items.push(item);
    return item;
  }

  remove(it: Pickup) {
    this.group.remove(it.obj);
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear() {
    for (const it of [...this.items]) this.remove(it);
    this.field = null;
  }

  randomSpot(area: number, center?: THREE.Vector3, avoid?: THREE.Vector3, alongFall?: boolean): THREE.Vector3 | null {
    const w = this.world();
    for (let i = 0; i < 25; i++) {
      let x: number, z: number;
      if (alongFall && avoid) {
        z = avoid.z + 15 + Math.random() * 70;
        x = fallPathX(z) + (Math.random() - 0.5) * 36;
      } else {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * area;
        x = (center?.x ?? 0) + Math.cos(a) * d;
        z = (center?.z ?? 0) + Math.sin(a) * d;
      }
      const h = w.height(x, z);
      if (h < -8 || (w.lavaLevel > h - 0.3 && w.lavaLevel > -900)) continue;
      if (avoid && (x - avoid.x) ** 2 + (z - avoid.z) ** 2 < 64) continue;
      if (w.colliders.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.8) ** 2)) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }

  private pickKind(kinds: Partial<Record<FoodKind, number>>): FoodKind {
    const entries = Object.entries(kinds) as [FoodKind, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[0][0];
  }

  /** Per frame update; calls onEat for collected items. Returns nearest food distance (for jaw). */
  update(dt: number, t: number, player: Aeren, onEat: (p: Pickup) => void, moonSight: boolean): number {
    const w = this.world();
    // maintain field
    if (this.field) {
      const n = this.items.filter((i) => i.field).length;
      if (n < this.field.count) {
        const spot = this.randomSpot(this.field.radius ?? w.radius - 10, this.field.center, player.pos, this.field.alongFall);
        if (spot) this.spawn(this.pickKind(this.field.kinds), spot, { field: true });
      }
    }
    let nearest = 99;
    const head = player.pos;
    const mouth = this.tmp.copy(head).addScaledVector(player.fwd, player.radius * 1.2);
    const eatR = player.radius * 1.9;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.spawnT = Math.min(1, it.spawnT + dt * 2.5);
      if (it.life !== undefined) {
        it.life -= dt;
        if (it.life <= 0) { this.remove(it); continue; }
      }
      const o = it.obj;
      const vis = it.hidden ? (moonSight ? 1 : 0) : 1;
      const targetScale = it.spawnT * (1 + Math.sin(it.t * 3) * 0.06) * vis * it.scale;
      o.scale.setScalar(damp(o.scale.x, targetScale, 8, dt) + 0.0001);
      o.visible = o.scale.x > 0.01;
      // motion
      const gy = Math.max(w.height(it.pos.x, it.pos.z), w.waterLevel, w.lavaLevel);
      switch (it.kind) {
        case 'insect':
          it.pos.x += Math.sin(it.t * 1.3 + i) * dt * 1.5;
          it.pos.z += Math.cos(it.t * 1.1 + i * 2) * dt * 1.5;
          it.pos.y = gy + 1.0 + Math.sin(it.t * 2.2) * 0.35;
          it.wings?.forEach((wg, k) => (wg.rotation.y = Math.sin(it.t * 60) * 0.9 * (k ? -1 : 1)));
          break;
        case 'critter': {
          const dx = it.pos.x - head.x, dz = it.pos.z - head.z;
          const d = Math.hypot(dx, dz);
          if (d < 9 && d > 0.01) {
            it.vel.x = damp(it.vel.x, (dx / d) * 5.5, 4, dt);
            it.vel.z = damp(it.vel.z, (dz / d) * 5.5, 4, dt);
          } else {
            it.vel.x = damp(it.vel.x, Math.sin(it.t * 0.7 + i) * 1.2, 2, dt);
            it.vel.z = damp(it.vel.z, Math.cos(it.t * 0.5 + i) * 1.2, 2, dt);
          }
          it.pos.x += it.vel.x * dt;
          it.pos.z += it.vel.z * dt;
          w.confine(it.pos);
          it.pos.y = gy + 0.25;
          o.rotation.y = Math.atan2(it.vel.x, it.vel.z);
          if (it.wings) it.wings[0].rotation.y = Math.sin(it.t * 30) * 0.2;
          break;
        }
        case 'matter':
          it.vel.y -= 20 * dt;
          it.pos.addScaledVector(it.vel, dt);
          it.vel.x *= Math.exp(-2 * dt); it.vel.z *= Math.exp(-2 * dt);
          if (it.pos.y < gy + 0.4) { it.pos.y = gy + 0.4; it.vel.y = Math.abs(it.vel.y) * 0.3; }
          o.rotation.y += dt * 2;
          break;
        case 'heart':
          o.rotation.y += dt * 0.8;
          o.children[1].rotation.x += dt * 0.5;
          break;
        default:
          it.pos.y = gy + (it.kind === 'memory' ? 1.4 : 0.6) + Math.sin(it.t * 2) * 0.15;
          o.rotation.y += dt * 1.2;
      }
      // magnet toward the mouth when close
      const md = it.pos.distanceTo(mouth);
      if (vis > 0 && it.spawnT >= 1) {
        if (md < player.radius * 5 && it.kind !== 'heart' && it.kind !== 'memory') {
          it.pos.lerp(mouth, Math.min(1, dt * (it.kind === 'critter' ? 2.5 : 5)));
        }
        if (md < nearest && it.kind !== 'memory') nearest = md;
        if (md < eatR + FOOD[it.kind].r * it.scale) {
          onEat(it);
          this.remove(it);
          continue;
        }
      }
      o.position.copy(it.pos);
    }
    return nearest;
  }
}
