import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Quality } from './store';
import { damp } from './util';

export interface Grade {
  saturation: number; // -1..1
  contrast: number; // -1..1
  brightness: number;
  hue: number;
  vignette: number;
  bloom: number;
  exposure: number;
}

export const QUALITY: Record<Quality, { pr: number; ao: boolean; aoHalf: boolean; shadow: number; grass: number; particles: number; dof: boolean }> = {
  low: { pr: 0.7, ao: false, aoHalf: true, shadow: 1024, grass: 0, particles: 0.45, dof: false },
  medium: { pr: 1, ao: false, aoHalf: true, shadow: 2048, grass: 0.5, particles: 0.7, dof: false },
  high: { pr: 1.25, ao: true, aoHalf: true, shadow: 2048, grass: 1, particles: 1, dof: true },
  ultra: { pr: 2, ao: true, aoHalf: false, shadow: 4096, grass: 1.4, particles: 1.3, dof: true },
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  quality: Quality;
  q = QUALITY.high;
  private ao: any = null;
  private bloom: BloomEffect;
  private hue: HueSaturationEffect;
  private bc: BrightnessContrastEffect;
  private vignette: VignetteEffect;
  private tone: ToneMappingEffect;
  private chroma: ChromaticAberrationEffect;
  private dof: DepthOfFieldEffect;
  private dofPass: EffectPass;
  private noise: NoiseEffect;
  private clock = new THREE.Clock();
  private frameCb: ((dt: number, t: number) => void) | null = null;
  // camera shake / aberration pulse
  private shakeAmt = 0;
  private chromaPulse = 0;
  shakeEnabled = true;
  exposure = 1;
  private targetGrade: Grade = { saturation: 0, contrast: 0.1, brightness: 0, hue: 0, vignette: 0.6, bloom: 1, exposure: 1 };
  private grade: Grade = { ...this.targetGrade };
  fpsAvg = 60;
  dofWanted = false;
  dofTarget = new THREE.Vector3();

  constructor(private container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.q = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false, stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 3000);
    this.camera.position.set(0, 10, 20);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.ao = new N8AOPostPass(this.scene, this.camera, container.clientWidth, container.clientHeight);
    this.ao.configuration.aoRadius = 3;
    this.ao.configuration.distanceFalloff = 1.2;
    this.ao.configuration.intensity = 2.2;
    this.ao.configuration.color = new THREE.Color(0, 0, 0);
    this.ao.configuration.halfRes = this.q.aoHalf;
    this.ao.setQualityMode?.('Medium');
    this.composer.addPass(this.ao);

    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 10, focusRange: 6, bokehScale: 3.5, resolutionScale: 0.5 });
    this.dofPass = new EffectPass(this.camera, this.dof);
    this.composer.addPass(this.dofPass);

    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.62, luminanceSmoothing: 0.25, intensity: 1.25, radius: 0.72 });
    this.hue = new HueSaturationEffect({ saturation: 0, hue: 0 });
    this.bc = new BrightnessContrastEffect({ brightness: 0, contrast: 0.1 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.28, darkness: 0.6 });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.12;
    this.composer.addPass(new EffectPass(this.camera, this.bloom, this.tone, this.hue, this.bc, this.vignette, this.noise));
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006), radialModulation: true, modulationOffset: 0.25 });
    this.composer.addPass(new EffectPass(this.camera, this.chroma));
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));

    this.applyQuality(quality);
    window.addEventListener('resize', this.onResize);
    this.renderer.setAnimationLoop(this.loop);
  }

  setQuality(q: Quality) {
    this.applyQuality(q);
  }

  private applyQuality(quality: Quality) {
    this.quality = quality;
    this.q = QUALITY[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    this.ao.enabled = this.q.ao;
    this.ao.configuration.halfRes = this.q.aoHalf;
    this.dofPass.enabled = false;
    this.onResize();
  }

  onFrame(cb: (dt: number, t: number) => void) {
    this.frameCb = cb;
  }

  setGrade(g: Partial<Grade>, instant = false) {
    this.targetGrade = { ...this.targetGrade, ...g };
    if (instant) this.grade = { ...this.targetGrade };
  }

  shake(amount: number) {
    if (!this.shakeEnabled) return;
    this.shakeAmt = Math.min(2.5, this.shakeAmt + amount);
  }
  aberrate(amount: number) {
    this.chromaPulse = Math.min(0.03, this.chromaPulse + amount);
  }

  private onResize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.ao?.setSize?.(w, h);
  };

  private loop = () => {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (dt > 0) this.fpsAvg = this.fpsAvg * 0.95 + (1 / dt) * 0.05;
    this.frameCb?.(dt, t);

    // grade blending
    const G = this.grade, T = this.targetGrade;
    for (const k of Object.keys(G) as (keyof Grade)[]) G[k] = damp(G[k], T[k], 2.5, dt);
    this.hue.saturation = G.saturation;
    this.hue.hue = G.hue;
    this.bc.brightness = G.brightness;
    this.bc.contrast = G.contrast;
    this.vignette.darkness = G.vignette;
    this.bloom.intensity = G.bloom;
    this.exposure = G.exposure;
    (this.tone as any).exposure = G.exposure;
    this.renderer.toneMappingExposure = G.exposure;

    // chromatic pulse
    this.chromaPulse = damp(this.chromaPulse, 0, 4, dt);
    const c = 0.0005 + this.chromaPulse;
    this.chroma.offset.set(c, c);

    // DOF
    const wantDof = this.dofWanted && this.q.dof;
    this.dofPass.enabled = wantDof;
    if (wantDof) {
      const d = this.camera.position.distanceTo(this.dofTarget);
      this.dof.cocMaterial.focusDistance = d;
      this.dof.cocMaterial.focusRange = Math.max(3, d * 0.6);
    }

    // shake (applied as a transient offset, restored after render)
    let ox = 0, oy = 0;
    if (this.shakeAmt > 0.001) {
      this.shakeAmt = damp(this.shakeAmt, 0, 5, dt);
      ox = (Math.random() - 0.5) * this.shakeAmt * 0.6;
      oy = (Math.random() - 0.5) * this.shakeAmt * 0.6;
      this.camera.position.x += ox;
      this.camera.position.y += oy;
    }
    this.composer.render(dt);
    this.camera.position.x -= ox;
    this.camera.position.y -= oy;
  };

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
