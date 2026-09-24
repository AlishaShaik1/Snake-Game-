import * as THREE from 'three';
import type { ParticleSpec } from './biomes';
import { softDot, flameSprite } from './textures';

// ---------------------------------------------------------------- ambient particles (GPU animated, camera-wrapped)
const ambientVert = /* glsl */ `
uniform float uTime, uSize, uPixelRatio, uKind;
uniform vec3 uCam, uBox;
attribute vec4 aRand;
varying float vAlpha;
varying float vTw;
void main(){
  vec3 p = position;
  float t = uTime;
  // motion by kind
  if(uKind < 0.5){ // ash: slow fall + drift
    p.y -= t*0.6*(0.5+aRand.x); p.x += sin(t*0.3+aRand.y*6.3)*2.0 + t*0.4; p.z += cos(t*0.25+aRand.z*6.3)*2.0;
  } else if(uKind < 1.5){ // embers: rise + flicker
    p.y += t*(1.2+aRand.x*1.6); p.x += sin(t*1.3+aRand.y*6.3)*1.2; p.z += cos(t*1.1+aRand.z*6.3)*1.2;
  } else if(uKind < 2.5){ // spores / motes: float swirl
    p.y += sin(t*0.4+aRand.x*6.3)*1.5 + t*0.15; p.x += sin(t*0.2+aRand.y*6.3)*3.0; p.z += cos(t*0.23+aRand.z*6.3)*3.0;
  } else if(uKind < 3.5){ // fireflies: wander
    p.x += sin(t*0.7+aRand.y*20.0)*2.5; p.z += cos(t*0.6+aRand.z*20.0)*2.5; p.y += sin(t*1.1+aRand.x*20.0)*0.8;
  } else if(uKind < 4.5){ // bubbles: rise wobble
    p.y += t*(1.5+aRand.x*2.0); p.x += sin(t*2.0+aRand.y*6.3)*0.4;
  } else if(uKind < 5.5){ // snow
    p.y -= t*(1.4+aRand.x); p.x += sin(t*0.6+aRand.y*6.3)*1.5 + t*0.8;
  } else if(uKind < 6.5){ // leaves: blown
    p.x += t*(6.0+aRand.x*6.0); p.y += sin(t*1.5+aRand.y*6.3)*1.5; p.z += sin(t*0.7+aRand.z*6.3)*2.0;
  } else { // stars/dust: slow drift
    p.x += sin(t*0.1+aRand.y*6.3)*1.0; p.y += sin(t*0.13+aRand.x*6.3)*0.6;
  }
  // wrap around camera
  vec3 rel = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5;
  vec3 wp = uCam + rel;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(rel.x)/uBox.x, max(abs(rel.y)/uBox.y, abs(rel.z)/uBox.z)));
  vTw = (uKind > 2.5 && uKind < 3.5) ? pow(0.5+0.5*sin(t*2.5+aRand.w*40.0), 3.0) : (uKind > 6.5 ? 0.6+0.4*sin(t*3.0+aRand.w*40.0) : 1.0);
  vAlpha = edge;
  gl_PointSize = uSize * (0.6 + aRand.w*0.8) * uPixelRatio * (300.0 / -mv.z);
}`;
const ambientFrag = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
varying float vAlpha; varying float vTw;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(uColor * (1.0 + vTw*2.0), t.a * vAlpha * uOpacity * max(vTw, 0.15));
}`;

const KIND_ID: Record<string, number> = { ash: 0, embers: 1, spores: 2, motes: 2, fireflies: 3, bubbles: 4, snow: 5, rain: 5, leaves: 6, stars: 7, dust: 7 };

export class AmbientParticles {
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(spec: ParticleSpec, scale: number) {
    const count = Math.floor(spec.count * scale);
    const box = new THREE.Vector3(70, spec.kind === 'bubbles' || spec.kind === 'embers' ? 30 : 26, 70);
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 1000;
      pos[i * 3 + 1] = Math.random() * 1000;
      pos[i * 3 + 2] = Math.random() * 1000;
      for (let k = 0; k < 4; k++) rnd[i * 4 + k] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const additive = spec.kind !== 'ash' && spec.kind !== 'snow' && spec.kind !== 'leaves';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: ambientVert,
      fragmentShader: ambientFrag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: spec.size },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uKind: { value: KIND_ID[spec.kind] ?? 7 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uTex: { value: softDot() },
        uColor: { value: new THREE.Color(spec.color).multiplyScalar(additive ? 1.2 : 0.8) },
        uOpacity: { value: additive ? 0.9 : 0.55 },
      },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  update(t: number, cam: THREE.Vector3) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uCam.value.copy(cam);
  }
  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------- burst particles (CPU simulated pool)
const burstVert = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aAlpha;
uniform float uPixelRatio;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
  vColor = aColor; vAlpha = aAlpha;
}`;
const burstFrag = /* glsl */ `
uniform sampler2D uTex; varying vec3 vColor; varying float vAlpha;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vColor, t.a*vAlpha); }`;

