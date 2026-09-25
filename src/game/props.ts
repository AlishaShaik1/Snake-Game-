import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropSpec } from './biomes';
import { noise2, rng, randIn, TAU } from './util';
import { stoneTextures } from './textures';

export interface Collider { x: number; z: number; r: number }

// ---------------------------------------------------------------- shared wind uniform
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function addWind(mat: THREE.MeshStandardMaterial, strength: number, heightPow = 2) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        #else
          vec4 wp = modelMatrix * vec4(0.0,0.0,0.0,1.0);
        #endif
        float hgt = max(transformed.y, 0.0);
        float k = pow(hgt, ${heightPow.toFixed(1)}) * ${strength.toFixed(4)} * uWind;
        float ph = uTime*1.6 + wp.x*0.21 + wp.z*0.17;
        transformed.x += (sin(ph) + 0.4*sin(ph*2.3+1.0)) * k;
        transformed.z += (cos(ph*0.8) * 0.6) * k;`,
      );
  };
  mat.customProgramCacheKey = () => 'wind' + strength + heightPow;
}

// ---------------------------------------------------------------- stylised foliage shading
/** Canopy gets a bottom-to-top gradient (self-shadowing) and a soft back-lit rim. */
function addFoliage(mat: THREE.MeshStandardMaterial, y0: number, y1: number) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFolY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFolY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFolY;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.42, 1.18, smoothstep(${y0.toFixed(1)}, ${y1.toFixed(1)}, vFolY));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += diffuseColor.rgb * pow(fr, 3.0) * 0.35;
        }`,
      );
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|fol';
}

// ---------------------------------------------------------------- camera occlusion fade
/**
 * Props that stand between the camera and Aeren (or swallow the camera during
 * a cinematic) dissolve with a screen-door dither instead of blocking the view.
 * Evaluated per instance so whole trees / walls fade, not a hole.
 */
export const occlusionUniforms = {
  uOccCam: { value: new THREE.Vector3() },
  uOccTarget: { value: new THREE.Vector3() },
  uOccOn: { value: 1 },
};
const occPatched = new WeakSet<THREE.Material>();
function applyOcclusion(mat: THREE.Material, radius: number) {
  if (occPatched.has(mat)) return;
  occPatched.add(mat);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uOccCam = occlusionUniforms.uOccCam;
    shader.uniforms.uOccTarget = occlusionUniforms.uOccTarget;
    shader.uniforms.uOccOn = occlusionUniforms.uOccOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uOccCam; uniform vec3 uOccTarget; uniform float uOccOn; varying float vOcc;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          #ifdef USE_INSTANCING
            mat4 om = modelMatrix * instanceMatrix;
          #else
            mat4 om = modelMatrix;
          #endif
          vec3 c = om[3].xyz;
          float sc = length(om[0].xyz);
          float R = ${radius.toFixed(2)} * sc;
          vec2 a = uOccCam.xz, b = uOccTarget.xz, pc = c.xz;
          vec2 ab = b - a;
          float L2 = max(dot(ab, ab), 1e-4);
          float t = clamp(dot(pc - a, ab) / L2, 0.0, 1.0);
          float dSeg = distance(pc, a + ab * t);
          float between = (1.0 - smoothstep(R * 0.7, R * 0.7 + 2.5, dSeg)) * step(t, 0.9) * step(0.001, t) * step(1.0, L2);
          // camera inside / right against the prop (cinematics) - only if the camera is below its top
          float top = c.y + R * 4.0;
          float inside = (1.0 - smoothstep(R, R + 3.0, distance(pc, a))) * step(uOccCam.y, top);
          inside = max(inside, 1.0 - smoothstep(R * 1.3, R * 1.3 + 4.0, distance(c + vec3(0.0, R, 0.0), uOccCam)));
          vOcc = clamp(max(between, inside), 0.0, 1.0) * uOccOn;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOcc;')
      .replace(
        'void main() {',
        `void main() {
        if (vOcc > 0.01) {
          float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (dn < vOcc * 0.88) discard;
        }`,
      );
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|occ' + radius;
}
const OCC_RADIUS: Record<string, number> = {
  tree: 3.2, deadTree: 1.6, rock: 1.6, pillar: 1.3, tower: 3.4, ruinWall: 3.2, spire: 1.8, obelisk: 1.3,
  floatRock: 1.8, mirror: 1.4, arch: 3, crystal: 0.9, coral: 1.4, kelp: 0.8, mushroom: 1.4, root: 2,
};

