import * as THREE from 'three';
import type { GameAPI } from './types';
import { flameSprite, softDot } from './textures';
import { fallPathX } from './world';
import { TAU } from './util';

interface Fire { obj: THREE.Group; pos: THREE.Vector3; life: number; max: number }
interface Meteor { pos: THREE.Vector3; t: number; dur: number; r: number; dmg: number; rock: THREE.Object3D | null; color: string }
interface Whirl { pos: THREE.Vector3; r: number; strength: number; mesh: THREE.Mesh; vel: THREE.Vector3; t: number }
interface RootWall { spikes: THREE.Mesh[]; colliders: { x: number; z: number; r: number }[]; t: number; erupted: boolean; pts: THREE.Vector3[] }

const whirlFrag = `
uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0-1.0; float d = length(p); float a = atan(p.y,p.x);
  float sp = sin(a*5.0 + d*14.0 - uTime*5.0);
  float m = smoothstep(1.0, 0.2, d) * (0.5+0.5*sp);
  float core = smoothstep(0.25, 0.0, d);
  gl_FragColor = vec4(uColor*(m*1.5 + core*3.0), (m*0.6 + core) * smoothstep(1.0,0.8,d));
}`;

export class Hazards {
  group = new THREE.Group();
  fires: Fire[] = [];
  meteors: Meteor[] = [];
  whirls: Whirl[] = [];
  roots: RootWall[] = [];
  wind = new THREE.Vector3();
  private windT = 0;
  collapse: { z: number; speed: number; mesh: THREE.Mesh } | null = null;
  private fireMat = new THREE.SpriteMaterial({ map: flameSprite(), color: new THREE.Color('#ffae6a').multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private glowGeo = new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2);
  private glowMat = new THREE.MeshBasicMaterial({ map: softDot(), color: new THREE.Color('#ff4a0a').multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private rockGeo = new THREE.IcosahedronGeometry(1, 1);
  private rockMat = new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.9, emissive: '#ff4a0a', emissiveIntensity: 0.6 });
  private spikeGeo = new THREE.ConeGeometry(0.55, 3.2, 6).translate(0, 1.6, 0);
  private spikeMat = new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 0.8, emissive: '#6aff3a', emissiveIntensity: 0.25 });
  private tmp = new THREE.Vector3();

  addFire(pos: THREE.Vector3, life = 5) {
    if (this.fires.length > 110) {
      const f = this.fires.shift()!;
      this.group.remove(f.obj);
    }
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const s = new THREE.Sprite(this.fireMat);
      s.position.set((Math.random() - 0.5) * 0.8, 0.9, (Math.random() - 0.5) * 0.8);
      s.scale.set(1.1, 2.1, 1);
      g.add(s);
    }
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.y = 0.08;
    g.add(glow);
    g.position.copy(pos);
    this.group.add(g);
    this.fires.push({ obj: g, pos: pos.clone(), life, max: life });
  }

  meteor(pos: THREE.Vector3, g: GameAPI, r = 4.5, delay = 1.5, dmg = 2, color = '#ff5a1a', rock = true) {
    const p = pos.clone();
    p.y = g.world.height(p.x, p.z);
    g.rings.add(p, r, color, delay, 'tele');
    let obj: THREE.Object3D | null = null;
    if (rock) {
      obj = new THREE.Mesh(this.rockGeo, this.rockMat);
      obj.scale.setScalar(r * 0.3);
      obj.castShadow = true;
      this.group.add(obj);
    }
    this.meteors.push({ pos: p, t: 0, dur: delay, r, dmg, rock: obj, color });
  }

  whirlpool(pos: THREE.Vector3, r: number, strength: number, color = '#5ad8ff') {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: whirlFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      }),
    );
    mesh.scale.setScalar(r);
    this.group.add(mesh);
    const w: Whirl = { pos: pos.clone(), r, strength, mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4), t: 0 };
    this.whirls.push(w);
    return w;
  }

  rootWall(a: THREE.Vector3, b: THREE.Vector3, g: GameAPI) {
    const pts: THREE.Vector3[] = [];
    const n = Math.max(3, Math.floor(a.distanceTo(b) / 1.3));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.y = g.world.height(p.x, p.z);
      pts.push(p);
      if (i % 2 === 0) g.rings.add(p, 1.3, '#8aff4a', 1.3, 'tele');
    }
    this.roots.push({ spikes: [], colliders: [], t: 0, erupted: false, pts });
  }

  gust(dir: THREE.Vector3, strength: number, dur: number, g: GameAPI) {
    this.wind.copy(dir).setY(0).normalize().multiplyScalar(strength);
    this.windT = dur;
    g.sfx('gust');
  }

  startCollapse(z: number, speed: number) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 160),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.0),f.x),f.y);}
          void main(){
            vec2 p=vUv*vec2(8.0,4.0);
            float v=n(p+vec2(uTime*0.6,-uTime*0.9))*0.6+n(p*2.3-vec2(0.0,uTime*1.5))*0.4;
            float edge=smoothstep(0.0,0.3,vUv.y)*smoothstep(1.0,0.6,vUv.y);
            vec3 c=mix(vec3(0.02,0.0,0.03), vec3(1.0,0.85,0.7)*3.0, pow(v,6.0));
            c += vec3(0.6,0.2,1.0)*pow(v,3.0)*0.6;
            gl_FragColor=vec4(c, (0.75+0.25*v)*edge);
          }`,
      }),
    );
    this.group.add(mesh);
    this.collapse = { z, speed, mesh };
  }

  update(dt: number, g: GameAPI) {
    const p = g.player;
    const ember = p.abilities.has('ember');
    // fires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      const k = Math.min(1, f.life / 0.8, (f.max - f.life) / 0.3 + 0.1);
      f.obj.scale.setScalar(Math.max(0.01, k) * (0.9 + Math.random() * 0.2));
      if (f.life <= 0) { this.group.remove(f.obj); this.fires.splice(i, 1); continue; }
      if (!ember && p.alive && f.life < f.max - 0.3) {
        const dx = f.pos.x - p.pos.x, dz = f.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 1.6 * 1.6 + p.radius) g.hurt(1, f.pos, 'fire');
      }
    }
    // meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = m.t / m.dur;
      if (m.rock) {
        m.rock.position.set(m.pos.x + (1 - k) * 12, m.pos.y + (1 - k) * 45, m.pos.z + (1 - k) * 6);
        m.rock.rotation.x += dt * 4;
      }
      if (k >= 1) {
        if (m.rock) this.group.remove(m.rock);
        g.bursts.emit(m.pos.clone().setY(m.pos.y + 0.5), { count: 60, color: m.color, speed: 12, size: 0.8, life: 1.0 });
        g.rings.add(m.pos, m.r * 1.6, m.color, 0.6);
        g.sfx('boom', 0.5);
        g.shake(0.5);
        g.light(m.pos.clone().setY(m.pos.y + 2), m.color, 50, 0.4);
        if (p.alive) {
          const dh = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
          if (dh < m.r + p.radius) g.hurt(m.dmg, m.pos, 'meteor');
          else if (p.segments > 6) {
            // crush the body segment closest to the impact
            const [bd, bi] = p.nearestBody(m.pos, 4);
            if (bd < m.r * 0.7 && bi > 4) g.cut(bi);
          }
        }
        this.meteors.splice(i, 1);
      }
    }
    // whirlpools
    for (const w of this.whirls) {
      w.t += dt;
      w.pos.addScaledVector(w.vel, dt);
      if (Math.hypot(w.pos.x, w.pos.z) > g.world.radius * 0.7) w.vel.multiplyScalar(-1);
      w.mesh.position.set(w.pos.x, g.world.height(w.pos.x, w.pos.z) + 0.2, w.pos.z);
      (w.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = w.t;
      const dx = w.pos.x - p.pos.x, dz = w.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < w.r && d > 0.01 && p.alive) {
        const pull = w.strength * (1 - d / w.r);
        p.pos.x += (dx / d) * pull * dt + (-dz / d) * pull * 0.6 * dt;
        p.pos.z += (dz / d) * pull * dt + (dx / d) * pull * 0.6 * dt;
        if (d < 1.8) g.hurt(1, w.pos, 'whirl');
      }
      if (Math.random() < 0.3) g.bursts.emit(w.pos.clone().add(new THREE.Vector3(Math.cos(w.t * 3) * w.r * 0.6, 0.3, Math.sin(w.t * 3) * w.r * 0.6)), { count: 1, color: '#bff4ff', speed: 1, size: 0.4, life: 1, gravity: -2 });
    }
    // roots
    for (let i = this.roots.length - 1; i >= 0; i--) {
      const r = this.roots[i];
      r.t += dt;
      if (!r.erupted && r.t > 1.3) {
        r.erupted = true;
        g.sfx('crunch');
        g.shake(0.4);
        for (const pt of r.pts) {
          const s = new THREE.Mesh(this.spikeGeo, this.spikeMat);
          s.position.copy(pt);
          s.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * TAU, (Math.random() - 0.5) * 0.5);
          s.scale.setScalar(0.01);
          s.castShadow = true;
          this.group.add(s);
          r.spikes.push(s);
          const c = { x: pt.x, z: pt.z, r: 0.7 };
          r.colliders.push(c);
          g.world.colliders.push(c);
          g.bursts.emit(pt, { count: 6, color: '#8a6a3a', speed: 5, size: 0.6, life: 0.7, gravity: 12 });
          if (Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z) < 1.5 + p.radius) g.hurt(2, pt, 'root');
        }
      }
      if (r.erupted) {
        const grow = Math.min(1, (r.t - 1.3) * 6);
        const shrink = r.t > 8 ? Math.max(0, 1 - (r.t - 8) * 2) : 1;
        for (const s of r.spikes) s.scale.setScalar(Math.max(0.01, grow * shrink));
      }
      if (r.t > 8.6) {
        for (const s of r.spikes) this.group.remove(s);
        g.world.colliders = g.world.colliders.filter((c) => !r.colliders.includes(c));
        this.roots.splice(i, 1);
      }
    }
    // wind
    if (this.windT > 0) {
      this.windT -= dt;
      if (p.alive) {
        p.pos.x += this.wind.x * dt;
        p.pos.z += this.wind.z * dt;
      }
      for (let k = 0; k < 3; k++) {
        this.tmp.set(p.pos.x + (Math.random() - 0.5) * 40 - this.wind.x, p.pos.y + Math.random() * 6, p.pos.z + (Math.random() - 0.5) * 40 - this.wind.z);
        g.bursts.emit(this.tmp, { count: 1, color: '#ffffff', speed: 0.1, size: 0.25, life: 0.9, gravity: 0, up: 0 });
      }
    }
    // collapse wall
    if (this.collapse) {
      const c = this.collapse;
      c.z += c.speed * dt;
      const cx = fallPathX(c.z);
      c.mesh.position.set(cx, 20, c.z);
      (c.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
      if (Math.random() < 0.8) {
        this.tmp.set(cx + (Math.random() - 0.5) * 50, g.world.height(cx, c.z) + Math.random() * 10, c.z + 2);
        g.bursts.emit(this.tmp, { count: 3, color: '#ffc08a', speed: 6, size: 0.9, life: 1.2, gravity: -6, up: 4 });
      }
      if (p.alive && p.pos.z < c.z + 4) {
        g.hurt(2, p.pos.clone(), 'collapse');
        p.pos.z = c.z + 5;
      }
    }
  }

  clear(g?: GameAPI) {
    for (const f of this.fires) this.group.remove(f.obj);
    for (const m of this.meteors) if (m.rock) this.group.remove(m.rock);
    for (const w of this.whirls) { this.group.remove(w.mesh); (w.mesh.material as THREE.Material).dispose(); }
    for (const r of this.roots) {
      for (const s of r.spikes) this.group.remove(s);
      if (g) g.world.colliders = g.world.colliders.filter((c) => !r.colliders.includes(c));
    }
    if (this.collapse) { this.group.remove(this.collapse.mesh); (this.collapse.mesh.material as THREE.Material).dispose(); }
    this.fires = []; this.meteors = []; this.whirls = []; this.roots = []; this.collapse = null;
    this.windT = 0;
  }
}
