import * as THREE from 'three';
import { useUI } from './store';
import { audio } from './audio';
import { easeInOut, easeOut } from './util';

export type VP = THREE.Vector3 | (() => THREE.Vector3);
export interface Line { who: string; text: string; dur?: number; voice?: string }
export interface Shot {
  dur: number;
  cam: VP;
  camTo?: VP;
  look: VP;
  lookTo?: VP;
  fov?: number;
  fovTo?: number;
  ease?: 'inout' | 'linear' | 'out';
  lines?: (Line & { at: number })[];
  events?: { at: number; fn: () => void }[];
  update?: (k: number, dt: number) => void;
  dof?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  shake?: number;
}

const val = (v: VP) => (typeof v === 'function' ? v() : v);
let subId = 1;

export function showSubtitle(who: string, text: string, dur: number, voice?: string) {
  const id = subId++;
  useUI.setState({ subtitle: { who, text, id } });
  if (voice) audio.voice(voice);
  window.setTimeout(() => {
    if (useUI.getState().subtitle?.id === id) useUI.setState({ subtitle: null });
  }, dur * 1000);
}

export class Director {
  active = false;
  private shots: Shot[] = [];
  private idx = 0;
  private t = 0;
  private fired = new Set<string>();
  private resolve: (() => void) | null = null;
  private camP = new THREE.Vector3();
  private lookP = new THREE.Vector3();
  constructor(private camera: THREE.PerspectiveCamera, private onDof: (on: boolean, target: THREE.Vector3) => void, private onShake: (v: number) => void) {}

  play(shots: Shot[]): Promise<void> {
    this.shots = shots;
    this.idx = 0;
    this.t = 0;
    this.fired.clear();
    this.active = true;
    useUI.setState({ letterbox: true, cinematicSkippable: true });
    return new Promise((res) => (this.resolve = res));
  }

  skip() {
    if (!this.active) return;
    // fire all remaining events so scripted state stays consistent
    for (let i = this.idx; i < this.shots.length; i++) {
      const s = this.shots[i];
      for (const [k, e] of (s.events ?? []).entries()) {
        const key = i + ':' + k;
        if (!this.fired.has(key)) { this.fired.add(key); e.fn(); }
      }
      s.update?.(1, 0);
    }
    audio.stopVoice();
    this.finish();
  }

  private finish() {
    this.active = false;
    useUI.setState({ letterbox: false, subtitle: null, cinematicSkippable: false, fade: 0 });
    this.onDof(false, this.lookP);
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    this.resolve = null;
    useUI.setState({ letterbox: false, subtitle: null, cinematicSkippable: false });
    this.onDof(false, this.lookP);
  }

  update(dt: number) {
    if (!this.active) return;
    const s = this.shots[this.idx];
    if (!s) { this.finish(); return; }
    this.t += dt;
    const raw = Math.min(1, this.t / s.dur);
    const k = s.ease === 'linear' ? raw : s.ease === 'out' ? easeOut(raw) : easeInOut(raw);
    this.camP.copy(val(s.cam));
    if (s.camTo) this.camP.lerp(val(s.camTo), k);
    this.lookP.copy(val(s.look));
    if (s.lookTo) this.lookP.lerp(val(s.lookTo), k);
    this.camera.position.copy(this.camP);
    this.camera.lookAt(this.lookP);
    const fov = s.fov !== undefined ? (s.fovTo !== undefined ? s.fov + (s.fovTo - s.fov) * k : s.fov) : 50;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.onDof(s.dof !== false, this.lookP);
    if (s.shake) this.onShake(s.shake * dt * 4);
    // fades
    let fade = 0;
    if (s.fadeIn && this.t < s.fadeIn) fade = 1 - this.t / s.fadeIn;
    if (s.fadeOut && this.t > s.dur - s.fadeOut) fade = Math.max(fade, (this.t - (s.dur - s.fadeOut)) / s.fadeOut);
    if (useUI.getState().fade !== fade) useUI.setState({ fade });
    (s.events ?? []).forEach((e, i) => {
      const key = this.idx + ':' + i;
      if (this.t >= e.at && !this.fired.has(key)) { this.fired.add(key); e.fn(); }
    });
    (s.lines ?? []).forEach((l, i) => {
      const key = this.idx + ':L' + i;
      if (this.t >= l.at && !this.fired.has(key)) {
        this.fired.add(key);
        showSubtitle(l.who, l.text, l.dur ?? 3.2, l.voice);
      }
    });
    s.update?.(raw, dt);
    if (this.t >= s.dur) {
      this.idx++;
      this.t = 0;
      if (this.idx >= this.shots.length) this.finish();
    }
  }
}
