import * as THREE from 'three';
import type { BiomeDef } from './biomes';
import { createSky } from './sky';
import { buildProps, Collider, windUniforms, makeSkeleton } from './props';
import { AmbientParticles } from './particles';
import { causticsTexture, flowNoiseTexture, groundTextures, stoneTextures } from './textures';
import { fbm2, noise2, ridged2, smoothstep, clamp, lerp, TAU } from './util';
import type { Engine } from './engine';

export interface Reserved { x: number; z: number; r: number }

/** Island layout for the Gale arena (centre + ring of islands, joined by land bridges). */
export const ISLANDS = (() => {
  const list = [{ x: 0, z: 0, r: 30 }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    list.push({ x: Math.cos(a) * 62, z: Math.sin(a) * 62, r: 17 + (i % 2) * 4 });
  }
  return list;
})();

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** The winding road for The Fall. */
export const fallPathX = (z: number) => Math.sin(z * 0.011) * 38 + Math.sin(z * 0.029 + 1.3) * 12;
export const FALL_HALF_WIDTH = 24;
export const FALL_START_Z = -390;
export const FALL_END_Z = 390;

export function makeHeightFn(def: BiomeDef): (x: number, z: number) => number {
  const { kind, amp: A, radius: R } = def.terrain;
  const s = (def.terrain.seed ?? 1) * 7.31;
  const hills = (x: number, z: number) => fbm2(x * 0.011 + s, z * 0.011 - s, 5) * A + fbm2(x * 0.06 + s, z * 0.06, 3) * A * 0.12;
  const rim = (x: number, z: number, d: number, hgt = 30) => smoothstep(R - 8, R + 30, d) * (hgt + ridged2(x * 0.02 + s, z * 0.02, 4) * hgt * 0.9);
  const centerFlat = (d: number) => 0.25 + 0.75 * smoothstep(6, 34, d);

  switch (kind) {
    case 'islands':
      return (x, z) => {
        let land = -1;
        for (const is of ISLANDS) land = Math.max(land, 1 - Math.hypot(x - is.x, z - is.z) / is.r);
        for (let i = 1; i < ISLANDS.length; i++) {
          const b = ISLANDS[i];
          land = Math.max(land, 1 - segDist(x, z, 0, 0, b.x, b.z) / 4.2);
          const c = ISLANDS[i === ISLANDS.length - 1 ? 1 : i + 1];
          land = Math.max(land, 1 - segDist(x, z, b.x, b.z, c.x, c.z) / 3.4);
        }
        const n = fbm2(x * 0.05 + s, z * 0.05, 3);
        if (land > 0) return 1 + Math.min(land, 0.4) * 5 + n * 1.2;
        return lerp(1 + n, -90, smoothstep(0, 0.25, -land));
      };
    case 'fall':
      return (x, z) => {
        const cx = fallPathX(z);
        const d = Math.abs(x - cx);
        const base = fbm2(x * 0.03 + s, z * 0.03, 4) * A * 0.5;
        const endFade = smoothstep(FALL_END_Z - 10, FALL_END_Z + 40, z) + smoothstep(FALL_START_Z + 10, FALL_START_Z - 40, z);
        // broken shelves drop away into the abyss at the corridor edges
        const edge = smoothstep(FALL_HALF_WIDTH - 2, FALL_HALF_WIDTH + 10, d + noise2(z * 0.05, 3) * 6);
        return base - edge * 80 + endFade * 30;
      };
    case 'void':
    case 'astral':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const tiles = kind === 'astral' ? Math.round(fbm2(x * 0.03 + s, z * 0.03, 2) * 3) * 0.35 : fbm2(x * 0.04, z * 0.04, 3) * 0.8;
        return tiles * A - smoothstep(R - 4, R + 12, d) * 90;
      };
    case 'dream':
      return (x, z) => {
        const d = Math.hypot(x, z);
        return fbm2(x * 0.02 + s, z * 0.02, 4) * A * 1.2 - smoothstep(R - 12, R + 10, d) * 3 + smoothstep(R + 20, R + 60, d) * 25;
      };
    case 'city':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const h = hills(x, z) * 1.2;
        const q = Math.round(h / 1.6) * 1.6;
        return lerp(h, q, 0.85) * centerFlat(d) + rim(x, z, d, 36);
      };
    case 'volcano':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const ch = Math.abs(noise2(x * 0.022 + s, z * 0.022 - s));
        const channel = smoothstep(0.1, 0.0, ch) * 4.5 * smoothstep(16, 30, d);
        return hills(x, z) * centerFlat(d) + 1.2 - channel + rim(x, z, d, 40);
      };
    case 'mountain':
      return (x, z) => {
        const d = Math.hypot(x, z);
        return hills(x, z) * 0.6 * centerFlat(d) + ridged2(x * 0.015 + s, z * 0.015, 5) * A * 2.2 * smoothstep(55, 95, d) + rim(x, z, d, 55);
      };
    case 'cavern':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const pool = smoothstep(14, 0, Math.hypot(x + 40, z - 25)) * 5;
        return hills(x, z) * centerFlat(d) - pool + rim(x, z, d, 45);
      };
    case 'ruins':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const river = smoothstep(7, 0, Math.abs(z - 55 - Math.sin(x * 0.04) * 14)) * 4.5;
        return hills(x, z) * centerFlat(d) - river + rim(x, z, d);
      };
    case 'seabed':
      return (x, z) => {
        const d = Math.hypot(x, z);
        const dunes = Math.sin(x * 0.08 + fbm2(x * 0.02, z * 0.02, 2) * 4) * 0.8;
        return (hills(x, z) + dunes) * centerFlat(d) + rim(x, z, d, 40);
      };
    default:
      return (x, z) => {
        const d = Math.hypot(x, z);
        return hills(x, z) * centerFlat(d) + rim(x, z, d);
      };
  }
}

