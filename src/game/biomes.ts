import type { SkyDef } from './sky';
import type { Grade } from './engine';
import type { Mood } from './audio';

export type TerrainKind =
  | 'cavern' | 'ruins' | 'dream' | 'forest' | 'city' | 'volcano' | 'seabed' | 'islands'
  | 'grove' | 'mountain' | 'void' | 'astral' | 'fall' | 'final' | 'inside';

export type PropKind =
  | 'deadTree' | 'tree' | 'rock' | 'pillar' | 'arch' | 'skeleton' | 'crystal' | 'mushroom' | 'grass'
  | 'ruinWall' | 'tower' | 'bones' | 'coral' | 'kelp' | 'lantern' | 'obelisk' | 'mirror' | 'floatRock' | 'spire' | 'banner';

export interface PropSpec {
  kind: PropKind;
  count: number;
  scale: [number, number];
  color?: string;
  emissive?: string;
  minR?: number;
  maxR?: number;
  collide?: boolean;
  ySink?: number;
}

export type ParticleKind = 'ash' | 'embers' | 'spores' | 'fireflies' | 'bubbles' | 'dust' | 'snow' | 'motes' | 'stars' | 'rain' | 'leaves';
export interface ParticleSpec { kind: ParticleKind; count: number; color: string; size: number }