export class Bursts {
  points: THREE.Points;
  private max = 3000;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private grav: Float32Array;
  private idx = 0;
  constructor() {
    const m = this.max;
    this.pos = new Float32Array(m * 3);
    this.vel = new Float32Array(m * 3);
    this.col = new Float32Array(m * 3);
    this.size = new Float32Array(m);
    this.alpha = new Float32Array(m);
    this.life = new Float32Array(m);
    this.maxLife = new Float32Array(m);
    this.baseSize = new Float32Array(m);
    this.grav = new Float32Array(m);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: burstVert,
      fragmentShader: burstFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: softDot() }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, opts: { count: number; color: THREE.Color | string; speed?: number; size?: number; life?: number; gravity?: number; up?: number; spread?: number }) {
    const c = typeof opts.color === 'string' ? new THREE.Color(opts.color) : opts.color;
    const speed = opts.speed ?? 6;
    for (let n = 0; n < opts.count; n++) {
      const i = this.idx;
      this.idx = (this.idx + 1) % this.max;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      const spread = opts.spread ?? 0.3;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * s * 0.7 + (opts.up ?? 2);
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      const v = 0.8 + Math.random() * 0.4;
      this.col[i * 3] = c.r * v * 2.5;
      this.col[i * 3 + 1] = c.g * v * 2.5;
      this.col[i * 3 + 2] = c.b * v * 2.5;
      this.baseSize[i] = (opts.size ?? 0.5) * (0.5 + Math.random());
      this.maxLife[i] = this.life[i] = (opts.life ?? 1.2) * (0.6 + Math.random() * 0.6);
      this.grav[i] = opts.gravity ?? 6;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.5 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.baseSize[i] * (0.4 + k * 0.6);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------- shockwave rings & telegraphs
const ringVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `;
const ringFrag = `
uniform vec3 uColor; uniform float uProgress; uniform float uMode; uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv*2.0-1.0; float d = length(p);
  float a = 0.0;
  if(uMode < 0.5){ // shockwave
    float r = uProgress; a = smoothstep(0.12, 0.0, abs(d - r)) * (1.0 - uProgress);
  } else { // telegraph: filling disc with rim
    float rim = smoothstep(0.06, 0.0, abs(d-0.96));
    float fill = step(d, uProgress) * 0.35 * step(d, 1.0);
    float stripes = 0.5+0.5*sin((p.x+p.y)*30.0 - uTime*6.0);
    a = (rim*(0.7+0.3*sin(uTime*14.0)) + fill*(0.6+0.4*stripes)) * step(d,1.0);
  }
  gl_FragColor = vec4(uColor*2.2, a);
}`;

export class Rings {
  group = new THREE.Group();
  private items: { mesh: THREE.Mesh; t: number; dur: number; mode: number; size: number; follow?: () => THREE.Vector3 }[] = [];
  private geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  add(pos: THREE.Vector3, size: number, color: string, dur: number, mode: 'shock' | 'tele' = 'shock') {
    const mat = new THREE.ShaderMaterial({
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uProgress: { value: 0 }, uMode: { value: mode === 'shock' ? 0 : 1 }, uTime: { value: 0 } },
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 0.15;
    mesh.scale.setScalar(size);
    mesh.renderOrder = 5;
    this.group.add(mesh);
    const item = { mesh, t: 0, dur, mode: mode === 'shock' ? 0 : 1, size };
    this.items.push(item);
    return item;
  }
  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = Math.min(1, it.t / it.dur);
      const m = it.mesh.material as THREE.ShaderMaterial;
      m.uniforms.uProgress.value = p;
      m.uniforms.uTime.value += dt;
      if (it.t >= it.dur) {
        this.group.remove(it.mesh);
        m.dispose();
        this.items.splice(i, 1);
      }
    }
  }
  clear() {
    for (const it of this.items) { this.group.remove(it.mesh); (it.mesh.material as THREE.Material).dispose(); }
    this.items = [];
  }
}

// ---------------------------------------------------------------- flames (billboard sprites for fire hazards)
export function makeFlameMaterial(color = '#ffffff') {
  return new THREE.SpriteMaterial({ map: flameSprite(), color: new THREE.Color(color).multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
}