export class World {
  group = new THREE.Group();
  height: (x: number, z: number) => number;
  colliders: Collider[] = [];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  particles: AmbientParticles[] = [];
  water: THREE.Mesh | null = null;
  lava: THREE.Mesh | null = null;
  waterLevel = -999;
  lavaLevel = -999;
  radius: number;
  private sunDir: THREE.Vector3;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private terrainMat: THREE.MeshStandardMaterial;
  private causticUniforms = { uTime: { value: 0 }, uCaustic: { value: 0 }, uCausticTex: { value: null as THREE.Texture | null } };
  private surface: THREE.Mesh | null = null;
  private shafts: THREE.Mesh[] = [];
  extraUpdate: ((dt: number, t: number) => void)[] = [];

  constructor(public def: BiomeDef, private engine: Engine, reserved: Reserved[] = []) {
    const scene = engine.scene;
    this.radius = def.terrain.radius;
    this.height = makeHeightFn(def);

    // ---------- sky / fog / env
    this.sky = createSky(def.sky);
    this.group.add(this.sky);
    scene.fog = new THREE.FogExp2(new THREE.Color(def.fog.color), def.fog.density);
    scene.background = new THREE.Color(def.fog.color);
    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    const envScene = new THREE.Scene();
    const envSky = createSky(def.sky);
    envSky.scale.setScalar(0.1);
    envScene.add(envSky);
    this.envRT = pmrem.fromScene(envScene, 0.02);
    scene.environment = this.envRT.texture;
    (scene as any).environmentIntensity = def.env ?? 0.7;
    pmrem.dispose();

    // ---------- lights
    this.sunDir = new THREE.Vector3(...def.sun.dir).normalize();
    this.sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
    this.sun.castShadow = true;
    const sm = engine.q.shadow;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity);
    this.group.add(this.hemi);
    for (const l of def.lights ?? []) {
      const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
      pl.position.set(...l.pos);
      this.group.add(pl);
    }

