import * as THREE from 'three';
import type { Enemy, GameAPI } from './types';
import { metalTextures, softDot } from './textures';
import { SerpentRig } from './serpent';
import { angleDiff, clamp, damp, TAU } from './util';

// ============================================================ projectiles
interface Bolt { mesh: THREE.Object3D; vel: THREE.Vector3; life: number; dmg: number; color: string; target?: 'player' | THREE.Vector3 }

export class Projectiles {
  group = new THREE.Group();
  bolts: Bolt[] = [];
  private geo = new THREE.SphereGeometry(0.22, 10, 8);
  /** extra targets that absorb bolts (e.g. warded pilgrims) */
  shields: { pos: THREE.Vector3; r: number; onHit?: () => void }[] = [];
  fire(from: THREE.Vector3, to: THREE.Vector3, speed: number, color = '#ff3a2a', dmg = 2) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(5) }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color(color).multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.6);
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.18, 2.2, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core, glow, trail);
    g.position.copy(from);
    const vel = to.clone().sub(from).normalize().multiplyScalar(speed);
    g.lookAt(from.clone().add(vel));
    this.group.add(g);
    this.bolts.push({ mesh: g, vel, life: 3.5, dmg, color });
  }
  update(dt: number, g: GameAPI) {
    const p = g.player;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      const bp = b.mesh.position;
      let dead = b.life <= 0 || bp.y < g.world.height(bp.x, bp.z) - 0.2;
      if (!dead) {
        for (const s of this.shields) {
          if (bp.distanceTo(s.pos) < s.r) {
            g.bursts.emit(bp, { count: 20, color: '#ffd27a', speed: 5, size: 0.4, life: 0.5 });
            g.sfx('block');
            s.onHit?.();
            dead = true;
            break;
          }
        }
      }
      if (!dead && p.alive) {
        const hd = bp.distanceTo(p.pos);
        if (hd < p.radius * 1.7 + 0.25) {
          g.hurt(b.dmg, bp.clone(), 'bolt');
          dead = true;
        } else if (p.segments > 6) {
          const [bd] = p.nearestBody(bp, 3);
          if (bd < p.radius * 1.3 + 0.2) {
            // the body is a shield
            g.bursts.emit(bp, { count: 18, color: '#ffe0a0', speed: 7, size: 0.3, life: 0.4 });
            g.sfx('block');
            dead = true;
          }
        }
      }
      if (dead) {
        g.bursts.emit(bp, { count: 10, color: b.color, speed: 3, size: 0.4, life: 0.4 });
        this.group.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }
  clear() {
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.bolts = [];
    this.shields = [];
  }
}

// ============================================================ materials
let _metal: THREE.MeshStandardMaterial | null = null;
export function metalMat() {
  if (_metal) return _metal;
  const t = metalTextures();
  _metal = new THREE.MeshStandardMaterial({ color: '#3a3c40', metalness: 0.9, roughness: 0.35, normalMap: t.normalMap, emissive: '#ff2a1a', emissiveMap: t.emissiveMap, emissiveIntensity: 1.2 });
  return _metal;
}
const redGlow = () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(5) });

