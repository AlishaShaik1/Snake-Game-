import * as THREE from 'three';
import { fbm2, noise2, rng } from './util';

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Converts a grayscale height buffer into a tangent-space normal map canvas. */
function heightToNormal(height: Float32Array, w: number, h: number, strength = 2): HTMLCanvasElement {
  const c = canvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = height[y * w + ((x - 1 + w) % w)];
      const r = height[y * w + ((x + 1) % w)];
      const u = height[((y - 1 + h) % h) * w + x];
      const d = height[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement, srgb = false, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<string, any>();
function cached<T>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/**
 * Serpent scale set: overlapping rounded diamond scales.
 * u = around the body, v = along the body.
 */
export function scaleTextures() {
  return cached('scales', () => {
    const W = 256, H = 256;
    const hbuf = new Float32Array(W * H);
    const cols = 8, rows = 8;
    const sw = W / cols, sh = H / rows;
    const r = rng(7);
    const jitter = Array.from({ length: cols * rows * 2 }, () => r());
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let best = 0;
        // Staggered rows — evaluate neighbouring scale centres, keep max dome height.
        for (let ry = -1; ry <= 1; ry++) {
          const row = Math.floor(y / sh) + ry;
          const off = (row & 1) * 0.5 * sw;
          for (let rx = -1; rx <= 1; rx++) {
            const colI = Math.floor((x - off) / sw) + rx;
            const cx = colI * sw + off + sw * 0.5;
            const cy = row * sh + sh * 0.35;
            const dx = (x - cx) / (sw * 0.62);
            const dy = (y - cy) / (sh * 0.95);
            // Diamond-ish rounded shape pointing "down" the body.
            const d = Math.pow(Math.abs(dx), 1.6) + Math.pow(Math.max(0, dy), 1.3) + Math.max(0, -dy) * 1.7;
            if (d < 1) {
              const j = jitter[(((row % rows) + rows) % rows) * cols + (((colI % cols) + cols) % cols)];
              const hgt = (1 - d) * (0.8 + 0.2 * j) + (dy > 0 ? dy * 0.25 : 0);
              if (hgt > best) best = hgt;
            }
          }
        }
        hbuf[y * W + x] = best;
      }
    }
    const nrm = heightToNormal(hbuf, W, H, 3.2);
    // Albedo: darker gaps, subtle variation. (Tinted by material colour / vertex colours.)
    const ac = canvas(W, H);
    const actx = ac.getContext('2d')!;
    const aimg = actx.createImageData(W, H);
    const rc = canvas(W, H);
    const rctx = rc.getContext('2d')!;
    const rimg = rctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const hgt = hbuf[i];
      const x = i % W, y = (i / W) | 0;
      const n = fbm2(x * 0.05, y * 0.05, 3) * 0.08;
      const v = Math.min(1, 0.35 + Math.pow(hgt, 0.5) * 0.65 + n);
      aimg.data[i * 4] = aimg.data[i * 4 + 1] = aimg.data[i * 4 + 2] = v * 255;
      aimg.data[i * 4 + 3] = 255;
      const rough = 0.25 + (1 - Math.min(1, hgt * 2)) * 0.55;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rough * 255;
      rimg.data[i * 4 + 3] = 255;
    }
    actx.putImageData(aimg, 0, 0);
    rctx.putImageData(rimg, 0, 0);

    // Rune emissive mask: glyph strokes along the dorsal line (u≈0.5).
    const RW = 128, RH = 512;
    const runeC = canvas(RW, RH);
    const g = runeC.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, RW, RH);
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    const rr = rng(42);
    for (let k = 0; k < 10; k++) {
      const cy = k * (RH / 10) + RH / 20;
      const cx = RW / 2;
      g.lineWidth = 2 + rr() * 1.5;
      g.shadowColor = '#fff';
      g.shadowBlur = 6;
      g.beginPath();
      const strokes = 3 + Math.floor(rr() * 3);
      for (let s = 0; s < strokes; s++) {
        const x0 = cx + (rr() - 0.5) * 26, y0 = cy + (rr() - 0.5) * 30;
        g.moveTo(x0, y0);
        if (rr() < 0.5) g.lineTo(cx + (rr() - 0.5) * 26, cy + (rr() - 0.5) * 30);
        else g.arc(cx + (rr() - 0.5) * 10, cy + (rr() - 0.5) * 10, 5 + rr() * 8, rr() * 6, rr() * 6 + 2);
      }
      g.stroke();
      // side filigree lines
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - 34, cy - 18);
      g.quadraticCurveTo(cx - 44, cy, cx - 34, cy + 18);
      g.moveTo(cx + 34, cy - 18);
      g.quadraticCurveTo(cx + 44, cy, cx + 34, cy + 18);
      g.stroke();
    }
    const rune = tex(runeC);
    rune.wrapS = THREE.ClampToEdgeWrapping;

    return {
      map: tex(ac, true),
      normalMap: tex(nrm),
      roughnessMap: tex(rc),
      runeMap: rune,
    };
  });
}