    // ---------- terrain
    const kind = def.terrain.kind;
    const isFall = kind === 'fall';
    const W = isFall ? 260 : (this.radius + 70) * 2;
    const D = isFall ? 900 : W;
    const seg = isFall ? 130 : Math.min(260, Math.round(W / 1.4));
    const geo = new THREE.PlaneGeometry(W, D, seg, isFall ? 420 : seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(def.terrain.colors.low), cMid = new THREE.Color(def.terrain.colors.mid);
    const cHigh = new THREE.Color(def.terrain.colors.high), cSlope = new THREE.Color(def.terrain.colors.slope);
    const tmp = new THREE.Color();
    const A = def.terrain.amp;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (isFall ? fallPathX(pos.getZ(i)) * 0 : 0), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setXYZ(i, x, h, z);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
      const slope = 1 - nrm.getY(i);
      const t = clamp((h + A) / (A * 2.5), 0, 1);
      tmp.copy(cLow).lerp(cMid, smoothstep(0.1, 0.5, t)).lerp(cHigh, smoothstep(0.55, 1, t));
      tmp.lerp(cSlope, smoothstep(0.12, 0.45, slope));
      const n = fbm2(x * 0.08, z * 0.08, 3);
      tmp.multiplyScalar(0.85 + n * 0.3);
      if (def.water && h < def.water.level + 0.6) tmp.multiplyScalar(0.6);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const gt = groundTextures();
    const map = gt.map.clone(); map.repeat.set(W / 7, D / 7); map.needsUpdate = true;
    const nmap = gt.normalMap.clone(); nmap.repeat.set(W / 7, D / 7); nmap.needsUpdate = true;
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, map, normalMap: nmap, normalScale: new THREE.Vector2(1.1, 1.1) });
    if (def.underwater) {
      this.causticUniforms.uCaustic.value = 1;
      this.causticUniforms.uCausticTex.value = causticsTexture();
      this.terrainMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.causticUniforms);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uTime; uniform float uCaustic; uniform sampler2D uCausticTex;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float c1 = texture2D(uCausticTex, vWPos.xz*0.06 + vec2(uTime*0.03, uTime*0.02)).r;
            float c2 = texture2D(uCausticTex, vWPos.xz*0.045 - vec2(uTime*0.025, -uTime*0.018)).r;
            totalEmissiveRadiance += vec3(0.35,0.75,0.9) * min(c1,c2) * 2.2 * uCaustic;`);
      };
    }
    const terrain = new THREE.Mesh(geo, this.terrainMat);
    terrain.receiveShadow = true;
    terrain.castShadow = kind === 'islands' || kind === 'mountain';
    this.group.add(terrain);

    // island undersides
    if (kind === 'islands') {
      const rockMat = new THREE.MeshStandardMaterial({ color: '#5a4a3e', roughness: 0.95, normalMap: stoneTextures().normalMap });
      for (const is of ISLANDS) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(is.r * 1.05, is.r * 2.4, 16, 6), rockMat);
        const p = cone.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i);
          const n = noise2(v.x * 0.2 + is.x, v.y * 0.2 + v.z * 0.2) * is.r * 0.12;
          p.setXYZ(i, v.x + n, v.y, v.z + n);
        }
        cone.geometry.computeVertexNormals();
        cone.rotation.x = Math.PI;
        cone.position.set(is.x, 1 - is.r * 1.2, is.z);
        cone.castShadow = true;
        this.group.add(cone);
      }
    }

    // ---------- water & lava
    if (def.water) {
      this.waterLevel = def.water.level;
      const flow = flowNoiseTexture();
      const wn = flow.normal.clone(); wn.repeat.set(30, 30); wn.needsUpdate = true;
      const wm = new THREE.MeshPhysicalMaterial({ color: def.water.color, roughness: 0.04, metalness: 0.2, transparent: true, opacity: def.water.opacity ?? 0.85, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.4, clearcoat: 1 });
      // bake shoreline depth (0 at the shore .. 1 at >= 3 m deep) so the surface fades into the
      // bank with a foam line instead of cutting the terrain with a hard edge
      const DN = 256;
      const depth = new Uint8Array(DN * DN * 4);
      for (let j = 0; j < DN; j++)
        for (let i = 0; i < DN; i++) {
          const x = (i / (DN - 1) - 0.5) * W, z = (j / (DN - 1) - 0.5) * D;
          const d = clamp((def.water.level - this.height(x, z)) / 3, 0, 1);
          const k = (j * DN + i) * 4;
          depth[k] = Math.round(d * 255); depth[k + 3] = 255;
        }
      const depthTex = new THREE.DataTexture(depth, DN, DN, THREE.RGBAFormat);
      depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
      depthTex.needsUpdate = true;
      const wu = { uDepthTex: { value: depthTex }, uWorldSize: { value: new THREE.Vector2(W, D) }, uWTime: this.causticUniforms.uTime };
      wm.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, wu);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ; uniform sampler2D uDepthTex; uniform vec2 uWorldSize; uniform float uWTime; float wDepth;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            wDepth = texture2D(uDepthTex, vWXZ / uWorldSize + 0.5).r;
            diffuseColor.rgb *= mix(1.25, 0.55, smoothstep(0.0, 0.8, wDepth));
            diffuseColor.a *= mix(0.2, 1.0, smoothstep(0.0, 0.35, wDepth)) * smoothstep(0.0, 0.03, wDepth);
            {
              // thin, broken foam that laps at the bank (lit, not emissive, so bloom leaves it alone)
              float band = smoothstep(0.0, 0.015, wDepth) * (1.0 - smoothstep(0.02, 0.06, wDepth));
              float n1 = sin(vWXZ.x * 0.9 + uWTime * 0.7) * sin(vWXZ.y * 1.1 - uWTime * 0.5);
              float n2 = sin((vWXZ.x + vWXZ.y) * 2.3 + uWTime * 1.3);
              float lap = 0.5 + 0.5 * sin(wDepth * 160.0 - uWTime * 1.8);
              float foam = band * smoothstep(0.1, 0.8, n1 * 0.6 + n2 * 0.25 + lap * 0.5);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.8), foam * 0.55);
              diffuseColor.a = max(diffuseColor.a, foam * 0.45);
            }`,
          );
      };
      wm.customProgramCacheKey = () => 'water-shore';
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), wm);
      this.water.position.y = def.water.level;
      this.water.receiveShadow = true;
      this.group.add(this.water);
    }
    if (def.lava) {
      this.lavaLevel = def.lava.level;
      const flow = flowNoiseTexture();
      const lt = flow.lava.clone(); lt.repeat.set(18, 18); lt.needsUpdate = true;
      const lm = new THREE.MeshStandardMaterial({ color: '#200400', emissive: '#ffffff', emissiveMap: lt, emissiveIntensity: 2.6, roughness: 0.55 });
      this.lava = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), lm);
      this.lava.position.y = def.lava.level;
      this.group.add(this.lava);
    }

    // ---------- underwater surface & light shafts
    if (def.underwater) {
      const ct = causticsTexture().clone(); ct.repeat.set(20, 20); ct.needsUpdate = true;
      this.surface = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 2, W * 2).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ad0ff').multiplyScalar(1.6), map: ct, transparent: true, opacity: 0.55, fog: true, side: THREE.DoubleSide }),
      );
      this.surface.position.y = 38;
      this.group.add(this.surface);
      this.addShafts('#7ad8ff', 14, 0.07);
    }

    // ---------- cavern dome
    if (def.cavern) {
      const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(this.radius * 1.35, 5), new THREE.MeshStandardMaterial({ color: '#1e1a16', roughness: 1, side: THREE.BackSide, normalMap: stoneTextures().normalMap }));
      const p = dome.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const n = ridged2(v.x * 0.03, v.z * 0.03 + v.y * 0.02, 4);
        v.multiplyScalar(1 - n * 0.25);
        v.y = v.y * 0.42;
        // opening to the sky above centre
        if (v.y > 0 && Math.hypot(v.x, v.z) < 16) v.y += 30;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      dome.geometry.computeVertexNormals();
      dome.position.y = -6;
      this.group.add(dome);
      this.addShafts('#bcd8ff', 5, 0.12, 14);
      // the great spiralling skeleton wrapped around the cavern
      const spiral = makeSkeleton(99, 1.4, { spiral: true, headless: true });
      this.group.add(spiral);
    }

    // ---------- props
    const reservedAll = [...reserved, { x: 0, z: 0, r: 7 }];
    const props = buildProps(def.props, {
      height: this.height,
      radius: isFall ? 400 : this.radius,
      seed: def.terrain.seed ?? 1,
      quality: { grass: engine.q.grass },
      accept: (x, z, k) => {
        for (const r of reservedAll) if ((x - r.x) ** 2 + (z - r.z) ** 2 < r.r * r.r) return false;
        const h = this.height(x, z);
        if (k === 'floatRock') return true;
        if (h < -15) return false;
        if (def.water && h < def.water.level + 0.2 && !['kelp', 'coral', 'mirror'].includes(k)) return false;
        if (def.lava && h < def.lava.level + 0.6) return false;
        if (isFall && Math.abs(x - fallPathX(z)) > FALL_HALF_WIDTH + 12) return false;
        if (isFall && (k === 'deadTree' || k === 'tower' || k === 'pillar' || k === 'rock') && Math.abs(x - fallPathX(z)) < 8) return false;
        return Math.hypot(x, z) < this.radius + 28;
      },
    });
    this.group.add(props.group);
    this.colliders = props.colliders;
    for (const lp of props.lights) {
      const pl = new THREE.PointLight('#ffae5a', 18, 22, 2);
      pl.position.copy(lp);
      this.group.add(pl);
    }

    // ---------- ambient particles
    for (const ps of def.particles) {
      const ap = new AmbientParticles(ps, engine.q.particles);
      this.particles.push(ap);
      this.group.add(ap.points);
    }

    scene.add(this.group);
    engine.setGrade({ saturation: 0, contrast: 0.1, brightness: 0, hue: 0, vignette: 0.6, bloom: 1, exposure: 1, ...def.grade });
  }

  private addShafts(color: string, n: number, opacity: number, spread = 70) {
    for (let i = 0; i < n; i++) {
      const h = 70;
      const g = new THREE.CylinderGeometry(1.5 + Math.random() * 2, 5 + Math.random() * 5, h, 20, 1, true);
      const m = new THREE.Mesh(g, shaftMaterial(color, opacity));
      const a = Math.random() * TAU, d = i === 0 ? 0 : Math.random() * spread;
      m.position.set(Math.cos(a) * d, h / 2 - 4, Math.sin(a) * d);
      m.rotation.z = (Math.random() - 0.5) * 0.25;
      m.rotation.x = (Math.random() - 0.5) * 0.25;
      this.shafts.push(m);
      this.group.add(m);
    }
  }

  /** Keep a position inside the playable area. Returns true if it was pushed. */
  confine(p: THREE.Vector3): boolean {
    if (this.def.terrain.kind === 'fall') {
      const cx = fallPathX(p.z);
      const lim = FALL_HALF_WIDTH + 6;
      let pushed = false;
      if (p.x > cx + lim) { p.x = cx + lim; pushed = true; }
      if (p.x < cx - lim) { p.x = cx - lim; pushed = true; }
      if (p.z < FALL_START_Z) { p.z = FALL_START_Z; pushed = true; }
      if (p.z > FALL_END_Z + 10) { p.z = FALL_END_Z + 10; pushed = true; }
      return pushed;
    }
    const d = Math.hypot(p.x, p.z);
    const lim = this.radius - 3;
    if (d > lim) {
      p.x *= lim / d;
      p.z *= lim / d;
      return true;
    }
    return false;
  }

  isVoid(x: number, z: number) {
    return this.height(x, z) < -12;
  }

  update(dt: number, t: number, focus: THREE.Vector3, cam: THREE.Camera) {
    windUniforms.uTime.value = t;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    this.sky.position.copy(cam.position);
    // shadow camera follows focus, snapped to texel grid to avoid shimmering
    const texel = 110 / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 120, focus.y + this.sunDir.y * 120, fz + this.sunDir.z * 120);
    for (const p of this.particles) p.update(t, cam.position);
    if (this.water) {
      const m = this.water.material as THREE.MeshPhysicalMaterial;
      m.normalMap!.offset.set(t * 0.008, t * 0.005);
    }
    if (this.lava) {
      const m = this.lava.material as THREE.MeshStandardMaterial;
      m.emissiveMap!.offset.set(t * 0.004, t * 0.0025);
      m.emissiveIntensity = 2.4 + Math.sin(t * 1.3) * 0.4;
    }
    if (this.surface) {
      const m = this.surface.material as THREE.MeshBasicMaterial;
      m.map!.offset.set(t * 0.01, t * 0.007);
      this.surface.position.x = cam.position.x;
      this.surface.position.z = cam.position.z;
    }
    this.causticUniforms.uTime.value = t;
    this.shafts.forEach((s, i) => ((s.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (0.05 + 0.04 * Math.sin(t * 0.5 + i)) * (this.def.cavern ? 1.8 : 1) * 2.2));
    for (const f of this.extraUpdate) f(dt, t);
  }

  dispose() {
    this.engine.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as any).material;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x: THREE.Material) => x.dispose());
    });
    this.envRT?.dispose();
    this.engine.scene.environment = null;
  }
}

/**
 * Soft volumetric light shaft: fades toward the base, softens at grazing
 * angles (so the cylinder silhouette disappears) and fades out when the camera
 * gets close, so it never washes the whole screen.
 */
export function shaftMaterial(color: string | THREE.Color, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        float facing = abs(dot(normalize(vN), toCam / dist));
        float soft = facing * facing;
        float vert = smoothstep(0.0, 0.75, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y) * 0.5);
        float near = smoothstep(4.0, 18.0, dist);
        float a = uOpacity * soft * vert * near;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