// ============================================================ Hunter drone
export class Drone implements Enemy {
  obj = new THREE.Group();
  pos: THREE.Vector3;
  radius = 1.0;
  alive = true;
  minCoil = 8;
  tag = 'drone';
  private t = Math.random() * 10;
  private fireT = 2 + Math.random() * 2;
  private phase: 'orbit' | 'lock' = 'orbit';
  private phaseT = 3 + Math.random() * 3;
  private eye: THREE.Mesh;
  private ring: THREE.Mesh;
  private cone: THREE.Mesh;
  private home: THREE.Vector3;
  private vel = new THREE.Vector3();
  target: (() => THREE.Vector3 | null) | null = null;
  constructor(pos: THREE.Vector3, public aggro = 38) {
    this.pos = pos.clone();
    this.home = pos.clone();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14).scale(1, 0.75, 1.15), metalMat());
    body.castShadow = true;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.08, 8, 32), metalMat());
    this.ring.rotation.x = Math.PI / 2;
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), redGlow());
    this.eye.position.set(0, -0.05, 0.72);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), metalMat());
      const a = (i / 3) * TAU;
      fin.position.set(Math.cos(a) * 0.7, -0.35, Math.sin(a) * 0.7 - 0.2);
      fin.rotation.y = -a;
      this.obj.add(fin);
    }
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 7, 20, 1, true).translate(0, -3.5, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a2a').multiplyScalar(1.2), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.cone.rotation.x = -0.5;
    this.obj.add(body, this.ring, this.eye, this.cone);
    this.obj.position.copy(this.pos);
  }
  update(dt: number, t: number, g: GameAPI) {
    this.t += dt;
    const p = g.player;
    const tgt = this.target?.() ?? p.pos;
    const d = Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z);
    const want = new THREE.Vector3();
    if (d < this.aggro) {
      this.phaseT -= dt;
      if (this.phase === 'orbit') {
        // strafe around the target at a distance, taking pot-shots
        const a = Math.atan2(this.pos.x - tgt.x, this.pos.z - tgt.z) + dt * 0.6;
        const R = 11;
        want.set(tgt.x + Math.sin(a) * R, 0, tgt.z + Math.cos(a) * R);
        this.fireT -= dt;
        const tele = this.fireT < 0.6;
        (this.eye.material as THREE.MeshBasicMaterial).color.setRGB(tele ? 12 : 5, tele ? 2 : 0.6, tele ? 1 : 0.4);
        (this.cone.material as THREE.MeshBasicMaterial).opacity = 0.07;
        if (this.fireT <= 0) {
          this.fireT = 2.4 + Math.random() * 1.2;
          const lead = tgt === p.pos ? p.fwd.clone().multiplyScalar(p.speed * 0.35) : new THREE.Vector3();
          g.sfx('laser');
          g.projectiles.fire(this.eye.getWorldPosition(new THREE.Vector3()), tgt.clone().add(lead).setY(tgt.y + 0.2), 17);
        }
        if (this.phaseT <= 0) { this.phase = 'lock'; this.phaseT = 3.6; g.sfx('charge', 0.6); }
      } else {
        // LOCK: hovers in place charging a burst — the moment to coil around it
        want.set(this.pos.x, 0, this.pos.z);
        this.vel.multiplyScalar(Math.exp(-dt * 6));
        const k = 1 - this.phaseT / 3.6;
        (this.eye.material as THREE.MeshBasicMaterial).color.setRGB(6 + k * 10, 1 + k * 2, 0.4);
        (this.cone.material as THREE.MeshBasicMaterial).opacity = 0.07 + k * 0.2 * (0.6 + 0.4 * Math.sin(this.t * 30));
        if (this.phaseT <= 0) {
          const eye = this.eye.getWorldPosition(new THREE.Vector3());
          for (let i = 0; i < 3; i++) g.projectiles.fire(eye, tgt.clone().add(new THREE.Vector3((i - 1) * 1.6, 0.2, (i - 1) * 1.6)), 20);
          g.sfx('laser');
          this.phase = 'orbit';
          this.phaseT = 4 + Math.random() * 2.5;
        }
      }
    } else {
      want.set(this.home.x + Math.sin(this.t * 0.3) * 8, 0, this.home.z + Math.cos(this.t * 0.3) * 8);
    }
    this.vel.x = damp(this.vel.x, clamp(want.x - this.pos.x, -7, 7), 1.5, dt);
    this.vel.z = damp(this.vel.z, clamp(want.z - this.pos.z, -7, 7), 1.5, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    g.world.confine(this.pos);
    const gy = Math.max(g.world.height(this.pos.x, this.pos.z), g.world.waterLevel);
    this.pos.y = damp(this.pos.y, gy + 3.2 + Math.sin(this.t * 2) * 0.3, 3, dt);
    this.obj.position.copy(this.pos);
    this.obj.lookAt(tgt.x, this.pos.y - 1.5, tgt.z);
    this.ring.rotation.z += dt * 3;
    // ramming the drone hurts the head
    if (p.pos.distanceTo(this.pos) < 1.6 + p.radius) {
      g.hurt(1, this.pos.clone(), 'drone');
      this.vel.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z).normalize().multiplyScalar(14);
    }
  }
  onCoil(g: GameAPI) {
    this.explode(g);
  }
  explode(g: GameAPI) {
    this.alive = false;
    g.bursts.emit(this.pos, { count: 80, color: '#ff6a2a', speed: 12, size: 0.8, life: 1.1, gravity: 8 });
    g.bursts.emit(this.pos, { count: 40, color: '#ffd8a0', speed: 5, size: 1.4, life: 0.5 });
    g.rings.add(this.pos.clone().setY(g.world.height(this.pos.x, this.pos.z)), 6, '#ff7a3a', 0.7);
    g.light(this.pos, '#ff7a3a', 60, 0.5);
    g.sfx('crunch');
    g.sfx('boom', 0.6);
    g.shake(0.6);
    g.pickups.spawn('essence', this.pos);
  }
  dispose() {
    this.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ============================================================ The Harvester (mechanical serpent)
export class Harvester implements Enemy {
  obj = new THREE.Group();
  pos = new THREE.Vector3();
  radius = 1.3;
  alive = true;
  minCoil = 18;
  isBoss = true;
  tag = 'harvester';
  hp = 3;
  maxHp = 3;
  rig: SerpentRig;
  heading = 0;
  fwd = new THREE.Vector3(0, 0, 1);
  state: 'hunt' | 'aim' | 'charge' | 'overheat' | 'dead' = 'hunt';
  private st = 0;
  private stateDur = 7;
  private line: THREE.Mesh;
  private pulseT = 4;
  onPhase?: (hp: number) => void;
  constructor(pos: THREE.Vector3, g: GameAPI) {
    this.pos.copy(pos);
    this.rig = new SerpentRig({
      look: { color: '#2a2c30', belly: 1.4, rune: '#ff2a1a', runeIntensity: 2.2, metal: true, iridescence: 0, eye: '#ff2a1a', roughness: 0.5 },
      radius: this.radius,
      spikes: { count: 34, color: '#1a1a1e', emissive: '#ff3a1a', size: 1.2, kind: 'blade' },
      horns: true,
      step: 0.4,
    });
    this.rig.reset(this.pos, this.fwd, 38, g.world.height, this.radius);
    this.obj.add(this.rig.group);
    this.line = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 60).rotateX(-Math.PI / 2).translate(0, 0, 30),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.obj.add(this.line);
  }
  get speed() {
    return [0, 11, 10, 9][this.hp] ?? 9;
  }
  private set(s: Harvester['state'], dur: number) {
    this.state = s;
    this.st = 0;
    this.stateDur = dur;
  }
  update(dt: number, t: number, g: GameAPI) {
    const p = g.player;
    this.st += dt;
    const toP = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let sp = 0;
    let jaw = 0.1;
    switch (this.state) {
      case 'hunt': {
        const lead = p.pos.clone().addScaledVector(p.fwd, 4);
        const aim = Math.atan2(lead.x - this.pos.x, lead.z - this.pos.z);
        this.heading += clamp(angleDiff(this.heading, aim), -1, 1) * dt * 1.9;
        sp = this.speed;
        if (this.hp <= 1) {
          this.pulseT -= dt;
          if (this.pulseT <= 0) {
            this.pulseT = 4.5;
            g.rings.add(this.pos.clone(), 14, '#ff3a1a', 1.2);
            g.sfx('charge');
            // shockwave damage when it passes the head
            setTimeout(() => {
              if (!this.alive) return;
              const d = p.pos.distanceTo(this.pos);
              if (d > 5 && d < 13) g.hurt(2, this.pos.clone(), 'shock');
            }, 600);
          }
        }
        if (this.st > this.stateDur) { this.set('aim', 1.2); g.sfx('charge'); }
        break;
      }
      case 'aim':
        this.heading += clamp(angleDiff(this.heading, toP), -1, 1) * dt * 3;
        sp = 2;
        jaw = 0.8;
        (this.line.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.25 * Math.sin(this.st * 30);
        if (this.st > this.stateDur) { this.set('charge', 1.4); g.sfx('roar', 0.8); g.shake(0.6); }
        break;
      case 'charge':
        sp = 34;
        jaw = 1;
        (this.line.material as THREE.MeshBasicMaterial).opacity = 0;
        g.bursts.emit(this.pos, { count: 3, color: '#ff8a4a', speed: 2, size: 0.8, life: 0.6, up: 1 });
        if (this.st > this.stateDur) {
          this.set('overheat', 6.5);
          g.sfx('boom', 0.5);
          g.shake(0.8);
          g.hint(p.segments >= this.minCoil ? 'The Harvester is overheating — COIL around its head to crush it!' : `The Harvester is overheating — but you are too small to crush it. Grow to ${this.minCoil} segments!`, 4000);
        }
        break;
      case 'overheat':
        sp = 0;
        jaw = 0.6;
        if (Math.random() < 0.5) g.bursts.emit(this.pos.clone().setY(this.pos.y + 1), { count: 2, color: '#d8d8d8', speed: 2, size: 1.6, life: 1.4, gravity: -3, up: 3 });
        this.rig.mat.emissive.setRGB(0.6 + 0.4 * Math.sin(t * 12), 0.08, 0.02);
        if (this.st > this.stateDur) {
          this.rig.mat.emissive.setRGB(0, 0, 0);
          this.set('hunt', 6 + Math.random() * 3);
        }
        break;
      case 'dead':
        sp = 0;
        break;
    }
    this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(this.fwd, sp * dt);
    if (g.world.confine(this.pos) && this.state === 'charge') this.st = this.stateDur;
    this.pos.y = damp(this.pos.y, g.world.height(this.pos.x, this.pos.z) + this.radius * 0.8, 10, dt);
    this.rig.spine.head.copy(this.pos);
    this.rig.jaw = jaw;
    this.rig.render(dt, t, this.fwd);
    this.line.position.copy(this.pos).setY(this.pos.y - this.radius * 0.6);
    this.line.rotation.y = this.heading;

    if (this.state === 'dead' || !p.alive) return;
    // contact with the player
    const dangerous = this.state !== 'overheat';
    const hd = p.pos.distanceTo(this.pos);
    if (hd < this.radius * 1.8 + p.radius && dangerous) {
      g.hurt(3, this.pos.clone(), 'harvester');
    } else if (dangerous && p.segments > 5) {
      const [bd, bi] = p.nearestBody(this.pos, 4);
      if (bd < this.radius * 1.4 + p.radius && bi > 3) {
        // it harvests your body (a graze tears away the tail end, up to 5 segments)
        g.cut(Math.max(bi, Math.floor(p.segments) - 5));
        this.rig.length = Math.min(60, this.rig.length + 2);
        g.sfx('bite');
      }
    }
    // player head running into its body
    if (dangerous && p.invuln <= 0) {
      const tmp = new THREE.Vector3();
      for (let d = this.radius * 3; d < this.rig.length * 0.9; d += 1.2) {
        this.rig.sample(d, tmp);
        if (tmp.distanceTo(p.pos) < this.radius * 0.9 + p.radius) {
          g.hurt(1, tmp.clone(), 'harvester');
          break;
        }
      }
    }
  }
  onCoil(g: GameAPI) {
    if (this.state !== 'overheat') {
      g.hint('Its armour is sealed. Wait for it to CHARGE and OVERHEAT, then coil around it.', 3500);
      return;
    }
    if (g.player.segments < this.minCoil) {
      g.hint(`Too small to crush the Harvester — you need ${this.minCoil} segments (you have ${Math.floor(g.player.segments)}).`, 3500);
      return;
    }
    this.hp -= 1;
    g.sfx('crunch');
    g.sfx('boom', 1);
    g.shake(1.4);
    g.flash('#ff6a3a');
    g.bursts.emit(this.pos, { count: 140, color: '#ff7a2a', speed: 16, size: 0.9, life: 1.3 });
    g.light(this.pos, '#ff6a2a', 120, 0.6);
    this.rig.length = Math.max(16, this.rig.length - 8);
    this.rig.mat.emissive.setRGB(0, 0, 0);
    this.onPhase?.(this.hp);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.alive = false;
      return;
    }
    // drop matter to regrow
    for (let i = 0; i < 8; i++) g.pickups.spawn('matter', this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)));
    this.set('hunt', 7);
  }
  dispose() {
    this.rig.dispose();
  }
}

