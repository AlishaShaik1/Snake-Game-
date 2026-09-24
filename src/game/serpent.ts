import * as THREE from 'three';
import { scaleTextures, metalTextures } from './textures';
import { clamp, damp, smoothstep, TAU, angleDiff } from './util';
import type { World } from './world';

// ============================================================ Spine: path history
export class Spine {
  pts: THREE.Vector3[] = [];
  head = new THREE.Vector3();
  private pool: THREE.Vector3[] = [];
  constructor(public step = 0.25) {}

  reset(pos: THREE.Vector3, dir: THREE.Vector3, length: number, heightAt?: (x: number, z: number) => number, lift = 0) {
    this.pool.push(...this.pts);
    this.pts = [];
    this.head.copy(pos);
    const n = Math.ceil(length / this.step) + 4;
    for (let i = 1; i <= n; i++) {
      const p = this.alloc().copy(pos).addScaledVector(dir, -i * this.step);
      if (heightAt) p.y = heightAt(p.x, p.z) + lift;
      this.pts.push(p);
    }
  }
  private alloc() {
    return this.pool.pop() ?? new THREE.Vector3();
  }
  /** Move the head; records trail points at fixed spacing. */
  push(pos: THREE.Vector3, maxLength: number) {
    this.head.copy(pos);
    if (!this.pts.length) { this.pts.push(this.alloc().copy(pos)); return; }
    let last = this.pts[0];
    let d = last.distanceTo(pos);
    let guard = 0;
    while (d >= this.step && guard++ < 50) {
      const p = this.alloc().copy(last).lerp(pos, this.step / d);
      this.pts.unshift(p);
      last = p;
      d = last.distanceTo(pos);
    }
    const keep = Math.ceil(maxLength / this.step) + 6;
    while (this.pts.length > keep) this.pool.push(this.pts.pop()!);
  }
  /** Sample position at arc distance d from the head. */
  sample(d: number, out: THREE.Vector3) {
    const p0 = this.pts[0];
    if (!p0) return out.copy(this.head);
    const g0 = this.head.distanceTo(p0);
    if (d <= g0) return out.copy(this.head).lerp(p0, g0 > 1e-5 ? d / g0 : 0);
    const f = (d - g0) / this.step;
    const i = Math.floor(f);
    if (i >= this.pts.length - 1) return out.copy(this.pts[this.pts.length - 1]);
    return out.copy(this.pts[i]).lerp(this.pts[i + 1], f - i);
  }
  get available() {
    return this.pts.length * this.step;
  }
}

// ============================================================ materials
export interface SerpentLook {
  color: string;
  belly: number; // multiplier for belly brightness
  rune: string;
  runeIntensity: number;
  iridescence?: number;
  /** fresnel rim glow so the silhouette always reads against dark worlds */
  rim?: number;
  rimColor?: string;
  metal?: boolean;
  roughness?: number;
  eye: string;
  transparent?: boolean;
  opacity?: number;
  emissiveBase?: string;
}

export interface SerpentUniforms {
  uTime: { value: number };
  uPulse: { value: number };
  uFlash: { value: number };
  uRuneColor: { value: THREE.Color };
  uRuneIntensity: { value: number };
  uBands: { value: THREE.Color[] };
  uBandCount: { value: number };
  uLenV: { value: number };
  uRim: { value: number };
  uRimColor: { value: THREE.Color };
}