/** Tileable ground detail normal + albedo noise. */
export function groundTextures() {
  return cached('ground', () => {
    const W = 256;
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        // tileable via 4D-trick approximation: sample on torus using two noise sums
        const a = (x / W) * Math.PI * 2, b = (y / W) * Math.PI * 2;
        const nx = Math.cos(a) * 2, ny = Math.sin(a) * 2, nz = Math.cos(b) * 2, nw = Math.sin(b) * 2;
        let v = 0, amp = 1, f = 1;
        for (let o = 0; o < 5; o++) {
          v += amp * (noise2(nx * f + nz * f * 0.7, ny * f + nw * f * 0.7) * 0.5 + noise2(nz * f + 13.1, nw * f - ny * f * 0.3) * 0.5);
          amp *= 0.5;
          f *= 2.03;
        }
        // pebbles
        const p = Math.max(0, noise2(nx * 6 + nz * 6, ny * 6 + nw * 6) - 0.45) * 2.5;
        h[y * W + x] = v * 0.5 + p;
      }
    const n = heightToNormal(h, W, W, 2.5);
    const ac = canvas(W);
    const ctx = ac.getContext('2d')!;
    const img = ctx.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      const v = Math.max(0, Math.min(1, 0.72 + h[i] * 0.28));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { normalMap: tex(n), map: tex(ac, true) };
  });
}

/** Stone blocks + cracks for ruins/pillars. */
export function stoneTextures() {
  return cached('stone', () => {
    const W = 256;
    const h = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const bx = x % 64, by = (y + (Math.floor(x / 64) % 2) * 32) % 64;
        const edge = Math.min(bx, 64 - bx, by, 64 - by);
        const block = Math.min(1, edge / 4);
        const crack = Math.abs(noise2(x * 0.04, y * 0.04)) < 0.04 ? -0.5 : 0;
        h[y * W + x] = block * 0.8 + fbm2(x * 0.08, y * 0.08, 3) * 0.2 + crack;
      }
    const n = heightToNormal(h, W, W, 2.2);
    const ac = canvas(W);
    const ctx = ac.getContext('2d')!;
    const img = ctx.createImageData(W, W);
    for (let i = 0; i < W * W; i++) {
      const v = Math.max(0, Math.min(1, 0.55 + h[i] * 0.35 + noise2((i % W) * 0.2, (i / W) * 0.2) * 0.05));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { normalMap: tex(n), map: tex(ac, true) };
  });
}

/** Mechanical panels with emissive seams, for machines. */
export function metalTextures() {
  return cached('metal', () => {
    const W = 256;
    const h = new Float32Array(W * W);
    const ec = canvas(W);
    const e = ec.getContext('2d')!;
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const px = x % 128, py = y % 64;
        const edge = Math.min(px, 128 - px, py, 64 - py);
        let v = Math.min(1, edge / 3);
        const rivet = ((px - 8) ** 2 + (py - 8) ** 2 < 6 || (px - 120) ** 2 + (py - 8) ** 2 < 6) ? 0.4 : 0;
        v += rivet;
        h[y * W + x] = v;
      }
    e.fillStyle = '#fff';
    e.shadowColor = '#fff';
    e.shadowBlur = 4;
    for (let i = 0; i < 4; i++) e.fillRect(20 + i * 64, 28, 24, 3);
    for (let i = 0; i < 2; i++) e.fillRect(40 + i * 128, 156, 50, 2);
    const n = heightToNormal(h, W, W, 2);
    return { normalMap: tex(n), emissiveMap: tex(ec, true) };
  });
}

/** Soft round sprite for particles. */
export function softDot() {
  return cached('dot', () => {
    const c = canvas(64);
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  });
}

/** Flame sprite. */
export function flameSprite() {
  return cached('flame', () => {
    const c = canvas(64, 128);
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 96, 2, 32, 80, 60);
    grd.addColorStop(0, 'rgba(255,255,230,1)');
    grd.addColorStop(0.2, 'rgba(255,190,80,0.9)');
    grd.addColorStop(0.5, 'rgba(255,80,20,0.5)');
    grd.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32, 0);
    g.bezierCurveTo(60, 50, 64, 90, 32, 128);
    g.bezierCurveTo(0, 90, 4, 50, 32, 0);
    g.fill();
    return new THREE.CanvasTexture(c);
  });
}

/** Caustics pattern (tileable), used underwater. */
export function causticsTexture() {
  return cached('caustics', () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const a = (x / W) * Math.PI * 2, b = (y / W) * Math.PI * 2;
        const n = noise2(Math.cos(a) * 1.5 + Math.cos(b) * 1.5, Math.sin(a) * 1.5 + Math.sin(b) * 1.5);
        const n2 = noise2(Math.cos(a) * 3 + 5, Math.sin(b) * 3 + Math.sin(a));
        const v = Math.pow(1 - Math.abs(n * 0.7 + n2 * 0.3), 8);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Animated noise used for lava / water normal. */
export function flowNoiseTexture() {
  return cached('flow', () => {
    const W = 256;
    const hbuf = new Float32Array(W * W);
    const c = canvas(W);
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const a = (x / W) * Math.PI * 2, b = (y / W) * Math.PI * 2;
        const v = noise2(Math.cos(a) * 2 + Math.cos(b) * 0.5, Math.sin(a) * 2 + Math.sin(b) * 2) * 0.6 +
          noise2(Math.cos(a) * 4 + 9, Math.sin(b) * 4 + Math.cos(b) * 3) * 0.4;
        hbuf[y * W + x] = v;
        const lava = Math.pow(Math.max(0, 1 - Math.abs(v) * 2.2), 2);
        const i = (y * W + x) * 4;
        img.data[i] = 255 * Math.min(1, lava * 1.2 + 0.15);
        img.data[i + 1] = 255 * Math.min(1, lava * 0.55 + 0.02);
        img.data[i + 2] = 255 * lava * 0.12;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return { lava: tex(c, true), normal: tex(heightToNormal(hbuf, W, W, 1.5)) };
  });
}

/** Image textures (AI key art used in-world, e.g. the shrine mural). */
const loader = new THREE.TextureLoader();
export function imageTexture(url: string) {
  return cached('img:' + url, () => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}
