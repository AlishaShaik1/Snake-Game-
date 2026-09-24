/** Hero set-pieces built for specific story beats. */
import * as THREE from 'three';
import { imageTexture, softDot, stoneTextures } from '../textures';
import { makeSerpentMaterial } from '../serpent';
import { TAU, rng } from '../util';

function crackTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  const r = rng(5);
  for (let k = 0; k < 7; k++) {
    let x = r() * 512, y = 40 + r() * 170;
    g.lineWidth = 1.5 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 12; i++) {
      x += (r() - 0.5) * 50;
      y += (r() - 0.5) * 36;
      g.lineTo(x, y);
      if (r() < 0.25) { g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); g.moveTo(x, y); }
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeEgg() {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#0c0b0e', roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.2, iridescence: 0.6,
    emissive: '#bfe0ff', emissiveMap: crackTexture(), emissiveIntensity: 0, normalMap: stoneTextures().normalMap, normalScale: new THREE.Vector2(0.3, 0.3),
  });
  const shellGeo = new THREE.SphereGeometry(1.6, 40, 30);
  const p = shellGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y > 0 ? 1 - y * 0.12 : 1;
    p.setXYZ(i, p.getX(i) * k, y * 1.35, p.getZ(i) * k);
  }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, mat);
  shell.castShadow = true;
  shell.position.y = 1.6;
  group.add(shell);
  const glow = new THREE.PointLight('#9fd0ff', 0, 18, 2);
  glow.position.y = 2;
  group.add(glow);
  // shards for the hatching
  const shards: THREE.Mesh[] = [];
  const shardGeo = new THREE.TetrahedronGeometry(0.5, 0);
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Mesh(shardGeo, mat);
    s.visible = false;
    s.scale.set(1, 0.3 + Math.random() * 0.5, 1);
    shards.push(s);
    group.add(s);
  }
  const vel = shards.map(() => new THREE.Vector3());
  let hatched = false;
  return {
    group, mat, glow, shell,
    setCrack(k: number) {
      mat.emissiveIntensity = k * 4;
      glow.intensity = k * 60;
    },
    hatch() {
      hatched = true;
      shell.visible = false;
      shards.forEach((s, i) => {
        s.visible = true;
        const a = (i / shards.length) * TAU;
        s.position.set(Math.cos(a) * 1.2, 1 + Math.random() * 2, Math.sin(a) * 1.2);
        vel[i].set(Math.cos(a) * (3 + Math.random() * 4), 4 + Math.random() * 5, Math.sin(a) * (3 + Math.random() * 4));
      });
      glow.intensity = 120;
    },
    update(dt: number) {
      if (!hatched) return;
      glow.intensity *= Math.exp(-dt * 1.5);
      shards.forEach((s, i) => {
        vel[i].y -= 18 * dt;
        s.position.addScaledVector(vel[i], dt);
        if (s.position.y < 0.15) { s.position.y = 0.15; vel[i].multiplyScalar(0.4); vel[i].y = Math.abs(vel[i].y) * 0.3; }
        s.rotation.x += vel[i].x * dt;
        s.rotation.z += vel[i].z * dt;
      });
    },
  };
}

/** The ancient shrine with the Ouroboros mural (uses the painted key-art texture). */
export function makeShrine() {
  const group = new THREE.Group();
  const stone = stoneTextures();
  const sm = new THREE.MeshStandardMaterial({ color: '#9a8a6a', roughness: 0.9, map: stone.map, normalMap: stone.normalMap });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 8), sm);
  base.position.y = 0.3;
  base.receiveShadow = true;
  base.castShadow = true;
  group.add(base);
  const step = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 0.5, 8), sm);
  step.position.y = -0.1;
  group.add(step);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 1.2), sm);
  wall.position.set(0, 5.4, -5);
  wall.castShadow = true;
  group.add(wall);
  const muralMat = new THREE.MeshStandardMaterial({ map: imageTexture('/art/mural.jpg'), roughness: 0.85, emissive: '#ffffff', emissiveMap: imageTexture('/art/mural.jpg'), emissiveIntensity: 0.06 });
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), muralMat);
  mural.position.set(0, 5.4, -4.38);
  group.add(mural);
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 11, 12), sm);
    pil.position.set(s * 5.6, 5.8, -5);
    pil.castShadow = true;
    group.add(pil);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.4, 0.6, 10), sm);
    bowl.position.set(s * 6.5, 1.8, 1);
    group.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color('#ffae4a').multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.set(s * 6.5, 2.6, 1);
    fl.scale.setScalar(2.2);
    group.add(fl);
    const pl = new THREE.PointLight('#ffae5a', 30, 20, 2);
    pl.position.set(s * 6.5, 3, 1.5);
    group.add(pl);
  }
  return { group, mural, muralMat };
}

/** A glowing ghostly serpent head used for recordings / visions. */
export function makeHologram(color = '#8ad8ff') {
  const group = new THREE.Group();
  const { mat, uniforms } = makeSerpentMaterial({ color: '#000000', belly: 1, rune: color, runeIntensity: 3, eye: '#ffffff', transparent: true, opacity: 0.35, emissiveBase: color });
  mat.emissive.set(color).multiplyScalar(0.35);
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  const g = new THREE.SphereGeometry(1, 28, 18);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const front = Math.max(0, z);
    p.setXYZ(i, x * 0.78 * (1 - front * 0.32), y * (y > 0 ? 0.5 : 0.32), z * 1.35);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
  const head = new THREE.Mesh(g, mat);
  group.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(5) });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeM);
    e.position.set(s * 0.46, 0.16, 0.42);
    group.add(e);
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 24, 1, true).translate(0, 3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.rotation.x = Math.PI;
  beam.position.y = -3;
  group.add(beam);
  return { group, uniforms, head };
}