export function makeSerpentMaterial(look: SerpentLook) {
  const tex = scaleTextures();
  const metal = look.metal ? metalTextures() : null;
  const uniforms: SerpentUniforms = {
    uTime: { value: 0 },
    uPulse: { value: -10 },
    uFlash: { value: 0 },
    uRuneColor: { value: new THREE.Color(look.rune) },
    uRuneIntensity: { value: look.runeIntensity },
    uBands: { value: Array.from({ length: 7 }, () => new THREE.Color(look.rune)) },
    uBandCount: { value: 0 },
    uLenV: { value: 50 },
    uRim: { value: look.rim ?? 0 },
    uRimColor: { value: new THREE.Color(look.rimColor ?? look.rune) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: look.color,
    map: tex.map,
    normalMap: metal ? metal.normalMap : tex.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: tex.roughnessMap,
    roughness: look.roughness ?? 0.9,
    metalness: look.metal ? 0.85 : 0.08,
    clearcoat: look.metal ? 0.3 : 0.75,
    clearcoatRoughness: 0.35,
    iridescence: look.iridescence ?? 0.45,
    iridescenceIOR: 1.35,
    sheen: 0.4,
    sheenColor: new THREE.Color(look.rune).multiplyScalar(0.3),
    emissive: new THREE.Color(look.emissiveBase ?? '#000000'),
    emissiveMap: tex.runeMap,
    vertexColors: true,
    transparent: !!look.transparent,
    opacity: look.opacity ?? 1,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime, uPulse, uFlash, uRuneIntensity, uBandCount, uLenV;
        uniform vec3 uRuneColor; uniform vec3 uBands[7];
        uniform float uRim; uniform vec3 uRimColor;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `
        {
          vec2 ruv = vec2(vEmissiveMapUv.x, vEmissiveMapUv.y * 0.22);
          float rune = texture2D(emissiveMap, ruv).r;
          float along = vEmissiveMapUv.y;
          vec3 rc = uRuneColor;
          if (uBandCount > 0.5) {
            int bi = int(mod(floor(along * 0.22), uBandCount));
            for (int i = 0; i < 7; i++) if (i == bi) rc = uBands[i];
          }
          float breathe = 0.75 + 0.25 * sin(uTime * 2.0 - along * 0.35);
          float pulse = exp(-pow((along - uPulse) * 0.45, 2.0)) * 3.0;
          float tailFade = 1.0 - smoothstep(uLenV * 0.8, uLenV, along);
          totalEmissiveRadiance = emissive + rc * rune * (uRuneIntensity * breathe + pulse) * tailFade;
          totalEmissiveRadiance += vec3(1.0, 0.1, 0.05) * uFlash;
          if (uRim > 0.0) {
            float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += uRimColor * pow(fr, 3.0) * uRim * tailFade;
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'serpent' + (look.metal ? 'm' : '') + (look.transparent ? 't' : '');
  return { mat, uniforms };
}

// ============================================================ body mesh
const RAD = 14;
export class SerpentBody {
  mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private posA: THREE.BufferAttribute;
  private nrmA: THREE.BufferAttribute;
  private uvA: THREE.BufferAttribute;
  private ringP: THREE.Vector3[];
  private ringR: Float32Array;
  private ringD: Float32Array;
  private tmp = new THREE.Vector3();
  private T = new THREE.Vector3();
  private S = new THREE.Vector3();
  private N = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  constructor(material: THREE.Material, private maxRings = 720, belly = 1.8) {
    const vcount = maxRings * (RAD + 1);
    this.geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(new Float32Array(vcount * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmA = new THREE.BufferAttribute(new Float32Array(vcount * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.uvA = new THREE.BufferAttribute(new Float32Array(vcount * 2), 2).setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(vcount * 3);
    for (let r = 0; r < maxRings; r++)
      for (let j = 0; j <= RAD; j++) {
        const phi = (j / RAD) * TAU;
        const b = smoothstep(0.2, 0.85, Math.cos(phi)); // 1 at belly
        const v = 1 + (belly - 1) * b;
        const i = (r * (RAD + 1) + j) * 3;
        colors[i] = v; colors[i + 1] = v * 0.97; colors[i + 2] = v * 0.9;
      }
    const idx: number[] = [];
    for (let r = 0; r < maxRings - 1; r++)
      for (let j = 0; j < RAD; j++) {
        const a = r * (RAD + 1) + j, b = a + 1, c = a + RAD + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', this.posA);
    this.geo.setAttribute('normal', this.nrmA);
    this.geo.setAttribute('uv', this.uvA);
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.ringP = Array.from({ length: maxRings }, () => new THREE.Vector3());
    this.ringR = new Float32Array(maxRings);
    this.ringD = new Float32Array(maxRings);
  }

  /**
   * Rebuild the body along the spine.
   * @param start distance behind head where the body begins (neck)
   */
  update(spine: Spine, length: number, radius: number, start: number, bulges: number[] = [], neckScale = 0.78, tailTaper = 0.4) {
    const spacing = Math.max(radius * 0.42, (length - start) / (this.maxRings - 2), 0.08);
    let n = Math.min(this.maxRings, Math.floor((length - start) / spacing) + 2);
    if (n < 2) n = 2;
    const P = this.ringP, R = this.ringR, D = this.ringD;
    for (let k = 0; k < n; k++) {
      const d = Math.min(start + k * spacing, length);
      D[k] = d;
      spine.sample(d, P[k]);
      const t = d / length;
      let r = radius;
      r *= neckScale + (1 - neckScale) * smoothstep(start, start + radius * 4, d);
      const s = smoothstep(tailTaper, 1, t);
      r *= Math.max(0.04, Math.pow(1 - s, 0.85));
      for (const b of bulges) {
        const x = (d - b) / (radius * 1.6);
        r += radius * 0.38 * Math.exp(-x * x);
      }
      R[k] = r;
    }
    const pos = this.posA.array as Float32Array;
    const nrm = this.nrmA.array as Float32Array;
    const uv = this.uvA.array as Float32Array;
    const T = this.T, S = this.S, N = this.N;
    for (let k = 0; k < n; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(n - 1, k + 1)];
      T.subVectors(a, b);
      if (T.lengthSq() < 1e-8) T.set(0, 0, 1);
      T.normalize();
      S.crossVectors(T, this.up);
      if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
      S.normalize();
      N.crossVectors(S, T).normalize();
      const r = R[k];
      const c = P[k];
      const v = D[k] / (radius * 2.2);
      for (let j = 0; j <= RAD; j++) {
        const phi = (j / RAD) * TAU;
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const rv = r * (cp > 0 ? 0.62 : 0.86); // flatter belly
        const ox = -cp * N.x * rv + sp * S.x * r;
        const oy = -cp * N.y * rv + sp * S.y * r;
        const oz = -cp * N.z * rv + sp * S.z * r;
        const i = (k * (RAD + 1) + j) * 3;
        pos[i] = c.x + ox;
        pos[i + 1] = c.y + oy + r * 0.12;
        pos[i + 2] = c.z + oz;
        let nx = -cp * N.x * 0.8 + sp * S.x, ny = -cp * N.y * 0.8 + sp * S.y, nz = -cp * N.z * 0.8 + sp * S.z;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[i] = nx / l; nrm[i + 1] = ny / l; nrm[i + 2] = nz / l;
        const ui = (k * (RAD + 1) + j) * 2;
        uv[ui] = j / RAD;
        uv[ui + 1] = v;
      }
    }
    this.posA.needsUpdate = true;
    this.nrmA.needsUpdate = true;
    this.uvA.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * RAD * 6);
    return D[n - 1] / (radius * 2.2);
  }

  dispose() {
    this.geo.dispose();
  }
}

// ============================================================ head
export class SerpentHead {
  group = new THREE.Group();
  jaw = new THREE.Group();
  tongue = new THREE.Group();
  eyes: THREE.Mesh[] = [];
  private jawOpen = 0;
  private tongueT = 0;
  private tongueTimer = 2;
  eyeMat: THREE.MeshBasicMaterial;
  constructor(material: THREE.Material, eyeColor: string, opts: { horns?: boolean; mech?: boolean; crown?: boolean } = {}) {
    // skull
    const skullG = new THREE.SphereGeometry(1, 28, 18);
    const p = skullG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const front = Math.max(0, z);
      x *= 0.78 * (1 - front * 0.32);
      y *= (y > 0 ? 0.5 : 0.32) * (1 - front * 0.25);
      z *= 1.35;
      // brow ridges
      const brow = Math.exp(-(((Math.abs(x) - 0.42) ** 2) / 0.02 + ((z - 0.35) ** 2) / 0.08)) * (y > 0 ? 0.1 : 0);
      y += brow;
      // jaw cheeks
      if (y < 0) y -= 0.05 * (1 - front);
      p.setXYZ(i, x, y, z);
    }
    skullG.computeVertexNormals();
    const skull = new THREE.Mesh(skullG, material);
    skull.castShadow = true;
    this.group.add(skull);

    // lower jaw (pivot at back)
    const jawG = new THREE.SphereGeometry(1, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
    const jp = jawG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < jp.count; i++) {
      let x = jp.getX(i), y = jp.getY(i), z = jp.getZ(i);
      const front = Math.max(0, z);
      x *= 0.7 * (1 - front * 0.35);
      y *= 0.22;
      z *= 1.25;
      jp.setXYZ(i, x, y, z + 0.9);
    }
    jawG.computeVertexNormals();
    const jawM = new THREE.Mesh(jawG, material);
    jawM.castShadow = true;
    this.jaw.add(jawM);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).scale(0.9, 1.6, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a0a10', roughness: 0.6, emissive: '#1a0206' }));
    mouth.position.set(0, 0.005, 0.95);
    this.jaw.add(mouth);
    this.jaw.position.set(0, -0.06, -0.9);
    this.group.add(this.jaw);

    // fangs
    const fangM = new THREE.MeshStandardMaterial({ color: '#f0e8d8', roughness: 0.3 });
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), fangM);
      f.rotation.x = Math.PI;
      f.position.set(s * 0.22, -0.18, 1.02);
      this.group.add(f);
    }

    // eyes
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(eyeColor).multiplyScalar(4) });
    const pupilM = new THREE.MeshBasicMaterial({ color: '#000' });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), this.eyeMat);
      e.position.set(s * 0.46, 0.16, 0.42);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.04), pupilM);
      pupil.position.set(s * 0.1, 0, 0.06);
      pupil.rotation.y = s * 0.9;
      e.add(pupil);
      this.eyes.push(e);
      this.group.add(e);
    }
    // tongue
    const tongueM = new THREE.MeshStandardMaterial({ color: '#8a1020', roughness: 0.5, emissive: '#2a0006' });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.7).translate(0, 0, 0.35), tongueM);
    this.tongue.add(base);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.25).translate(0, 0, 0.12), tongueM);
      f.position.set(0, 0, 0.68);
      f.rotation.y = s * 0.35;
      this.tongue.add(f);
    }
    this.tongue.position.set(0, -0.12, 0.7);
    this.tongue.scale.z = 0.01;
    this.group.add(this.tongue);

    if (opts.horns) {
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 7).translate(0, 0.45, 0), material);
        h.position.set(s * 0.4, 0.3, -0.3);
        h.rotation.set(-1.1, 0, s * 0.35);
        this.group.add(h);
      }
    }
    if (opts.crown) {
      for (let i = 0; i < 5; i++) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + (i === 2 ? 0.3 : 0), 5).translate(0, 0.25, 0), material);
        h.position.set((i - 2) * 0.16, 0.38, -0.4 - Math.abs(i - 2) * 0.05);
        h.rotation.x = -0.9;
        this.group.add(h);
      }
    }
    // shared serpent material uses vertex colours — give head parts a neutral colour attribute
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === material && !m.geometry.attributes.color) {
        const n = m.geometry.attributes.position.count;
        const c = new Float32Array(n * 3).fill(1);
        m.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
    });
  }

  update(dt: number, pos: THREE.Vector3, fwd: THREE.Vector3, scale: number, jawTarget: number, time: number) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(scale);
    const look = this.tmp.copy(pos).add(fwd);
    this.group.lookAt(look);
    this.jawOpen = damp(this.jawOpen, jawTarget, jawTarget > this.jawOpen ? 14 : 22, dt);
    this.jaw.rotation.x = this.jawOpen * 0.75;
    // tongue flick
    this.tongueTimer -= dt;
    if (this.tongueTimer <= 0) { this.tongueT = 0.45; this.tongueTimer = 1.8 + Math.random() * 2.5; }
    if (this.tongueT > 0) {
      this.tongueT -= dt;
      const k = Math.sin((1 - this.tongueT / 0.45) * Math.PI);
      this.tongue.scale.z = 0.01 + k;
      this.tongue.rotation.y = Math.sin(time * 40) * 0.15 * k;
    } else this.tongue.scale.z = 0.01;
  }
  private tmp = new THREE.Vector3();
  blinkEyes(intensity: number) {
    this.eyes.forEach((e) => e.scale.setScalar(intensity));
  }
}

// ============================================================ generic rig: spine + body + head + dorsal spikes
export interface RigOptions {
  look: SerpentLook;
  radius: number;
  maxRings?: number;
  spikes?: { count: number; color: string; emissive?: string; size?: number; kind?: 'blade' | 'crystal' | 'plate' | 'flame' };
  horns?: boolean;
  crown?: boolean;
  step?: number;
}

export class SerpentRig {
  group = new THREE.Group();
  spine: Spine;
  body: SerpentBody;
  head: SerpentHead;
  mat: THREE.MeshPhysicalMaterial;
  u: SerpentUniforms;
  radius: number;
  length = 10;
  bulges: number[] = [];
  jaw = 0;
  private spikes: THREE.InstancedMesh | null = null;
  private spikeCount = 0;
  private dummy = new THREE.Object3D();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  constructor(public opts: RigOptions) {
    this.radius = opts.radius;
    const { mat, uniforms } = makeSerpentMaterial(opts.look);
    this.mat = mat;
    this.u = uniforms;
    this.spine = new Spine(opts.step ?? 0.25);
    this.body = new SerpentBody(mat, opts.maxRings ?? 720, opts.look.belly);
    this.head = new SerpentHead(mat, opts.look.eye, { horns: opts.horns, crown: opts.crown });
    this.group.add(this.body.mesh, this.head.group);
    if (opts.spikes) {
      const s = opts.spikes;
      let g: THREE.BufferGeometry;
      switch (s.kind) {
        case 'crystal': g = new THREE.OctahedronGeometry(0.5, 0).scale(0.35, 1.4, 0.35).translate(0, 0.5, 0); break;
        case 'plate': g = new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(0, 0.1, 0); break;
        case 'flame': g = new THREE.ConeGeometry(0.3, 1.2, 5).translate(0, 0.5, 0); break;
        default: g = new THREE.ConeGeometry(0.22, 1, 4).scale(0.35, 1, 1.4).translate(0, 0.45, -0.15);
      }
      const m = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.4, metalness: 0.3, emissive: s.emissive ?? '#000', emissiveIntensity: s.emissive ? 2 : 0 });
      this.spikes = new THREE.InstancedMesh(g, m, s.count);
      this.spikes.castShadow = true;
      this.spikes.frustumCulled = false;
      this.spikeCount = s.count;
      this.group.add(this.spikes);
    }
  }

  reset(pos: THREE.Vector3, dir: THREE.Vector3, length: number, heightAt?: (x: number, z: number) => number, lift = 0) {
    this.length = length;
    this.spine.reset(pos, dir, length + 10, heightAt, lift);
  }

  /** Head position & forward are driven by the owner. */
  render(dt: number, time: number, fwd: THREE.Vector3, headScale?: number) {
    this.spine.push(this.spine.head, this.length + 10);
    const r = this.radius;
    this.u.uTime.value = time;
    const lenV = this.body.update(this.spine, this.length, r, r * 0.55, this.bulges);
    this.u.uLenV.value = lenV;
    this.head.update(dt, this.spine.head, fwd, headScale ?? r * 1.38, this.jaw, time);
    if (this.spikes) {
      const n = this.spikeCount;
      const s = this.opts.spikes!.size ?? 1;
      for (let i = 0; i < n; i++) {
        const d = r * 2 + (i / n) * (this.length * 0.85 - r * 2);
        this.spine.sample(d, this.a);
        this.spine.sample(d + 0.3, this.b);
        const t = d / this.length;
        const taper = Math.max(0.05, 1 - smoothstep(0.4, 1, t)) * (0.78 + 0.22 * smoothstep(0, r * 4, d));
        this.dummy.position.copy(this.a);
        this.dummy.position.y += r * 0.72 * taper;
        this.dummy.lookAt(this.b.x, this.dummy.position.y, this.b.z);
        this.dummy.rotateY(Math.PI);
        this.dummy.scale.setScalar(r * 1.3 * taper * s);
        this.dummy.updateMatrix();
        this.spikes.setMatrixAt(i, this.dummy.matrix);
      }
      this.spikes.instanceMatrix.needsUpdate = true;
    }
    // swallow bulges travel tailward
    for (let i = this.bulges.length - 1; i >= 0; i--) {
      this.bulges[i] += dt * (5 + r * 6);
      if (this.bulges[i] > this.length * 0.8) this.bulges.splice(i, 1);
    }
    this.u.uPulse.value += dt * 18;
    this.u.uFlash.value = damp(this.u.uFlash.value, 0, 6, dt);
  }

  sample(d: number, out: THREE.Vector3) {
    return this.spine.sample(d, out);
  }

  pulse() {
    this.u.uPulse.value = 0;
  }

  dispose() {
    this.body.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m !== this.body.mesh) m.geometry.dispose();
    });
    this.mat.dispose();
  }
}

// ============================================================ the player: Aeren
export interface InputState { turn: number; boost: boolean; }

export const ABILITY_INFO: Record<string, { name: string; color: string; dur: number; desc: string }> = {
  ember: { name: 'Ember Skin', color: '#ff7a2a', dur: 20, desc: 'Immune to fire and lava' },
  moon: { name: 'Moon Sight', color: '#9ad0ff', dur: 22, desc: 'See hidden things in the dark' },
  blood: { name: 'Blood Root', color: '#ff2a4a', dur: 16, desc: 'Regrow lost segments' },
  storm: { name: 'Storm Surge', color: '#ffe84a', dur: 14, desc: 'Move much faster' },
  void: { name: 'Void Phase', color: '#b06aff', dur: 9, desc: 'Phase through harm' },
};

export class Aeren {
  rig: SerpentRig;
  pos = new THREE.Vector3();
  heading = 0;
  fwd = new THREE.Vector3(0, 0, 1);
  segments = 6;
  targetSegments = 6;
  size = 1;
  targetSize = 1;
  speedMul = 1;
  stamina = 1;
  invuln = 0;
  abilities = new Map<string, number>();
  jawTarget = 0;
  alive = true;
  frozen = false;
  lastSafe = new THREE.Vector3();
  lastSafeHeading = 0;
  loopCooldown = 0;
  private lift = 0;
  private yVel = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private regenT = 0;
  private turnHold = 0;
  history: { x: number; z: number; h: number }[] = []; // for Astra's rewind
  private histT = 0;
  constructor() {
    this.rig = new SerpentRig({
      look: { color: '#141216', belly: 2.6, rune: '#ffc86a', runeIntensity: 1.3, iridescence: 0.6, eye: '#ffd27a', roughness: 0.85, rim: 0.5, rimColor: '#ffd9a8' },
      radius: 0.42,
      maxRings: 760,
      step: 0.22,
    });
  }

  get radius() { return 0.42 * this.size; }
  get spacing() { return 0.62 * this.size; }
  get length() { return Math.max(1.2, this.segments * this.spacing); }
  get speed() {
    const storm = this.abilities.has('storm') ? 1.5 : 1;
    return (8.2 + this.size * 1.6) * storm * this.speedMul;
  }

  place(p: THREE.Vector3, heading: number, world: World, segments?: number) {
    if (segments !== undefined) this.segments = this.targetSegments = segments;
    this.pos.copy(p);
    this.heading = heading;
    this.fwd.set(Math.sin(heading), 0, Math.cos(heading));
    this.pos.y = this.groundY(world, p.x, p.z);
    this.rig.radius = this.radius;
    this.rig.reset(this.pos, this.fwd, this.length + 4, (x, z) => this.groundY(world, x, z));
    this.lastSafe.copy(this.pos);
    this.lastSafeHeading = heading;
    this.alive = true;
    this.invuln = 1.5;
    this.history = [];
  }

  groundY(world: World, x: number, z: number) {
    let h = world.height(x, z);
    if (world.waterLevel > h) h = world.waterLevel - this.radius * 0.35;
    if (world.lavaLevel > h) h = world.lavaLevel;
    return h + this.radius * 0.8;
  }

  grow(n: number) {
    this.targetSegments += n;
    this.rig.bulges.push(this.radius * 2);
    this.rig.pulse();
  }

  /** Lose n segments; returns world positions where the lost matter scatters. */
  damage(n: number): THREE.Vector3[] {
    if (this.invuln > 0 || this.abilities.has('void')) return [];
    const drops: THREE.Vector3[] = [];
    const loseTo = Math.max(0, this.segments - n);
    for (let i = Math.floor(loseTo); i < Math.floor(this.segments); i++) {
      drops.push(this.rig.sample(i * this.spacing, new THREE.Vector3()).clone());
    }
    this.segments = loseTo;
    this.targetSegments = Math.min(this.targetSegments, loseTo);
    this.invuln = 1.1;
    this.rig.u.uFlash.value = 2.2;
    if (this.segments < 3) this.alive = false;
    return drops;
  }

  /** Sever the body at segment index (the part behind is lost). */
  cutAt(index: number): THREE.Vector3[] {
    if (this.invuln > 0 || this.abilities.has('void')) return [];
    const keep = Math.max(2, Math.floor(index));
    if (keep >= this.segments) return [];
    const drops: THREE.Vector3[] = [];
    for (let i = keep; i < Math.floor(this.segments); i++) drops.push(this.rig.sample(i * this.spacing, new THREE.Vector3()).clone());
    this.segments = keep;
    this.targetSegments = keep;
    this.invuln = 1.2;
    this.rig.u.uFlash.value = 2.5;
    if (this.segments < 3) this.alive = false;
    return drops;
  }

  giveAbility(id: string) {
    const info = ABILITY_INFO[id];
    if (!info) return;
    this.abilities.set(id, info.dur);
  }

  /** Returns the closed loop polygon if the head just touched its own body. */
  checkLoop(): { poly: { x: number; z: number }[]; index: number } | null {
    if (this.loopCooldown > 0) return null;
    const sp = this.spacing;
    const minIdx = Math.ceil((this.radius * 9) / sp);
    const n = Math.floor(this.segments);
    const thr = this.radius * 1.9;
    for (let i = minIdx; i < n; i++) {
      this.rig.sample(i * sp, this.tmp);
      const dx = this.tmp.x - this.pos.x, dz = this.tmp.z - this.pos.z;
      if (dx * dx + dz * dz < thr * thr) {
        const poly: { x: number; z: number }[] = [];
        for (let k = 0; k <= i; k++) {
          this.rig.sample(k * sp, this.tmp2);
          poly.push({ x: this.tmp2.x, z: this.tmp2.z });
        }
        this.loopCooldown = 0.9;
        return { poly, index: i };
      }
    }
    return null;
  }

  /** Distance from p to nearest body point (excluding neck). Returns [dist, segmentIndex]. */
  nearestBody(p: THREE.Vector3, fromIdx = 3): [number, number] {
    let best = Infinity, bi = -1;
    const sp = this.spacing;
    const n = Math.floor(this.segments);
    const stepI = this.segments > 80 ? 2 : 1;
    for (let i = fromIdx; i < n; i += stepI) {
      this.rig.sample(i * sp, this.tmp);
      const d = (this.tmp.x - p.x) ** 2 + (this.tmp.z - p.z) ** 2 + ((this.tmp.y - p.y) ** 2) * 0.3;
      if (d < best) { best = d; bi = i; }
    }
    return [Math.sqrt(best), bi];
  }

  tailTip(out: THREE.Vector3) {
    return this.rig.sample(this.length * 0.97, out);
  }

  update(dt: number, time: number, input: InputState, world: World) {
    // abilities tick
    for (const [k, v] of this.abilities) {
      const nv = v - dt;
      if (nv <= 0) this.abilities.delete(k);
      else this.abilities.set(k, nv);
    }
    if (this.abilities.has('blood')) {
      this.regenT += dt;
      if (this.regenT > 1.2) { this.regenT = 0; this.targetSegments += 1; }
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.loopCooldown = Math.max(0, this.loopCooldown - dt);

    // growth & size smoothing
    this.segments = damp(this.segments, this.targetSegments, 3, dt);
    this.size = damp(this.size, this.targetSize, 1.5, dt);
    this.rig.radius = this.radius;

    if (!this.frozen) {
      // holding a hard turn tightens the curl (and slows you a little) so you can close coils
      if (Math.abs(input.turn) > 0.75) this.turnHold += dt;
      else this.turnHold = Math.max(0, this.turnHold - dt * 3);
      const tight = clamp((this.turnHold - 0.25) / 0.35, 0, 1);
      const turnRate = (3.4 * (1 + 0.6 * tight)) / Math.max(1, Math.sqrt(this.size) * 0.9);
      this.heading -= input.turn * turnRate * dt;
      let sp = this.speed * (1 - 0.18 * tight);
      if (input.boost && this.stamina > 0.02) {
        sp *= 1.55;
        this.stamina = Math.max(0, this.stamina - dt * 0.33);
      } else this.stamina = Math.min(1, this.stamina + dt * 0.18);
      this.fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.pos.x += this.fwd.x * sp * dt;
      this.pos.z += this.fwd.z * sp * dt;

      // collide with props
      if (!this.abilities.has('void')) {
        for (const c of world.colliders) {
          const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
          const rr = c.r + this.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            this.pos.x = c.x + (dx / d) * rr;
            this.pos.z = c.z + (dz / d) * rr;
            // steer along the obstacle tangent
            const tangentA = Math.atan2(-dz, dx);
            const cand = [tangentA, tangentA + Math.PI];
            const best = Math.abs(angleDiff(this.heading, cand[0])) < Math.abs(angleDiff(this.heading, cand[1])) ? cand[0] : cand[1];
            this.heading += angleDiff(this.heading, best) * Math.min(1, dt * 6);
          }
        }
      }
      // arena bounds: steer back toward centre
      if (world.confine(this.pos) && world.def.terrain.kind !== 'fall') {
        const toC = Math.atan2(-this.pos.x, -this.pos.z);
        this.heading += angleDiff(this.heading, toC) * Math.min(1, dt * 3);
      }

      // vertical: follow ground, climb over own body
      const gy = this.groundY(world, this.pos.x, this.pos.z);
      const [bd] = this.segments > 12 ? this.nearestBody(this.pos, Math.ceil((this.radius * 6) / this.spacing)) : [99];
      const liftT = bd < this.radius * 2.4 ? (1 - bd / (this.radius * 2.4)) * this.radius * 1.7 : 0;
      this.lift = damp(this.lift, liftT, 12, dt);
      const stillFalling = this.yVel < -0.5 && this.pos.y < gy - 1.5;
      if (gy < -8 || stillFalling) {
        // falling into the abyss (once you are over the edge there is no climbing back)
        this.yVel -= 30 * dt;
        this.pos.y += this.yVel * dt;
      } else {
        this.yVel = 0;
        this.pos.y = damp(this.pos.y, gy + this.lift, 14, dt);
        if (!world.isVoid(this.pos.x, this.pos.z) && world.height(this.pos.x, this.pos.z) > world.lavaLevel + 0.2) {
          this.lastSafe.copy(this.pos);
          this.lastSafeHeading = this.heading;
        }
      }
      this.histT += dt;
      if (this.histT > 0.1) {
        this.histT = 0;
        this.history.push({ x: this.pos.x, z: this.pos.z, h: this.heading });
        if (this.history.length > 60) this.history.shift();
      }
    }

    this.rig.length = this.length;
    this.rig.spine.head.copy(this.pos);
    this.rig.jaw = this.jawTarget;
    // pitch the head a bit with terrain slope
    const ahead = this.tmp.copy(this.pos).addScaledVector(this.fwd, 1.2);
    const aheadY = this.groundY(world, ahead.x, ahead.z) + this.lift;
    const look = this.tmp2.set(this.fwd.x, clamp((aheadY - this.pos.y) / 1.2, -0.6, 0.6) * 0.8, this.fwd.z);
    this.rig.render(dt, time, look);
    // visual states
    const phase = this.abilities.has('void');
    this.rig.mat.transparent = phase;
    this.rig.mat.opacity = phase ? 0.45 : 1;
    const inv = this.invuln > 0 && !phase ? (Math.sin(time * 40) > 0 ? 1 : 0.35) : 1;
    this.rig.head.blinkEyes(inv);
    if (this.abilities.has('ember')) this.rig.mat.emissive.setRGB(0.25, 0.06, 0.0);
    else if (this.abilities.has('storm')) this.rig.mat.emissive.setRGB(0.12, 0.1, 0.0);
    else this.rig.mat.emissive.setRGB(0, 0, 0);
  }
}