export interface BiomeDef {
  id: string;
  sky: SkyDef;
  fog: { color: string; density: number };
  sun: { color: string; intensity: number; dir: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
  env?: number;
  terrain: {
    kind: TerrainKind;
    amp: number;
    radius: number;
    colors: { low: string; mid: string; high: string; slope: string };
    seed?: number;
  };
  water?: { level: number; color: string; opacity?: number };
  lava?: { level: number };
  underwater?: boolean;
  cavern?: boolean;
  props: PropSpec[];
  particles: ParticleSpec[];
  grade: Partial<Grade>;
  mood: Mood;
  lights?: { pos: [number, number, number]; color: string; intensity: number; distance: number }[];
}

export const BIOMES: Record<string, BiomeDef> = {
  cavern: {
    id: 'cavern',
    sky: { top: '#020306', horizon: '#060a12', bottom: '#010102', sun: '#9fc7ff', sunDir: [0.2, 1, 0.1], sunSize: 0.5 },
    fog: { color: '#070b14', density: 0.022 },
    sun: { color: '#a8c8ff', intensity: 2.2, dir: [0.15, 1, 0.25] },
    hemi: { sky: '#3a5a8a', ground: '#0a0806', intensity: 0.35 },
    env: 0.35,
    cavern: true,
    terrain: { kind: 'cavern', amp: 5, radius: 95, colors: { low: '#1a1714', mid: '#2a2520', high: '#3b342c', slope: '#141210' }, seed: 3 },
    water: { level: -2.2, color: '#0a1a2a', opacity: 0.85 },
    props: [
      { kind: 'skeleton', count: 7, scale: [1, 1.6], minR: 22, maxR: 85 },
      { kind: 'mushroom', count: 160, scale: [0.4, 1.6], emissive: '#3fb8ff', minR: 6 },
      { kind: 'crystal', count: 40, scale: [0.6, 2.2], emissive: '#58a8ff', minR: 10 },
      { kind: 'rock', count: 90, scale: [0.8, 4], color: '#2b2622', collide: true, minR: 8 },
      { kind: 'pillar', count: 22, scale: [1.2, 2.2], color: '#3a332b', collide: true, minR: 18 },
      { kind: 'bones', count: 60, scale: [0.5, 1.5], minR: 5 },
    ],
    particles: [
      { kind: 'dust', count: 900, color: '#9fc4ff', size: 0.12 },
      { kind: 'spores', count: 300, color: '#5cc8ff', size: 0.22 },
    ],
    grade: { saturation: -0.1, contrast: 0.18, brightness: -0.02, vignette: 0.75, bloom: 1.4, exposure: 1.1 },
    mood: 'cavern',
  },
  ruins: {
    id: 'ruins',
    sky: { top: '#1d2a4a', horizon: '#f0a35e', bottom: '#2a1a14', sun: '#ffb46a', sunDir: [-0.7, 0.12, -0.6], sunSize: 2.2, clouds: 0.6, cloudColor: '#6a4a52' },
    fog: { color: '#b07a5a', density: 0.0105 },
    sun: { color: '#ffb070', intensity: 3.6, dir: [-0.7, 0.35, -0.6] },
    hemi: { sky: '#8aa0c8', ground: '#3a2a1a', intensity: 0.6 },
    env: 0.8,
    terrain: { kind: 'ruins', amp: 7, radius: 110, colors: { low: '#3a4a22', mid: '#56602e', high: '#7a6a48', slope: '#5a4a3a' }, seed: 11 },
    water: { level: -2.6, color: '#2a4a5a', opacity: 0.8 },
    props: [
      { kind: 'grass', count: 26000, scale: [0.6, 1.3], color: '#6a7a30' },
      { kind: 'tree', count: 70, scale: [1, 2.2], color: '#3f5a22', collide: true, minR: 20 },
      { kind: 'pillar', count: 50, scale: [1, 2.4], color: '#9a8a6a', collide: true, minR: 14 },
      { kind: 'arch', count: 10, scale: [1.4, 2.2], color: '#9a8a6a', minR: 25 },
      { kind: 'ruinWall', count: 30, scale: [1, 2], color: '#8a7a5a', collide: true, minR: 20 },
      { kind: 'rock', count: 80, scale: [0.6, 3.5], color: '#6a6050', collide: true, minR: 8 },
      { kind: 'skeleton', count: 2, scale: [1.2, 1.5], minR: 50, maxR: 95 },
    ],
    particles: [
      { kind: 'fireflies', count: 260, color: '#ffd27a', size: 0.25 },
      { kind: 'dust', count: 600, color: '#ffd7a8', size: 0.1 },
    ],
    grade: { saturation: 0.12, contrast: 0.12, brightness: 0, vignette: 0.55, bloom: 1.05, exposure: 1.0 },
    mood: 'dusk',
  },
  dream: {
    id: 'dream',
    sky: { top: '#d9d2c4', horizon: '#fff4de', bottom: '#e9e1d2', sun: '#fff1c8', sunDir: [0.2, 0.6, -0.4], sunSize: 4, clouds: 0.3, cloudColor: '#ffffff', ring: 0.7, ringColor: '#d4a14a' },
    fog: { color: '#e6dccb', density: 0.012 },
    sun: { color: '#fff4dc', intensity: 1.7, dir: [0.3, 0.8, -0.2] },
    hemi: { sky: '#fff6ea', ground: '#8a7c6a', intensity: 0.7 },
    env: 1.0,
    terrain: { kind: 'dream', amp: 1.5, radius: 80, colors: { low: '#aea490', mid: '#c2b8a4', high: '#d4ccb8', slope: '#948874' }, seed: 5 },
    water: { level: -0.6, color: '#d8d0c2', opacity: 0.6 },
    props: [
      { kind: 'mirror', count: 26, scale: [1, 2.2], minR: 12 },
      { kind: 'obelisk', count: 14, scale: [1, 2], color: '#f2ecdf', emissive: '#e8b060', minR: 20, collide: true },
      { kind: 'floatRock', count: 30, scale: [0.6, 2.5], color: '#e8e0d0', minR: 10 },
    ],
    particles: [
      { kind: 'motes', count: 900, color: '#ffe7b0', size: 0.18 },
    ],
    grade: { saturation: -0.3, contrast: 0.1, brightness: -0.02, vignette: 0.6, bloom: 1.1, exposure: 0.85 },
    mood: 'dream',
  },
  forest: {
    id: 'forest',
    sky: { top: '#2a0406', horizon: '#c2301a', bottom: '#1a0504', sun: '#ff5a2a', sunDir: [0.4, 0.15, -0.8], sunSize: 3, clouds: 0.8, cloudColor: '#3a0a08' },
    fog: { color: '#5a1410', density: 0.017 },
    sun: { color: '#ff6a3a', intensity: 2.6, dir: [0.4, 0.4, -0.8] },
    hemi: { sky: '#ff7a5a', ground: '#3a1a14', intensity: 1.0 },
    env: 0.6,
    terrain: { kind: 'forest', amp: 8, radius: 120, colors: { low: '#6e5040', mid: '#846050', high: '#9a745e', slope: '#4e382c' }, seed: 21 },
    props: [
      { kind: 'deadTree', count: 280, scale: [1, 2.6], color: '#0c0908', collide: true, minR: 10 },
      { kind: 'rock', count: 70, scale: [0.8, 3], color: '#2a2220', collide: true, minR: 8 },
      { kind: 'bones', count: 50, scale: [0.6, 1.8], minR: 8 },
      { kind: 'skeleton', count: 2, scale: [1.3, 1.6], minR: 40, maxR: 100 },
    ],
    particles: [
      { kind: 'ash', count: 1400, color: '#c9b2a8', size: 0.12 },
      { kind: 'embers', count: 260, color: '#ff6a2a', size: 0.14 },
    ],
    grade: { saturation: 0.05, contrast: 0.22, brightness: -0.02, vignette: 0.7, bloom: 1.25, exposure: 1.0 },
    mood: 'dead',
  },
  harvester: {
    id: 'harvester',
    sky: { top: '#1a0204', horizon: '#9a1a0a', bottom: '#120202', sun: '#ff3a1a', sunDir: [-0.4, 0.1, -0.8], sunSize: 3, clouds: 0.9, cloudColor: '#2a0606' },
    fog: { color: '#3a0a08', density: 0.013 },
    sun: { color: '#ff5030', intensity: 2.4, dir: [-0.4, 0.45, -0.8] },
    hemi: { sky: '#ff6a4a', ground: '#3a1610', intensity: 1.0 },
    env: 0.5,
    terrain: { kind: 'forest', amp: 3, radius: 85, colors: { low: '#6a4a3c', mid: '#7e5a48', high: '#946c56', slope: '#4a3228' }, seed: 29 },
    props: [
      { kind: 'deadTree', count: 70, scale: [1.2, 2.8], color: '#0c0908', collide: true, minR: 55 },
      { kind: 'rock', count: 30, scale: [1, 3], color: '#2a2220', collide: true, minR: 40 },
      { kind: 'bones', count: 40, scale: [0.6, 1.8], minR: 10 },
    ],
    particles: [
      { kind: 'ash', count: 1200, color: '#c9b2a8', size: 0.12 },
      { kind: 'embers', count: 400, color: '#ff5a2a', size: 0.16 },
    ],
    grade: { saturation: 0.1, contrast: 0.25, vignette: 0.75, bloom: 1.35, exposure: 1.0 },
    mood: 'dead',
  },
  city: {
    id: 'city',
    sky: { top: '#16223a', horizon: '#e0925a', bottom: '#20160f', sun: '#ffc07a', sunDir: [0.8, 0.1, 0.3], sunSize: 2.5, clouds: 0.5, cloudColor: '#6a4a3a' },
    fog: { color: '#a67a5a', density: 0.0095 },
    sun: { color: '#ffb880', intensity: 3.4, dir: [0.8, 0.32, 0.3] },
    hemi: { sky: '#7a9ac8', ground: '#3a2a1a', intensity: 0.55 },
    env: 0.8,
    terrain: { kind: 'city', amp: 3, radius: 120, colors: { low: '#6a5a44', mid: '#8a7656', high: '#a08a66', slope: '#5a4a3a' }, seed: 31 },
    props: [
      { kind: 'skeleton', count: 3, scale: [2.2, 3], minR: 30, maxR: 100 },
      { kind: 'tower', count: 34, scale: [1, 2.2], color: '#a8906a', collide: true, minR: 28 },
      { kind: 'ruinWall', count: 60, scale: [1, 2.2], color: '#9a8260', collide: true, minR: 16 },
      { kind: 'pillar', count: 40, scale: [1, 2], color: '#b09a74', collide: true, minR: 12 },
      { kind: 'lantern', count: 50, scale: [1, 1], emissive: '#ffae4a', minR: 8 },
      { kind: 'banner', count: 20, scale: [1, 1.4], color: '#6a1a14', minR: 12 },
      { kind: 'rock', count: 40, scale: [0.6, 2], color: '#7a6a54', collide: true, minR: 8 },
    ],
    particles: [
      { kind: 'dust', count: 900, color: '#ffd9a8', size: 0.1 },
      { kind: 'embers', count: 120, color: '#ffae4a', size: 0.12 },
    ],
    grade: { saturation: 0.08, contrast: 0.14, vignette: 0.55, bloom: 1.1, exposure: 1.0 },
    mood: 'city',
  },
  ember: {
    id: 'ember',
    sky: { top: '#0a0202', horizon: '#6a1a04', bottom: '#1a0402', sun: '#ff7a2a', sunDir: [0.1, 0.25, -1], sunSize: 3, clouds: 0.9, cloudColor: '#1a0804', nebula: 0 },
    fog: { color: '#2a0a04', density: 0.014 },
    sun: { color: '#ff9a5a', intensity: 2.8, dir: [0.2, 0.6, -0.8] },
    hemi: { sky: '#ff7a4a', ground: '#3a1208', intensity: 0.95 },
    env: 0.5,
    terrain: { kind: 'volcano', amp: 7, radius: 95, colors: { low: '#584038', mid: '#6a4c42', high: '#806050', slope: '#3e2c26' }, seed: 41 },
    lava: { level: -1.2 },
    props: [
      { kind: 'rock', count: 120, scale: [1, 4.5], color: '#1a1210', collide: true, minR: 20 },
      { kind: 'spire', count: 30, scale: [1.2, 3], color: '#140c0a', collide: true, minR: 60 },
      { kind: 'crystal', count: 40, scale: [0.6, 2], emissive: '#ff6a1a', minR: 15 },
    ],
    particles: [
      { kind: 'embers', count: 1200, color: '#ff7a2a', size: 0.18 },
      { kind: 'ash', count: 700, color: '#6a5a55', size: 0.12 },
    ],
    grade: { saturation: 0.15, contrast: 0.25, vignette: 0.7, bloom: 1.5, exposure: 1.0 },
    mood: 'fire',
  },
  tide: {
    id: 'tide',
    sky: { top: '#01121e', horizon: '#0a4a6a', bottom: '#010a12', sun: '#9ae8ff', sunDir: [0, 1, 0], sunSize: 6 },
    fog: { color: '#063048', density: 0.028 },
    sun: { color: '#8ad8ff', intensity: 2.4, dir: [0.1, 1, 0.2] },
    hemi: { sky: '#3ab8e8', ground: '#02101a', intensity: 0.6 },
    env: 0.6,
    underwater: true,
    terrain: { kind: 'seabed', amp: 6, radius: 95, colors: { low: '#1a2a2a', mid: '#2a3a36', high: '#3a4a42', slope: '#122020' }, seed: 51 },
    props: [
      { kind: 'coral', count: 120, scale: [0.6, 2.2], emissive: '#ff5a9a', minR: 12 },
      { kind: 'kelp', count: 220, scale: [1, 3], color: '#1a4a2a', minR: 10 },
      { kind: 'pillar', count: 30, scale: [1.4, 2.6], color: '#4a5a5a', collide: true, minR: 25 },
      { kind: 'arch', count: 8, scale: [1.6, 2.4], color: '#4a5a5a', minR: 35 },
      { kind: 'rock', count: 80, scale: [1, 4], color: '#2a3a3a', collide: true, minR: 12 },
      { kind: 'skeleton', count: 2, scale: [1.6, 2], minR: 50, maxR: 90 },
    ],
    particles: [
      { kind: 'bubbles', count: 700, color: '#c8f4ff', size: 0.16 },
      { kind: 'dust', count: 1000, color: '#7ad8ff', size: 0.09 },
    ],
    grade: { saturation: 0.05, contrast: 0.15, vignette: 0.8, bloom: 1.35, exposure: 1.05 },
    mood: 'deep',
  },
  gale: {
    id: 'gale',
    sky: { top: '#2a5a9a', horizon: '#cfe6f5', bottom: '#8ab0d0', sun: '#fff6e0', sunDir: [0.5, 0.5, -0.4], sunSize: 2, clouds: 0.75, cloudColor: '#ffffff' },
    fog: { color: '#bcd6ea', density: 0.0075 },
    sun: { color: '#fff4e0', intensity: 3.8, dir: [0.5, 0.7, -0.4] },
    hemi: { sky: '#bcdcff', ground: '#4a5a6a', intensity: 0.9 },
    env: 1.0,
    terrain: { kind: 'islands', amp: 3, radius: 95, colors: { low: '#4a6a2a', mid: '#6a8a3a', high: '#8a9a6a', slope: '#6a5a4a' }, seed: 61 },
    props: [
      { kind: 'grass', count: 16000, scale: [0.5, 1.2], color: '#7aa040' },
      { kind: 'floatRock', count: 60, scale: [1.5, 6], color: '#7a6a5a', minR: 20 },
      { kind: 'pillar', count: 20, scale: [1, 2], color: '#d8d0c0', collide: true, minR: 10 },
      { kind: 'tree', count: 30, scale: [0.8, 1.6], color: '#5a8a3a', collide: true, minR: 12 },
    ],
    particles: [
      { kind: 'leaves', count: 500, color: '#e8f4ff', size: 0.14 },
      { kind: 'dust', count: 400, color: '#ffffff', size: 0.08 },
    ],
    grade: { saturation: 0.1, contrast: 0.08, vignette: 0.45, bloom: 0.9, exposure: 1.0 },
    mood: 'sky',
  },
  root: {
    id: 'root',
    sky: { top: '#0e2a1a', horizon: '#6a9a4a', bottom: '#0a1a0e', sun: '#e8ffa0', sunDir: [0.3, 0.6, 0.4], sunSize: 2, clouds: 0.5, cloudColor: '#3a5a2a' },
    fog: { color: '#2a4a24', density: 0.02 },
    sun: { color: '#e8ffb0', intensity: 2.8, dir: [0.3, 0.8, 0.4] },
    hemi: { sky: '#8ad86a', ground: '#1a120a', intensity: 0.55 },
    env: 0.6,
    terrain: { kind: 'grove', amp: 6, radius: 95, colors: { low: '#1a2a12', mid: '#2a3a18', high: '#3a4a22', slope: '#2a1e14' }, seed: 71 },
    props: [
      { kind: 'grass', count: 22000, scale: [0.7, 1.5], color: '#3a6a22' },
      { kind: 'tree', count: 160, scale: [1.4, 3.2], color: '#2a5a1a', collide: true, minR: 25 },
      { kind: 'mushroom', count: 90, scale: [0.4, 1.2], emissive: '#9aff5a', minR: 8 },
      { kind: 'rock', count: 50, scale: [0.8, 3], color: '#3a3a2a', collide: true, minR: 15 },
    ],
    particles: [
      { kind: 'spores', count: 700, color: '#caff7a', size: 0.18 },
      { kind: 'fireflies', count: 200, color: '#eaff9a', size: 0.22 },
    ],
    grade: { saturation: 0.12, contrast: 0.14, vignette: 0.65, bloom: 1.2, exposure: 1.0 },
    mood: 'root',
  },
  stone: {
    id: 'stone',
    sky: { top: '#3a3e48', horizon: '#9a9ea6', bottom: '#2a2a2e', sun: '#e8e4dc', sunDir: [-0.4, 0.4, 0.6], sunSize: 2, clouds: 0.9, cloudColor: '#5a5a62' },
    fog: { color: '#6a6c72', density: 0.012 },
    sun: { color: '#fff0e0', intensity: 3.2, dir: [-0.4, 0.7, 0.6] },
    hemi: { sky: '#aab0c0', ground: '#2a2622', intensity: 0.6 },
    env: 0.7,
    terrain: { kind: 'mountain', amp: 10, radius: 100, colors: { low: '#3a3632', mid: '#4a4640', high: '#8a8680', slope: '#2e2a26' }, seed: 81 },
    props: [
      { kind: 'rock', count: 160, scale: [1, 6], color: '#4a4640', collide: true, minR: 14 },
      { kind: 'spire', count: 40, scale: [1.5, 4], color: '#3a3632', collide: true, minR: 55 },
      { kind: 'crystal', count: 30, scale: [0.8, 2.4], emissive: '#e8c07a', minR: 20 },
    ],
    particles: [
      { kind: 'snow', count: 1400, color: '#ffffff', size: 0.12 },
      { kind: 'dust', count: 400, color: '#d8d4cc', size: 0.1 },
    ],
    grade: { saturation: -0.15, contrast: 0.2, vignette: 0.6, bloom: 0.9, exposure: 1.0 },
    mood: 'stone',
  },
  void: {
    id: 'void',
    sky: { top: '#000000', horizon: '#0a0414', bottom: '#000000', sun: '#8a4aff', sunDir: [0, -1, 0], sunSize: 1, nebula: 0.5, nebulaColor: '#2a0a4a', stars: 0.3 },
    fog: { color: '#05020a', density: 0.03 },
    sun: { color: '#6a4aaa', intensity: 0.6, dir: [0.2, 1, 0.3] },
    hemi: { sky: '#5a3a9a', ground: '#0a0612', intensity: 0.5 },
    env: 0.3,
    terrain: { kind: 'void', amp: 1, radius: 80, colors: { low: '#1e1828', mid: '#2a2236', high: '#382e46', slope: '#141019' }, seed: 91 },
    water: { level: -0.4, color: '#140a24', opacity: 0.8 },
    props: [
      { kind: 'obelisk', count: 24, scale: [1, 2.5], color: '#0a0810', emissive: '#8a4aff', collide: true, minR: 20 },
      { kind: 'floatRock', count: 40, scale: [0.8, 3], color: '#0e0a14', minR: 15 },
      { kind: 'mirror', count: 12, scale: [1.2, 2], minR: 30 },
    ],
    particles: [
      { kind: 'motes', count: 800, color: '#a86aff', size: 0.14 },
    ],
    grade: { saturation: -0.2, contrast: 0.3, vignette: 0.9, bloom: 1.6, exposure: 1.1 },
    mood: 'void',
  },
  astra: {
    id: 'astra',
    sky: { top: '#02030a', horizon: '#1a1a3a', bottom: '#02020a', sun: '#ffe0a0', sunDir: [0.2, 0.3, -1], sunSize: 2, stars: 1, nebula: 0.9, nebulaColor: '#3a2a7a', ring: 1, ringColor: '#ffd28a' },
    fog: { color: '#0a0a1e', density: 0.008 },
    sun: { color: '#ffe8c0', intensity: 2.2, dir: [0.2, 0.8, -0.6] },
    hemi: { sky: '#6a6aff', ground: '#0a0814', intensity: 0.5 },
    env: 0.7,
    terrain: { kind: 'astral', amp: 1, radius: 85, colors: { low: '#2a2846', mid: '#363456', high: '#46446a', slope: '#1c1a32' }, seed: 101 },
    props: [
      { kind: 'obelisk', count: 20, scale: [1, 2.4], color: '#1a1830', emissive: '#ffd28a', collide: true, minR: 22 },
      { kind: 'floatRock', count: 50, scale: [0.8, 3.5], color: '#2a2848', minR: 15 },
      { kind: 'crystal', count: 40, scale: [0.6, 2], emissive: '#8a9aff', minR: 12 },
    ],
    particles: [
      { kind: 'stars', count: 900, color: '#ffe8b0', size: 0.14 },
      { kind: 'motes', count: 400, color: '#9aaaff', size: 0.12 },
    ],
    grade: { saturation: 0.1, contrast: 0.18, vignette: 0.65, bloom: 1.5, exposure: 1.05 },
    mood: 'astral',
  },
  ocean: {
    id: 'ocean',
    sky: { top: '#000810', horizon: '#03283a', bottom: '#000408', sun: '#6ad8ff', sunDir: [0, 1, 0], sunSize: 5 },
    fog: { color: '#021a2a', density: 0.024 },
    sun: { color: '#6ac8ff', intensity: 1.8, dir: [0.1, 1, 0.1] },
    hemi: { sky: '#2a98c8', ground: '#010810', intensity: 0.45 },
    env: 0.5,
    underwater: true,
    terrain: { kind: 'seabed', amp: 5, radius: 110, colors: { low: '#101a1c', mid: '#18262a', high: '#223236', slope: '#0a1214' }, seed: 111 },
    props: [
      { kind: 'kelp', count: 200, scale: [1.5, 4], color: '#10301a', minR: 10 },
      { kind: 'coral', count: 80, scale: [0.6, 2], emissive: '#3affd8', minR: 15 },
      { kind: 'skeleton', count: 4, scale: [2, 3], minR: 40, maxR: 100 },
      { kind: 'rock', count: 60, scale: [1, 4], color: '#1a2628', collide: true, minR: 12 },
    ],
    particles: [
      { kind: 'bubbles', count: 500, color: '#c8f4ff', size: 0.14 },
      { kind: 'dust', count: 1300, color: '#4ac8ff', size: 0.08 },
    ],
    grade: { saturation: 0, contrast: 0.2, vignette: 0.85, bloom: 1.45, exposure: 1.05 },
    mood: 'deep',
  },
  fall: {
    id: 'fall',
    sky: { top: '#1a0a14', horizon: '#ff8a4a', bottom: '#2a0a0a', sun: '#ffffff', sunDir: [0, 0.2, 1], sunSize: 8, clouds: 0.7, cloudColor: '#3a1a1a', crack: 1, ring: 0.6, ringColor: '#ffffff' },
    fog: { color: '#5a2a24', density: 0.0085 },
    sun: { color: '#ffd0a0', intensity: 3.2, dir: [0.2, 0.5, 1] },
    hemi: { sky: '#ffa07a', ground: '#1a0808', intensity: 0.6 },
    env: 0.7,
    terrain: { kind: 'fall', amp: 5, radius: 420, colors: { low: '#2a1c16', mid: '#3a2a20', high: '#5a4a3a', slope: '#1e1410' }, seed: 121 },
    props: [
      { kind: 'deadTree', count: 160, scale: [1, 2.4], color: '#0c0908', collide: true },
      { kind: 'tower', count: 50, scale: [1, 2.4], color: '#8a7050', collide: true },
      { kind: 'floatRock', count: 160, scale: [1, 7], color: '#4a3a30' },
      { kind: 'skeleton', count: 6, scale: [1.6, 2.4] },
      { kind: 'pillar', count: 60, scale: [1, 2.4], color: '#9a8a6a', collide: true },
      { kind: 'rock', count: 120, scale: [1, 4], color: '#3a2a22', collide: true },
    ],
    particles: [
      { kind: 'embers', count: 1500, color: '#ff8a3a', size: 0.18 },
      { kind: 'ash', count: 900, color: '#cfc0b8', size: 0.14 },
    ],
    grade: { saturation: 0.15, contrast: 0.25, vignette: 0.7, bloom: 1.5, exposure: 1.0 },
    mood: 'fall',
  },
  final: {
    id: 'final',
    sky: { top: '#050308', horizon: '#6a3a2a', bottom: '#050202', sun: '#ffe0b0', sunDir: [0, 0.35, -1], sunSize: 5, clouds: 0.8, cloudColor: '#1a0e0e', crack: 0.7, stars: 0.6, ring: 1, ringColor: '#ffcf8a' },
    fog: { color: '#1e120e', density: 0.0065 },
    sun: { color: '#ffd8a8', intensity: 3, dir: [0, 0.6, -1] },
    hemi: { sky: '#ffb08a', ground: '#0a0604', intensity: 0.5 },
    env: 0.7,
    terrain: { kind: 'final', amp: 6, radius: 130, colors: { low: '#1a1410', mid: '#2a2018', high: '#40342a', slope: '#140e0a' }, seed: 131 },
    props: [
      { kind: 'rock', count: 90, scale: [1.5, 6], color: '#2a2018', collide: true, minR: 40 },
      { kind: 'spire', count: 30, scale: [2, 5], color: '#1a1410', collide: true, minR: 90 },
      { kind: 'crystal', count: 40, scale: [1, 3], emissive: '#ffcf8a', minR: 30 },
      { kind: 'floatRock', count: 60, scale: [1, 6], color: '#2a2018', minR: 30 },
    ],
    particles: [
      { kind: 'embers', count: 900, color: '#ffc07a', size: 0.2 },
      { kind: 'motes', count: 400, color: '#ffe8c0', size: 0.14 },
    ],
    grade: { saturation: 0.05, contrast: 0.28, vignette: 0.7, bloom: 1.55, exposure: 1.05 },
    mood: 'final',
  },
  inside: {
    id: 'inside',
    sky: { top: '#2a0a1a', horizon: '#ff9a7a', bottom: '#1a0508', sun: '#ffd0c0', sunDir: [0, 0.3, 1], sunSize: 6, nebula: 0.8, nebulaColor: '#8a2a4a', ring: 0.8, ringColor: '#ffe0c8' },
    fog: { color: '#6a2a3a', density: 0.013 },
    sun: { color: '#ffd0c0', intensity: 2.6, dir: [0, 0.6, 1] },
    hemi: { sky: '#ff9aaa', ground: '#2a0a10', intensity: 0.7 },
    env: 0.8,
    terrain: { kind: 'inside', amp: 5, radius: 110, colors: { low: '#3a1a1e', mid: '#5a2a2a', high: '#7a4a3a', slope: '#2a1014' }, seed: 141 },
    water: { level: -1.6, color: '#6a1a2a', opacity: 0.8 },
    props: [
      { kind: 'grass', count: 12000, scale: [0.6, 1.3], color: '#8a4a3a' },
      { kind: 'tree', count: 50, scale: [1, 2.4], color: '#aa4a5a', collide: true, minR: 20 },
      { kind: 'deadTree', count: 50, scale: [1, 2.2], color: '#1a0a0a', collide: true, minR: 20 },
      { kind: 'tower', count: 16, scale: [1, 2], color: '#a8906a', collide: true, minR: 40 },
      { kind: 'mirror', count: 20, scale: [1.2, 2.4], minR: 20 },
      { kind: 'coral', count: 60, scale: [0.6, 2], emissive: '#ff7aa0', minR: 15 },
      { kind: 'skeleton', count: 3, scale: [1.5, 2.2], minR: 40, maxR: 100 },
    ],
    particles: [
      { kind: 'motes', count: 900, color: '#ffd0c0', size: 0.16 },
      { kind: 'spores', count: 300, color: '#ff8aa0', size: 0.18 },
    ],
    grade: { saturation: 0.05, contrast: 0.12, vignette: 0.65, bloom: 1.5, exposure: 1.0 },
    mood: 'heart',
  },
};