// ---------------------------------------------------------------- geometry helpers
function cyl(r0: number, r1: number, h: number, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  return g;
}

function orientTo(g: THREE.BufferGeometry, from: THREE.Vector3, dir: THREE.Vector3) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate(from.x, from.y, from.z);
  return g;
}

function displace(g: THREE.BufferGeometry, amt: number, freq: number, seed: number) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise2(v.x * freq + seed, v.z * freq + v.y * freq * 0.7 - seed) * 0.7 + noise2(v.y * freq * 2 + seed * 3, v.x * freq * 2) * 0.3;
    v.addScaledVector(v.clone().normalize(), n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function nonIndexed(gs: THREE.BufferGeometry[]) {
  return gs.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    // keep only position/normal/uv for merge compatibility
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  });
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(nonIndexed(gs), false)!;

function deadTreeGeo(r: () => number, opts: { depth?: number; len?: number } = {}) {
  const parts: THREE.BufferGeometry[] = [];
  const branch = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const g = cyl(rad, rad * 0.62, len, depth > 1 ? 7 : 5);
    parts.push(orientTo(g, from, dir));
    const end = from.clone().addScaledVector(dir.clone().normalize(), len);
    if (depth <= 0) return;
    const n = depth > 2 ? 2 : 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().normalize();
      nd.x += (r() - 0.5) * 1.6;
      nd.z += (r() - 0.5) * 1.6;
      nd.y += 0.1 + r() * 0.3;
      branch(end, nd.normalize(), len * (0.55 + r() * 0.2), rad * 0.6, depth - 1);
    }
  };
  branch(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3), opts.len ?? 4 + r() * 2, 0.34, opts.depth ?? 3);
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + r();
    parts.push(orientTo(cyl(0.22, 0.04, 1.8, 5), new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(Math.cos(a), -0.45, Math.sin(a))));
  }
  return merge(parts);
}

function canopyGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const blobs = 5 + Math.floor(r() * 3);
  const center = new THREE.Vector3(0, 6.8, 0);
  for (let i = 0; i < blobs; i++) {
    // indexed sphere -> smooth normals after displacement (no faceting)
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1.6 + r() * 1.1, 3);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    displace(g, 0.5, 1.1, r() * 50);
    g.translate((r() - 0.5) * 3, 5.5 + r() * 2.5, (r() - 0.5) * 3);
    parts.push(g);
  }
  const m = merge(parts);
  // bend normals toward the canopy's centre-out direction: the whole crown shades
  // as one soft volume (stylised foliage lighting) instead of a pile of balls
  const p = m.attributes.position as THREE.BufferAttribute;
  const n = m.attributes.normal as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    a.fromBufferAttribute(p, i).sub(center).normalize();
    b.fromBufferAttribute(n, i).lerp(a, 0.65).normalize();
    n.setXYZ(i, b.x, b.y, b.z);
  }
  return m;
}

function rockGeo(r: () => number) {
  const g = displace(new THREE.IcosahedronGeometry(1, 3), 0.35, 1.3, r() * 100);
  g.scale(1 + r() * 0.5, 0.55 + r() * 0.4, 1 + r() * 0.5);
  return g;
}

function pillarGeo(r: () => number) {
  const h = 5 + r() * 5;
  const parts = [
    cyl(0.85, 0.8, h, 12),
    new THREE.BoxGeometry(2.2, 0.6, 2.2).translate(0, 0.3, 0),
  ];
  if (r() > 0.35) parts.push(new THREE.BoxGeometry(2, 0.5, 2).translate(0, h + 0.25, 0));
  // fluting
  const g = merge(parts);
  return g;
}