/** Giant ring structure on the ocean floor — a vertebra of the World Serpent. */
export function makeWorldRing(radius = 70) {
  const { mat, uniforms } = makeSerpentMaterial({ color: '#1a2a2e', belly: 1.2, rune: '#3affd8', runeIntensity: 2.2, eye: '#fff', iridescence: 0.4, roughness: 0.95 });
  const geo = new THREE.TorusGeometry(radius, 9, 24, 140);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) {
    const u = uv.getX(k), v = uv.getY(k);
    uv.setXY(k, v, u * ((TAU * radius) / (9 * 2.2)));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2 - 0.12;
  ring.castShadow = true;
  ring.receiveShadow = true;
  return { ring, uniforms };
}

/** Cosmic shot: the planet, and the serpent curled inside it. */
export function makeCosmos() {
  const group = new THREE.Group();
  group.position.set(0, 4000, 0);
  const stars = new THREE.BufferGeometry();
  const n = 3000;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(600 + Math.random() * 300);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  stars.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  group.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false })));
  const planetMat = new THREE.MeshStandardMaterial({ color: '#2a4a6a', roughness: 0.8, transparent: true, opacity: 1, emissive: '#0a1420', fog: false });
  planetMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vP;
      float hs(vec3 p){ p=fract(p*0.3183+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float ns(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float land = ns(vP*0.12)*0.6 + ns(vP*0.3)*0.3 + ns(vP*0.8)*0.1;
        diffuseColor.rgb = land > 0.52 ? mix(vec3(0.25,0.3,0.12), vec3(0.45,0.38,0.28), (land-0.52)*4.0) : mix(vec3(0.02,0.08,0.2), vec3(0.05,0.2,0.35), land*1.8);
        float cl = ns(vP*0.25 + 10.0); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), smoothstep(0.6,0.8,cl)*0.8);`);
  };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 48), planetMat);
  group.add(planet);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(42.5, 48, 32), new THREE.MeshBasicMaterial({ color: '#6ab8ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false }));
  group.add(atmo);
  // the serpent inside
  const { mat, uniforms } = makeSerpentMaterial({ color: '#1a1410', belly: 1.4, rune: '#ffcf8a', runeIntensity: 3.5, eye: '#fff', iridescence: 0.5, emissiveBase: '#1a0c02' });
  mat.fog = false;
  class Knot extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * TAU;
      const p = 2, q = 3;
      const r = 22 + 8 * Math.cos(q * a);
      return target.set(r * Math.cos(p * a), 8 * Math.sin(q * a), r * Math.sin(p * a));
    }
  }
  const knot = new THREE.TubeGeometry(new Knot(), 400, 4.2, 14, true);
  const uv = knot.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, v, u * 60); }
  knot.setAttribute('color', new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
  const serpent = new THREE.Mesh(knot, mat);
  serpent.visible = false;
  group.add(serpent);
  const sun = new THREE.DirectionalLight('#fff4e0', 3);
  sun.position.set(100, 60, 80);
  sun.target = planet;
  group.add(sun);
  const rim = new THREE.PointLight('#ffcf8a', 0, 200, 1.5);
  group.add(rim);
  const center = new THREE.Vector3(0, 4000, 0);
  return { group, planet, planetMat, atmo, serpent, uniforms, rim, center };
}

/** Giant pulsing heart for the final chamber. */
export function makeHeart() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 3), new THREE.MeshPhysicalMaterial({ color: '#4a0a10', emissive: '#ff4a3a', emissiveIntensity: 2.2, roughness: 0.25, clearcoat: 1 }));
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0).scale(0.8, 1.6, 0.8), new THREE.MeshPhysicalMaterial({ color: '#fff8e0', emissive: '#ffe0a0', emissiveIntensity: 4, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.9 }));
  crystal.position.y = 7.5;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: new THREE.Color('#ff7a5a').multiplyScalar(2), blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(26);
  const veins: THREE.Mesh[] = [];
  const vm = new THREE.MeshStandardMaterial({ color: '#3a0a10', emissive: '#ff3a2a', emissiveIntensity: 1, roughness: 0.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 8, 3, Math.sin(a) * 8), new THREE.Vector3(Math.cos(a) * 20, -1, Math.sin(a) * 20)]);
    const v = new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.6, 8), vm);
    veins.push(v);
    group.add(v);
  }
  group.add(core, crystal, halo);
  const light = new THREE.PointLight('#ff6a4a', 80, 60, 1.6);
  light.position.y = 5;
  group.add(light);
  return {
    group, core, crystal, halo, light,
    update(t: number) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 3.2)), 8) + Math.pow(Math.max(0, Math.sin(t * 3.2 - 0.5)), 12) * 0.6;
      core.scale.setScalar(1 + beat * 0.12);
      (core.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 1.8 + beat * 2.5;
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 7.5 + Math.sin(t) * 0.4;
      light.intensity = 60 + beat * 80;
    },
  };
}
