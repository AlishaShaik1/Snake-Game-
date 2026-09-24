import type * as THREE from 'three';
import type { Aeren } from './serpent';
import type { World } from './world';
import type { Bursts, Rings } from './particles';
import type { Pickups } from './pickups';
import type { Projectiles } from './enemies';

export interface Enemy {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  radius: number;
  alive: boolean;
  /** segments required to crush it with a coil (0 = not crushable) */
  minCoil: number;
  isBoss?: boolean;
  tag?: string;
  update(dt: number, t: number, g: GameAPI): void;
  /** Called when the player closes a loop around this enemy. */
  onCoil?(g: GameAPI): void;
  dispose(): void;
}

export interface GameAPI {
  player: Aeren;
  world: World;
  bursts: Bursts;
  rings: Rings;
  pickups: Pickups;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  time: number;
  enemies: Enemy[];
  projectiles: Projectiles;
  hurt(n: number, at?: THREE.Vector3, source?: string): void;
  cut(index: number): void;
  shake(v: number): void;
  flash(color: string): void;
  sfx(name: string, p?: number): void;
  hint(text: string | null, ms?: number): void;
  addEnemy(e: Enemy): void;
  light(pos: THREE.Vector3, color: string, intensity: number, dur: number): void;
}