function archGeo() {
  const parts = [
    cyl(0.8, 0.75, 8, 10).translate(-4, 0, 0),
    cyl(0.8, 0.75, 8, 10).translate(4, 0, 0),
    new THREE.TorusGeometry(4, 0.7, 8, 20, Math.PI).translate(0, 8, 0),
  ];
  return merge(parts);
}

function wallGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const cols = 6, rows = 4;
  for (let x = 0; x < cols; x++) {
    const hRows = rows - Math.floor(r() * r() * rows);
    for (let y = 0; y < hRows; y++) {
      if (y > 0 && r() < 0.08) continue;
      parts.push(new THREE.BoxGeometry(1.15, 0.95, 0.9).translate((x - cols / 2) * 1.2 + (y % 2) * 0.3, y * 1 + 0.5, (r() - 0.5) * 0.1));
    }
  }
  return merge(parts);
}

function towerGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  let y = 0, w = 4 + r() * 2;
  const tiers = 2 + Math.floor(r() * 3);
  for (let i = 0; i < tiers; i++) {
    const h = 5 + r() * 5;
    parts.push(new THREE.BoxGeometry(w, h, w).translate(0, y + h / 2, 0));
    y += h;
    w *= 0.75;
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    parts.push(new THREE.BoxGeometry(0.8, 1.2, 0.8).translate(Math.cos(a) * w * 0.55, y + 0.6, Math.sin(a) * w * 0.55));
  }
  if (r() > 0.5) parts.push(new THREE.ConeGeometry(w * 0.8, 4, 4).rotateY(Math.PI / 4).translate(0, y + 2, 0));
  return merge(parts);
}

function crystalGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.OctahedronGeometry(0.5, 0).scale(0.45, 2 + r() * 1.5, 0.45);
    g.rotateZ((r() - 0.5) * 0.9);
    g.rotateX((r() - 0.5) * 0.9);
    g.translate((r() - 0.5) * 0.8, 0.6, (r() - 0.5) * 0.8);
    parts.push(g);
  }
  return merge(parts);
}

function boneGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1.5, 0, 0), new THREE.Vector3(0, 1.4 + r(), 0), new THREE.Vector3(1.5, 0, 0));
  parts.push(new THREE.TubeGeometry(curve, 10, 0.1, 5, false));
  parts.push(new THREE.SphereGeometry(0.3, 7, 5).translate(0, 0.1, 0));
  return merge(parts);
}

function coralGeo(r: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const dir = new THREE.Vector3((r() - 0.5) * 1.2, 1, (r() - 0.5) * 1.2);
    parts.push(orientTo(cyl(0.12, 0.05, 1.2 + r() * 1.3, 5), new THREE.Vector3(), dir));
    const tip = dir.normalize().multiplyScalar(1.4);
    parts.push(new THREE.SphereGeometry(0.14, 6, 4).translate(tip.x, tip.y, tip.z));
  }
  return merge(parts);
}

function kelpGeo(r: () => number) {
  const g = new THREE.PlaneGeometry(0.5, 6, 1, 12);
  g.translate(0, 3, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * (1 - y / 7) + Math.sin(y * 0.8) * 0.3);
  }
  g.computeVertexNormals();
  const g2 = g.clone().rotateY(Math.PI / 2);
  return merge([g, g2]);
}

function grassGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 3; b++) {
    const g = new THREE.PlaneGeometry(0.09, 0.8, 1, 3);
    g.translate(0, 0.4, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setX(i, p.getX(i) * (1 - y / 0.85));
      p.setZ(i, y * y * 0.25);
    }
    g.rotateY((b / 3) * TAU + 0.3);
    g.translate((b - 1) * 0.08, 0, ((b * 7) % 3 - 1) * 0.06);
    parts.push(g);
  }
  const m = merge(parts);
  // vertex colour gradient base->tip
  const pos = m.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, pos.getY(i) / 0.8);
    const v = 0.35 + t * 0.85;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  m.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return m;
}