// ============================================================ The Walker (prologue hunter mech)
export class Walker {
  obj = new THREE.Group();
  legs: { upper: THREE.Group; lower: THREE.Group; phase: number; side: number; front: number }[] = [];
  light: THREE.SpotLight;
  cone: THREE.Mesh;
  hull: THREE.Group;
  eye: THREE.Mesh;
  t = 0;
  heading = 0;
  constructor() {
    const m = metalMat();
    this.hull = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 9), m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 2, 8), m);
    top.position.y = 2.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), m);
    head.position.set(0, 0.2, 5.4);
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), redGlow());
    this.eye.position.set(0, 0.2, 6.8);
    const guns = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 8).rotateX(Math.PI / 2), m);
    guns.position.set(2.2, -0.6, 4.5);
    const guns2 = guns.clone();
    guns2.position.x = -2.2;
    [body, top, head, guns, guns2].forEach((x) => { x.castShadow = true; this.hull.add(x); });
    this.hull.add(this.eye);
    this.hull.position.y = 9;
    this.obj.add(this.hull);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, front = i < 2 ? 1 : -1;
      const upper = new THREE.Group();
      const u = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 6, 8).translate(0, -3, 0), m);
      u.castShadow = true;
      upper.add(u);
      const lower = new THREE.Group();
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 7, 8).translate(0, -3.5, 0), m);
      l.castShadow = true;
      const foot = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.8, 6).translate(0, -7, 0), m);
      lower.add(l, foot);
      lower.position.y = -6;
      upper.add(lower);
      upper.position.set(side * 3.2, 8.5, front * 3.4);
      this.obj.add(upper);
      this.legs.push({ upper, lower, phase: i === 0 || i === 3 ? 0 : Math.PI, side, front });
    }
    this.light = new THREE.SpotLight('#ff5a4a', 0, 70, 0.32, 0.5, 1.2);
    this.light.position.set(0, 9.2, 6.8);
    this.light.castShadow = false;
    this.obj.add(this.light, this.light.target);
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(6, 30, 24, 1, true).translate(0, -15, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a5a'), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.obj.add(this.cone);
  }
  /** Aim searchlight at a ground point. */
  aim(p: THREE.Vector3) {
    this.light.target.position.copy(this.obj.worldToLocal(p.clone()));
    const eyeW = this.obj.localToWorld(new THREE.Vector3(0, 9.2, 6.8));
    const dir = p.clone().sub(eyeW);
    const len = dir.length();
    this.cone.position.copy(this.obj.worldToLocal(eyeW.clone()));
    this.cone.scale.set(len / 30, len / 30, len / 30);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    const inv = this.obj.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.cone.quaternion.copy(inv.multiply(q));
  }
  walk(dt: number, speed: number) {
    this.t += dt * speed;
    for (const L of this.legs) {
      const s = Math.sin(this.t + L.phase);
      L.upper.rotation.x = s * 0.35;
      L.lower.rotation.x = -Math.max(0, Math.cos(this.t + L.phase)) * 0.6 - 0.2;
    }
    this.hull.position.y = 9 + Math.abs(Math.sin(this.t)) * 0.3 * Math.min(1, speed);
    this.hull.rotation.z = Math.sin(this.t) * 0.03 * Math.min(1, speed);
  }
  dispose() {
    this.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ============================================================ humans (City of Bones)
export class Human {
  obj = new THREE.Group();
  pos: THREE.Vector3;
  t = Math.random() * 10;
  torch: THREE.Object3D | null = null;
  constructor(pos: THREE.Vector3, public name: string, color = '#8a6a3a', opts: { torch?: boolean; staff?: boolean; scale?: number } = {}) {
    this.pos = pos.clone();
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: '#b08868', roughness: 0.7 });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 10, 1, true).translate(0, 0.85, 0), cloth);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8).scale(1.1, 0.7, 0.9).translate(0, 1.55, 0), cloth);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 1.88, 0.03), skin);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, TAU, 0, Math.PI * 0.62).translate(0, 1.9, -0.03), cloth);
    [robe, shoulders, head, hood].forEach((m) => { m.castShadow = true; this.obj.add(m); });
    if (opts.torch) {
      const t = new THREE.Group();
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#3a2a1a' })));
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color('#ffae4a').multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.y = 1.05;
      flame.scale.setScalar(0.7);
      t.add(flame);
      t.position.set(0.4, 1.0, 0.25);
      t.rotation.z = -0.2;
      this.obj.add(t);
      this.torch = flame;
    }
    if (opts.staff) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: '#4a3a2a' }));
      s.position.set(-0.45, 0, 0.2);
      this.obj.add(s);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ad8ff').multiplyScalar(3) }));
      orb.position.set(-0.45, 2.45, 0.2);
      this.obj.add(orb);
    }
    this.obj.scale.setScalar(opts.scale ?? 1);
    this.obj.position.copy(this.pos);
  }
  update(dt: number, lookAt: THREE.Vector3, ground: number) {
    this.t += dt;
    this.obj.position.set(this.pos.x, ground + Math.abs(Math.sin(this.t * 1.2)) * 0.03, this.pos.z);
    const a = Math.atan2(lookAt.x - this.pos.x, lookAt.z - this.pos.z);
    this.obj.rotation.y += angleDiff(this.obj.rotation.y, a) * Math.min(1, dt * 2);
    if (this.torch) this.torch.scale.setScalar(0.6 + Math.random() * 0.15);
  }
}