function floatRockGeo(r: () => number) {
  const top = displace(new THREE.CylinderGeometry(1.4, 1.2, 0.6, 9, 1), 0.2, 1.5, r() * 10);
  const bottom = displace(new THREE.ConeGeometry(1.2, 2.6, 9, 3).rotateX(Math.PI).translate(0, -1.6, 0), 0.25, 1.4, r() * 10);
  return merge([top, bottom]);
}

function spireGeo(r: () => number) {
  const g = displace(new THREE.ConeGeometry(1.4, 9 + r() * 6, 8, 6).translate(0, 5, 0), 0.4, 0.8, r() * 10);
  return g;
}

function obeliskGeo() {
  const g = new THREE.CylinderGeometry(0.45, 0.8, 9, 4, 1).rotateY(Math.PI / 4).translate(0, 4.5, 0);
  const cap = new THREE.ConeGeometry(0.5, 1.2, 4).rotateY(Math.PI / 4).translate(0, 9.6, 0);
  return merge([g, cap]);
}
function obeliskRuneGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.BoxGeometry(0.12, 6.5, 0.05).translate(0, 4.2, 0.62);
    s.rotateY((i / 4) * TAU);
    parts.push(s);
  }
  return merge(parts);
}

function mushroomParts(r: () => number) {
  const h = 0.6 + r() * 0.8;
  const stem = cyl(0.12, 0.08, h, 6);
  const cap = new THREE.SphereGeometry(0.45, 10, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, h, 0);
  return { stem, cap };
}

function mirrorParts() {
  const frame = merge([
    new THREE.BoxGeometry(2.4, 0.2, 0.2).translate(0, 3.6, 0),
    new THREE.BoxGeometry(2.4, 0.2, 0.2).translate(0, 0, 0),
    new THREE.BoxGeometry(0.2, 3.8, 0.2).translate(-1.2, 1.8, 0),
    new THREE.BoxGeometry(0.2, 3.8, 0.2).translate(1.2, 1.8, 0),
  ]);
  const glass = new THREE.PlaneGeometry(2.2, 3.4).translate(0, 1.8, 0);
  const glass2 = glass.clone().rotateY(Math.PI);
  return { frame, glass: merge([glass, glass2]) };
}

function lanternParts() {
  const pole = merge([cyl(0.08, 0.06, 3.2, 5), new THREE.BoxGeometry(0.9, 0.08, 0.08).translate(0.4, 3.1, 0)]);
  const light = new THREE.OctahedronGeometry(0.28, 0).scale(1, 1.4, 1).translate(0.8, 2.75, 0);
  return { pole, light };
}

function bannerParts() {
  const pole = cyl(0.08, 0.06, 7, 5);
  const cloth = new THREE.PlaneGeometry(1.4, 3.6, 1, 8).translate(0.75, 4.8, 0);
  return { pole, cloth };
}

// ---------------------------------------------------------------- giant serpent skeleton
const boneMat = () =>
  new THREE.MeshStandardMaterial({ color: '#cdbfa6', roughness: 0.85, metalness: 0, map: stoneTextures().map, normalMap: stoneTextures().normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });

export function makeSkeleton(seed: number, scale = 1, opts: { spiral?: boolean; headless?: boolean; length?: number } = {}) {
  const r = rng(seed);
  const pts: THREE.Vector3[] = [];
  const len = opts.length ?? 70;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (opts.spiral) {
      const a = t * TAU * 1.6;
      pts.push(new THREE.Vector3(Math.cos(a) * (38 - t * 8), 2 + t * 26 + Math.sin(a * 2) * 2, Math.sin(a) * (38 - t * 8)));
    } else {
      pts.push(new THREE.Vector3((t - 0.5) * len, Math.max(0.5, Math.sin(t * Math.PI * 2 + r() * 2) * 4 + 2.5), Math.sin(t * Math.PI * 1.5 + r() * 3) * len * 0.22));
    }
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts: THREE.BufferGeometry[] = [];
  const count = opts.spiral ? 90 : 46;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const sizeK = Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.85 + 0.25) * (1 - t * 0.5);
    const vr = 0.9 * sizeK + 0.2;
    // vertebra
    const v = new THREE.SphereGeometry(vr, 8, 6).scale(1, 0.8, 1.3);
    v.lookAt(tan);
    v.translate(p.x, p.y, p.z);
    parts.push(v);
    const spike = new THREE.ConeGeometry(vr * 0.35, vr * 1.6, 5).translate(p.x, p.y + vr * 1.2, p.z);
    parts.push(spike);
    // ribs
    if (i % 1 === 0 && t < 0.85) {
      const ribLen = 5.2 * sizeK + 0.8;
      for (const s of [-1, 1]) {
        const a = p.clone();
        const b = p.clone().addScaledVector(side, s * ribLen * 0.8).add(new THREE.Vector3(0, ribLen * 0.2, 0));
        const c = p.clone().addScaledVector(side, s * ribLen * 0.9).add(new THREE.Vector3(0, -p.y - 0.3, 0)).addScaledVector(tan, -ribLen * 0.2);
        const rib = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, c), 8, 0.16 * sizeK + 0.06, 5, false);
        parts.push(rib);
      }
    }
  }
  if (!opts.headless) {
    const p = curve.getPointAt(0);
    const skull = displace(new THREE.SphereGeometry(2.4, 14, 10).scale(1, 0.6, 1.8), 0.3, 1, seed);
    const tan = curve.getTangentAt(0);
    skull.lookAt(tan.clone().negate());
    skull.translate(p.x, p.y, p.z);
    parts.push(skull);
  }
  const geo = merge(parts);
  const mesh = new THREE.Mesh(geo, boneMat());
  mesh.scale.setScalar(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- placement
export interface PropContext {
  height: (x: number, z: number) => number;
  accept: (x: number, z: number, kind: string) => boolean;
  radius: number;
  quality: { grass: number };
  seed: number;
}

export function buildProps(specs: PropSpec[], ctx: PropContext) {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const lights: THREE.Vector3[] = [];
  const r = rng(ctx.seed * 97 + 13);
  const stone = stoneTextures();
  const dummy = new THREE.Object3D();

  for (const spec of specs) {
    let count = spec.count;
    if (spec.kind === 'grass') count = Math.floor(count * ctx.quality.grass);
    if (count <= 0) continue;

    // ---- giant skeletons: unique meshes
    if (spec.kind === 'skeleton') {
      for (let i = 0; i < count; i++) {
        const p = samplePos(spec, ctx, r);
        if (!p) continue;
        const sk = makeSkeleton(Math.floor(r() * 1e6), randIn(r, spec.scale[0], spec.scale[1]), { headless: ctx.seed === 3 });
        sk.position.set(p.x, ctx.height(p.x, p.z) - 1.2, p.z);
        sk.rotation.y = r() * TAU;
        group.add(sk);
      }
      continue;
    }

    const color = new THREE.Color(spec.color ?? '#888888');
    const emissive = spec.emissive ? new THREE.Color(spec.emissive) : null;
    type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; shadow: boolean };
    const variants: Part[][] = [];
    const nVar = ['grass', 'kelp', 'arch', 'obelisk', 'mirror', 'lantern', 'banner'].includes(spec.kind) ? 1 : 3;
    const stoneMat = () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, map: stone.map, normalMap: stone.normalMap });
    for (let v = 0; v < nVar; v++) {
      switch (spec.kind) {
        case 'deadTree': {
          variants.push([{ geo: deadTreeGeo(r), mat: new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), shadow: true }]);
          break;
        }
        case 'tree': {
          // shorter, shallower trunk so no bare branch pokes out of the crown
          const trunk = deadTreeGeo(r, { depth: 2, len: 3.6 + r() * 1.2 });
          const leafMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: false });
          addWind(leafMat, 0.012, 1.2);
          addFoliage(leafMat, 4, 9.8);
          variants.push([
            { geo: trunk, mat: new THREE.MeshStandardMaterial({ color: '#2a1e16', roughness: 0.95 }), shadow: true },
            { geo: canopyGeo(r), mat: leafMat, shadow: true },
          ]);
          break;
        }
        case 'rock':
          variants.push([{ geo: rockGeo(r), mat: new THREE.MeshStandardMaterial({ color, roughness: 0.92, normalMap: stone.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }), shadow: true }]);
          break;
        case 'pillar':
          variants.push([{ geo: pillarGeo(r), mat: stoneMat(), shadow: true }]);
          break;
        case 'arch':
          variants.push([{ geo: archGeo(), mat: stoneMat(), shadow: true }]);
          break;
        case 'ruinWall':
          variants.push([{ geo: wallGeo(r), mat: stoneMat(), shadow: true }]);
          break;
        case 'tower':
          variants.push([{ geo: towerGeo(r), mat: stoneMat(), shadow: true }]);
          break;
        case 'spire':
          variants.push([{ geo: spireGeo(r), mat: new THREE.MeshStandardMaterial({ color, roughness: 0.9, normalMap: stone.normalMap }), shadow: true }]);
          break;
        case 'crystal':
          variants.push([{
            geo: crystalGeo(r),
            mat: new THREE.MeshPhysicalMaterial({ color: emissive ?? color, emissive: emissive ?? color, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.92 }),
            shadow: false,
          }]);
          break;
        case 'bones':
          variants.push([{ geo: boneGeo(r), mat: boneMat(), shadow: true }]);
          break;
        case 'coral': {
          const m = new THREE.MeshStandardMaterial({ color: emissive ?? color, emissive: emissive ?? color, emissiveIntensity: 0.9, roughness: 0.6 });
          addWind(m, 0.05, 1);
          variants.push([{ geo: coralGeo(r), mat: m, shadow: false }]);
          break;
        }
        case 'kelp': {
          const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide });
          addWind(m, 0.04, 1.3);
          variants.push([{ geo: kelpGeo(r), mat: m, shadow: false }]);
          break;
        }
        case 'grass': {
          const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, vertexColors: true });
          addWind(m, 0.35, 2);
          variants.push([{ geo: grassGeo(), mat: m, shadow: false }]);
          break;
        }
        case 'floatRock':
          variants.push([{ geo: floatRockGeo(r), mat: new THREE.MeshStandardMaterial({ color, roughness: 0.9, normalMap: stone.normalMap }), shadow: true }]);
          break;
        case 'obelisk':
          variants.push([
            { geo: obeliskGeo(), mat: stoneMat(), shadow: true },
            { geo: obeliskRuneGeo(), mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.emissive ?? '#ffcc88').multiplyScalar(3) }), shadow: false },
          ]);
          break;
        case 'mushroom': {
          const mp = mushroomParts(r);
          variants.push([
            { geo: mp.stem, mat: new THREE.MeshStandardMaterial({ color: '#c8d8e8', roughness: 0.6, emissive: emissive ?? color, emissiveIntensity: 0.15 }), shadow: false },
            { geo: mp.cap, mat: new THREE.MeshStandardMaterial({ color: emissive ?? color, emissive: emissive ?? color, emissiveIntensity: 1.6, roughness: 0.4 }), shadow: false },
          ]);
          break;
        }
        case 'mirror': {
          const mp = mirrorParts();
          variants.push([
            { geo: mp.frame, mat: new THREE.MeshStandardMaterial({ color: '#c8a060', metalness: 1, roughness: 0.3 }), shadow: true },
            { geo: mp.glass, mat: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.02, envMapIntensity: 1.6 }), shadow: false },
          ]);
          break;
        }
        case 'lantern': {
          const lp = lanternParts();
          variants.push([
            { geo: lp.pole, mat: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.7, metalness: 0.4 }), shadow: true },
            { geo: lp.light, mat: new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.emissive ?? '#ffae4a').multiplyScalar(4) }), shadow: false },
          ]);
          break;
        }
        case 'banner': {
          const bp = bannerParts();
          const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
          addWind(cm, 0.03, 1.5);
          variants.push([
            { geo: bp.pole, mat: new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.8 }), shadow: true },
            { geo: bp.cloth, mat: cm, shadow: true },
          ]);
          break;
        }
      }
    }

    // instance transforms
    const perVar: THREE.Matrix4[][] = variants.map(() => []);
    const colVar: THREE.Color[][] = variants.map(() => []);
    for (let i = 0; i < count; i++) {
      const p = samplePos(spec, ctx, r);
      if (!p) continue;
      const s = randIn(r, spec.scale[0], spec.scale[1]);
      let y = ctx.height(p.x, p.z) - (spec.ySink ?? 0);
      if (spec.kind === 'floatRock') y += 6 + r() * 26;
      if (spec.kind === 'mirror') y += 0.5 + r() * 3;
      if (spec.kind === 'rock') y -= s * 0.25;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0, r() * TAU, 0);
      if (spec.kind === 'mirror') dummy.rotation.z = (r() - 0.5) * 0.4;
      if (spec.kind === 'floatRock') dummy.rotation.x = (r() - 0.5) * 0.3;
      dummy.scale.setScalar(s);
      if (spec.kind === 'grass') dummy.scale.set(s, s * (0.8 + r() * 0.6), s);
      dummy.updateMatrix();
      const vi = Math.floor(r() * variants.length);
      perVar[vi].push(dummy.matrix.clone());
      const cv = 0.8 + r() * 0.4;
      colVar[vi].push(new THREE.Color(cv, cv, cv));
      if (spec.collide) {
        const base = { rock: 1.1, pillar: 1.1, tower: 2.6, ruinWall: 1.8, deadTree: 0.5, tree: 0.6, spire: 1.4, obelisk: 0.9 }[spec.kind as string] ?? 1;
        colliders.push({ x: p.x, z: p.z, r: base * s });
        if (spec.kind === 'ruinWall') {
          // walls are long: add extra colliders along the length
          const ang = dummy.rotation.y;
          for (const off of [-2.4, 2.4]) colliders.push({ x: p.x + Math.cos(ang) * off * s, z: p.z - Math.sin(ang) * off * s, r: 1.2 * s });
        }
      }
      if (spec.kind === 'lantern' && lights.length < 6) lights.push(new THREE.Vector3(p.x, y + 2.8, p.z));
    }
    variants.forEach((parts, vi) => {
      const mats = perVar[vi];
      if (!mats.length) return;
      for (const part of parts) {
        if (OCC_RADIUS[spec.kind as string]) applyOcclusion(part.mat, OCC_RADIUS[spec.kind as string]);
        const im = new THREE.InstancedMesh(part.geo, part.mat, mats.length);
        mats.forEach((m, k) => {
          im.setMatrixAt(k, m);
          if (spec.kind !== 'grass') im.setColorAt(k, colVar[vi][k]);
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = part.shadow;
        im.receiveShadow = spec.kind !== 'crystal' && spec.kind !== 'lantern';
        im.computeBoundingSphere();
        group.add(im);
      }
    });
  }
  return { group, colliders, lights };
}

function samplePos(spec: PropSpec, ctx: PropContext, r: () => number) {
  const minR = spec.minR ?? 4;
  const maxR = Math.min(spec.maxR ?? ctx.radius + 20, ctx.radius + 30);
  for (let tries = 0; tries < 30; tries++) {
    const a = r() * TAU;
    const d = Math.sqrt(randIn(r, (minR * minR) / (maxR * maxR), 1)) * maxR;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ctx.accept(x, z, spec.kind)) return { x, z };
  }
  return null;
}
