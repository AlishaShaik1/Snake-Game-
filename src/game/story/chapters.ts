import * as THREE from 'three';
import type { Game } from '../game';
import type { Shot } from '../cinematic';
import type { Reserved } from '../world';
import { fallPathX, FALL_END_Z, FALL_START_Z, shaftMaterial } from '../world';
import { Drone, Harvester, Walker, Human } from '../enemies';
import { EternalBoss, ETERNALS, Echo, FirstSerpent, type EternalId } from '../bosses';
import { makeEgg, makeShrine, makeHologram, makeWorldRing, makeCosmos, makeHeart } from './set';
import { MEMORY_IDS } from './memories';
import { toast, useUI, updateSave } from '../store';
import { audio } from '../audio';
import { makeSkeleton } from '../props';
import { TAU, pointInPoly } from '../util';
import { imageTexture } from '../textures';

export interface StartDef { pos: [number, number]; heading: number; segments: number; size: number }
export interface SectionDef { id: string; start?: Partial<StartDef>; run: (g: Game) => Promise<void> }
export interface ChapterDef {
  id: string;
  act: string;
  title: string;
  subtitle: string;
  art: string;
  quote?: string;
  biome: string;
  reserved?: Reserved[];
  start: StartDef;
  sections: SectionDef[];
  eternalsConsumed?: number;
  final?: boolean;
}

// ------------------------------------------------------------------ helpers
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const gp = (g: Game, x: number, z: number, dy = 0) => V(x, g.world.height(x, z) + dy, z);
const head = (g: Game, dy = 0.4) => () => g.player.pos.clone().setY(g.player.pos.y + dy);
const behind = (g: Game, d: number, h: number, side = 0) => () => {
  const p = g.player;
  const s = V(p.fwd.z, 0, -p.fwd.x);
  return p.pos.clone().addScaledVector(p.fwd, -d).addScaledVector(s, side).setY(p.pos.y + h);
};
const front = (g: Game, d: number, h: number, side = 0) => () => {
  const p = g.player;
  const s = V(p.fwd.z, 0, -p.fwd.x);
  return p.pos.clone().addScaledVector(p.fwd, d).addScaledVector(s, side).setY(p.pos.y + h);
};
function orbit(center: () => THREE.Vector3, r: number, h: number, a0: number, a1: number, dur: number, extra: Partial<Shot> = {}): Shot {
  let k = 0;
  return {
    dur,
    cam: () => {
      const c = center();
      const a = a0 + (a1 - a0) * k;
      return V(c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r);
    },
    look: center,
    ease: 'linear',
    ...extra,
    update: (kk, dt) => { k = kk; extra.update?.(kk, dt); },
  };
}
const has = (id: string) => useUI.getState().save.fragments.includes(id);
function bossBanner(name: string, title: string) {
  toast(name, title, 'boss', 4200);
  audio.sfx('bell');
}
async function absorbEternal(g: Game, boss: EternalBoss, lastWords: string, index: number) {
  g.setBoss(null);
  g.music(null, 1);
  g.hazards.clear(g);
  g.projectiles.clear();
  for (const e of [...g.enemies]) if (e !== boss) g.removeEnemy(e);
  boss.mode = 'dead';
  const bp = () => boss.pos.clone();
  await g.cinematic([
    orbit(bp, boss.radius * 7, boss.radius * 2.5, 0, 0.8, 4, {
      fov: 45,
      lines: [{ at: 0.6, who: boss.def.name, text: lastWords, dur: 3.6 }],
      events: [{ at: 0.1, fn: () => { audio.sfx('roar', 0.6 / Math.sqrt(boss.radius)); g.shake(1); } }],
    }),
    {
      dur: 4.5,
      cam: behind(g, 7, 3.5, 3),
      look: bp,
      fov: 42,
      update: (k) => {
        if (Math.random() < 0.9) {
          const from = boss.pos.clone().add(V((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6));
          const to = g.player.pos;
          const pt = from.lerp(to, Math.random());
          g.bursts.emit(pt, { count: 3, color: boss.def.color, speed: 1, size: 0.8, life: 0.8, gravity: 0 });
        }
        boss.rig.length = Math.max(2, boss.rig.length * (1 - 0.02));
        boss.rig.mat.opacity = 1 - k;
        boss.rig.mat.transparent = true;
      },
      events: [
        { at: 0.2, fn: () => { g.player.jawTarget = 1; audio.sfx('bite'); } },
        { at: 2.2, fn: () => { g.flash(boss.def.color); audio.sfx('memory'); g.applyRunes(index + 1); g.player.targetSize += 0.12; g.player.grow(8); } },
      ],
      lines: [{ at: 2.6, who: '', text: `Aeren consumed ${boss.def.name}. A new rune burns along its spine.`, dur: 3 }],
    },
  ]);
  g.removeEnemy(boss);
  toast(`${boss.def.name} consumed`, `The power of ${boss.def.title.replace('The ', '')} flows through you`, 'memory', 3500);
}

// ------------------------------------------------------------------ voice lines (optional mp3 assets)
const VO = {
  dontLook: '/audio/vo_dont_look.mp3',
  lookKilled: '/audio/vo_look_killed.mp3',
  run: '/audio/vo_run.mp3',
  eat: '/audio/vo_eat.mp3',
  consume: '/audio/vo_consume.mp3',
  prison: '/audio/vo_prison.mp3',
  afraid: '/audio/vo_afraid.mp3',
  killMe: '/audio/vo_kill_me.mp3',
  beginning: '/audio/vo_beginning.mp3',
  asleep: '/audio/vo_asleep.mp3',
};

// ================================================================== PROLOGUE
const prologue: ChapterDef = {
  id: 'prologue',
  act: 'Prologue',
  title: 'The Last Egg',
  subtitle: 'Beneath the ruins, something is still alive.',
  quote: '“Birth. Growth. Death. Rebirth. Nothing lived forever — until they found the Core.”',
  art: '/art/prologue.jpg',
  biome: 'cavern',
  reserved: [{ x: -62, z: -58, r: 10 }],
  start: { pos: [0, 0], heading: Math.PI + 0.8, segments: 5, size: 0.55 },
  sections: [
    {
      id: 'awakening',
      run: async (g) => {
        const egg = makeEgg();
        egg.group.position.copy(gp(g, 0, 0, -0.2));
        g.stage.add(egg.group);
        g.hook((dt) => egg.update(dt));
        const walker = new Walker();
        walker.obj.position.copy(gp(g, 78, -8));
        walker.obj.rotation.y = -Math.PI / 2;
        g.stage.add(walker.obj);
        g.player.rig.group.visible = false;
        const eggP = () => egg.group.position.clone().setY(egg.group.position.y + 1.8);
        const wP = () => walker.obj.position.clone().setY(walker.obj.position.y + 8);
        g.music('silent');
        useUI.setState({ fade: 1 });
        await g.cinematic([
          {
            dur: 4.5, cam: V(0, 3, 12), look: eggP, dof: false,
            update: () => useUI.setState({ fade: 1 }),
            events: [
              { at: 0.6, fn: () => audio.sfx('heartbeat', 0.8) },
              { at: 2.4, fn: () => audio.sfx('heartbeat', 1) },
              { at: 4.1, fn: () => audio.sfx('heartbeat', 1.2) },
            ],
            lines: [{ at: 1.2, who: '', text: 'THUMP.', dur: 1 }, { at: 3.0, who: '', text: '...THUMP.', dur: 1 }],
          },
          {
            dur: 7, cam: V(4, 5, 26), camTo: V(1.5, 2.6, 8), look: eggP, fadeIn: 3, fov: 40,
            update: (k) => egg.setCrack(k * k * 0.6),
            events: [
              { at: 1.2, fn: () => audio.sfx('heartbeat', 1.3) },
              { at: 3.2, fn: () => audio.sfx('heartbeat', 1.5) },
              { at: 5.0, fn: () => { audio.sfx('heartbeat', 1.8); audio.sfx('crack'); g.shake(0.3); } },
              { at: 6.2, fn: () => { audio.sfx('crack'); } },
            ],
          },
          {
            dur: 4, cam: V(2.4, 1.1, 4.2), camTo: V(1.6, 0.9, 3.4), look: eggP, lookTo: () => g.player.pos.clone().setY(g.player.pos.y + 0.3), fov: 38,
            events: [
              { at: 0.8, fn: () => { egg.hatch(); audio.sfx('crack'); audio.sfx('boom', 0.3); g.flash('#cfe8ff'); g.bursts.emit(eggP(), { count: 120, color: '#bfe0ff', speed: 6, size: 0.5, life: 1.4 }); g.player.rig.group.visible = true; } },
            ],
            lines: [{ at: 1.6, who: '', text: 'A tiny serpent emerges. Its scales are almost transparent.', dur: 3 }],
          },
          {
            dur: 4.5, cam: front(g, 2.4, 0.4, 0.8), look: () => g.player.pos.clone().setY(g.player.pos.y + 6), lookTo: () => V(0, 30, 0), fov: 50,
            lines: [{ at: 0.4, who: 'THE VOICE', text: '"Don\'t look at the corpse."', dur: 3.6, voice: VO.dontLook }],
            events: [{ at: 0, fn: () => g.music('cavern') }],
          },
          {
            dur: 5, cam: V(-10, 4, 18), camTo: V(-20, 20, 26), look: V(0, 22, 0), lookTo: V(20, 30, -10), fov: 55,
            lines: [{ at: 0.5, who: 'THE VOICE', text: '"Look at what killed it."', dur: 3.5, voice: VO.lookKilled }],
          },
          {
            dur: 8, cam: V(0, 6, 14), camTo: V(20, 70, 110), look: V(0, 2, 0), lookTo: V(0, 0, -20), fov: 50, ease: 'inout',
            lines: [
              { at: 1.5, who: '', text: 'Thousands of enormous serpent skeletons.', dur: 3 },
              { at: 4.8, who: '', text: 'Every one of them killed the same way. Their heads are missing.', dur: 3.2 },
            ],
          },
          {
            dur: 3, cam: V(20, 70, 110), look: V(0, 0, -20), fov: 50, shake: 3,
            events: [{ at: 0.1, fn: () => { audio.sfx('boom', 2); g.shake(2.5); g.flash('#ff6a4a'); g.bursts.emit(V(70, 10, -8), { count: 200, color: '#ffae7a', speed: 16, size: 1.2, life: 1.6 }); } }],
            lines: [{ at: 0.3, who: '', text: 'BOOM.', dur: 1.4 }],
          },
          {
            dur: 6, cam: () => gp(g, 18, -2, 2), look: wP, fov: 45,
            update: (k, dt) => {
              walker.light.intensity = 900;
              walker.obj.position.x = 78 - k * 22;
              walker.obj.position.y = g.world.height(walker.obj.position.x, walker.obj.position.z);
              walker.walk(dt, 3);
              walker.aim(g.player.pos.clone().add(V(Math.sin(k * 6) * 6, 0, Math.cos(k * 5) * 4)));
            },
            events: [{ at: 0.4, fn: () => { audio.sfx('charge'); g.music(null, 2); } }],
            lines: [{ at: 1.5, who: '', text: 'Humans. Machines. Weapons. They are searching for the hatchling.', dur: 3.6 }],
          },
          {
            dur: 2.8, cam: front(g, 1.4, 0.15, 0.2), look: head(g, 0.15), fov: 30,
            lines: [{ at: 0.5, who: 'THE VOICE', text: '"Run."', dur: 2.2, voice: VO.run }],
          },
        ]);
        // ---- the escape
        const exit = gp(g, -62, -58);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 80, 20, 1, true).translate(0, 40, 0), shaftMaterial(new THREE.Color('#fff2d8').multiplyScalar(1.6), 0.45));
        shaft.position.copy(exit);
        g.stage.add(shaft);
        const exitLight = new THREE.PointLight('#ffe8c0', 120, 40, 1.5);
        exitLight.position.copy(exit).setY(exit.y + 6);
        g.stage.add(exitLight);
        g.field({ count: 22, kinds: { seed: 5, insect: 3, critter: 1 }, radius: 85 });
        g.music(null, 2);
        const spot = g.player.pos.clone();
        let exposure = 0;
        let debrisT = 3;
        g.hook((dt) => {
          const p = g.player;
          // walker pursuit
          const wp = walker.obj.position;
          const toP = V(p.pos.x - wp.x, 0, p.pos.z - wp.z);
          const d = toP.length();
          const move = d > 26 ? Math.min(7, (d - 26) * 0.8) : 0;
          if (d > 0.1) {
            wp.addScaledVector(toP.normalize(), move * dt);
            walker.obj.rotation.y = Math.atan2(toP.x, toP.z);
          }
          wp.y = g.world.height(wp.x, wp.z);
          walker.walk(dt, move > 0.5 ? 2.5 : 0.3);
          // sweeping searchlight hunts the hatchling
          const sweep = V(Math.sin(g.time * 0.9) * 7, 0, Math.cos(g.time * 0.7) * 7);
          spot.lerp(p.pos.clone().add(sweep), Math.min(1, dt * 1.2));
          spot.y = g.world.height(spot.x, spot.z);
          walker.aim(spot);
          if (Math.hypot(spot.x - p.pos.x, spot.z - p.pos.z) < 5) {
            exposure += dt;
            walker.light.color.setRGB(1, 0.15, 0.1);
          } else { exposure = Math.max(0, exposure - dt * 0.5); walker.light.color.setRGB(1, 0.4, 0.3); }
          if (exposure > 0.8) {
            exposure = -1.8;
            const eye = walker.obj.localToWorld(V(0, 9.2, 6.8));
            for (let i = 0; i < 3; i++) setTimeout(() => g.projectiles.fire(eye, g.player.pos.clone().add(V((Math.random() - 0.5) * 2, 0.3, (Math.random() - 0.5) * 2)), 24, '#ff3a2a', 1), i * 180);
            audio.sfx('laser');
            g.hint('The searchlight found you — keep moving!', 1800);
          }
          debrisT -= dt;
          if (debrisT <= 0) {
            debrisT = 2 + Math.random() * 1.5;
            g.hazards.meteor(p.pos.clone().addScaledVector(p.fwd, 6 + Math.random() * 8).add(V((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)), g, 2.6, 1.6, 1, '#9fc4ff');
          }
          shaft.material.uniforms.uOpacity.value = 0.4 + Math.sin(g.time * 2) * 0.08;
        });
        g.hint('A / D  or  ← / →  to steer    ·    SHIFT / W  to surge', 7000);
        g.say([{ who: 'THE VOICE', text: 'Follow the light. Eat what glows — you are too weak to survive as you are.' }]);
        await g.objective('Escape the cavern — reach the light', () => g.player.pos.distanceTo(exit) < 8, { marker: exit, sub: () => `${Math.round(g.player.pos.distanceTo(exit))} m` });
        await g.cinematic([
          {
            dur: 3.5, cam: behind(g, 6, 2.5), camTo: () => exit.clone().add(V(0, 20, 0)), look: () => exit.clone().setY(exit.y + 4), lookTo: () => exit.clone().setY(exit.y + 60), fov: 55, fadeOut: 1.5,
            events: [{ at: 0.2, fn: () => { g.flash('#fff4e0'); audio.sfx('whoosh'); } }],
            lines: [{ at: 0.4, who: '', text: 'Aeren slips into the light. Behind it, the machines howl.', dur: 3 }],
          },
        ]);
      },
    },
  ],
};

// ================================================================== CHAPTER 1: THE HATCHLING
const hatchling: ChapterDef = {
  id: 'hatchling',
  act: 'Act I',
  title: 'The Hatchling',
  subtitle: 'Small things must eat to survive.',
  quote: '“Your length is your weapon. Your tail is your shield.”',
  art: '/art/title.jpg',
  biome: 'ruins',
  reserved: [{ x: 58, z: -52, r: 16 }, { x: -52, z: 54, r: 14 }, { x: -38, z: 46, r: 12 }],
  start: { pos: [-20, 30], heading: Math.PI * 0.75, segments: 6, size: 0.65 },
  sections: [
    {
      id: 'eat',
      run: async (g) => {
        await g.cinematic([
          { dur: 5, cam: V(-60, 30, 60), camTo: V(-35, 12, 45), look: V(0, 0, 0), lookTo: head(g), fov: 50, fadeIn: 1.5, lines: [{ at: 1, who: '', text: 'Dusk over the old serpent kingdoms. The world is still beautiful — and still dying.', dur: 3.8 }] },
          { dur: 4, cam: front(g, 3, 0.8, 1), look: head(g), fov: 40, lines: [{ at: 0.3, who: 'THE VOICE', text: '"You are small. The world is not kind to small things. Eat."', dur: 3.6, voice: VO.eat }] },
        ]);
        g.field({ count: 28, kinds: { seed: 5, insect: 4, critter: 2 }, radius: 80 });
        const start = g.stats.eaten;
        g.hint('Glowing seeds, lightwings and burrowers make you grow. Burrowers flee — chase them!', 6000);
        await g.objective('Eat to grow', () => g.stats.eaten - start >= 12, { sub: () => `${Math.min(12, g.stats.eaten - start)} / 12 eaten` });
        g.say([{ who: 'THE VOICE', text: 'Good. Growth is not vanity. Every segment is a weapon — and a wall.' }]);
      },
    },
    {
      id: 'coil',
      start: { segments: 28 },
      run: async (g) => {
        if (g.player.segments < 26) g.player.grow(26 - Math.floor(g.player.segments));
        g.field({ count: 20, kinds: { seed: 5, insect: 3, critter: 2 }, radius: 80 });
        const drones: Drone[] = [];
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + 0.4;
          const d = new Drone(gp(g, g.player.pos.x + Math.cos(a) * 26, g.player.pos.z + Math.sin(a) * 26, 3), 30);
          d.minCoil = 10;
          drones.push(d);
          g.addEnemy(d);
        }
        g.music(null, 2);
        g.say([{ who: 'THE VOICE', text: 'Scavengers. The humans send them to find eggs like yours.' }, { who: 'THE VOICE', text: 'You cannot bite metal. But you can surround it — and squeeze.' }]);
        g.hint('COIL: HOLD a turn to curl tightly around an enemy until your head touches your body. Your body also BLOCKS their shots.', 9000);
        await g.objective('Crush the scavenger drones', () => drones.every((d) => !d.alive), { sub: () => `${drones.filter((d) => !d.alive).length} / 3 crushed`, marker: () => (drones.find((d) => d.alive)?.pos ?? g.player.pos) });
        g.music(null, 0);
        g.say([{ who: 'THE VOICE', text: 'There is a shrine to the east. Your people carved their history into it. Go.' }]);
      },
    },
    {
      id: 'shrine',
      start: { segments: 20 },
      run: async (g) => {
        const shrine = makeShrine();
        const sp = gp(g, 58, -52);
        shrine.group.position.copy(sp);
        shrine.group.rotation.y = Math.atan2(-sp.x, -sp.z) + Math.PI;
        g.stage.add(shrine.group);
        g.world.colliders.push({ x: sp.x, z: sp.z, r: 0.1 });
        g.field({ count: 16, kinds: { seed: 4, insect: 3 }, radius: 80 });
        await g.objective('Find the ancient shrine', () => g.player.pos.distanceTo(sp) < 14, { marker: sp });
        await g.interact(sp, 12, 'E — Touch the mural');
        const muralW = shrine.mural.getWorldPosition(V());
        const n = shrine.mural.getWorldDirection(V());
        await g.cinematic([
          { dur: 4, cam: () => muralW.clone().addScaledVector(n, 16).setY(muralW.y + 1), camTo: () => muralW.clone().addScaledVector(n, 8), look: muralW, fov: 45, lines: [{ at: 0.5, who: '', text: 'A mural. A gigantic serpent devouring its own tail. Seven smaller serpents around it.', dur: 3.4 }] },
          {
            dur: 4.5, cam: () => muralW.clone().addScaledVector(n, 8), camTo: () => muralW.clone().addScaledVector(n, 3.2), look: muralW, fov: 40, fadeOut: 1.5,
            update: (k) => { shrine.muralMat.emissiveIntensity = 0.06 + k * k * 3; },
            events: [{ at: 0.4, fn: () => { audio.sfx('memory'); g.player.jawTarget = 0; } }, { at: 2.5, fn: () => g.flash('#fff4e0') }],
            lines: [{ at: 0.8, who: 'THE VOICE', text: '"Touch it. Remember."', dur: 2.8 }],
          },
        ]);
        g.collectMemory('protect');
        await g.waitUntil(() => useUI.getState().memory === null);
      },
    },
  ],
};

// ================================================================== CHAPTER 2: THE MEMORY
const memory: ChapterDef = {
  id: 'memory',
  act: 'Act I',
  title: 'The Memory',
  subtitle: 'The memories do not agree.',
  quote: '“One memory says you were made to protect them. Another says you were made to end them.”',
  art: '/art/memory.jpg',
  biome: 'dream',
  reserved: [{ x: 40, z: -30, r: 6 }, { x: -45, z: 35, r: 6 }],
  start: { pos: [0, 0], heading: 0, segments: 20, size: 0.75 },
  sections: [
    {
      id: 'dream',
      run: async (g) => {
        g.player.rig.mat.transparent = true;
        await g.cinematic([
          { dur: 5, cam: V(0, 40, 40), camTo: V(6, 5, 12), look: V(0, 0, 0), lookTo: head(g), fov: 50, fadeIn: 2.5, lines: [{ at: 1.2, who: '', text: 'White silence. Mirrors hang in the air, each reflecting a different world.', dur: 3.6 }] },
          {
            dur: 6, cam: front(g, 4, 1.2, -1), look: head(g), fov: 38,
            lines: [
              { at: 0.3, who: 'THE VOICE', text: '"You have a name. You have always had one."', dur: 2.8 },
              { at: 3.2, who: 'THE VOICE', text: '"AEREN. Last child of the First Serpent."', dur: 2.8 },
            ],
          },
        ]);
        toast('AEREN', 'Last child of the First Serpent', 'boss', 4000);
        g.field({ count: 14, kinds: { essence: 3, seed: 2 }, radius: 60 });
        const dp = gp(g, 40, -30), np = gp(g, -45, 35);
        g.memory('destroy', dp);
        g.memory('never', np);
        g.say([{ who: 'THE VOICE', text: 'Your memories were broken when you were laid in the egg. Gather what remains.' }]);
        await g.objective('Gather the scattered memories', () => has('destroy') && has('never') && useUI.getState().memory === null, {
          sub: () => `${(has('destroy') ? 1 : 0) + (has('never') ? 1 : 0)} / 2 recovered`,
          marker: () => (has('destroy') ? np : dp),
        });
        await g.cinematic([
          {
            dur: 6, cam: front(g, 5, 2, 2), look: head(g), fov: 42, fadeOut: 2,
            lines: [
              { at: 0.3, who: 'AEREN', text: '"Protect them. Destroy them. Never made at all. Which one is true?"', dur: 3.2 },
              { at: 3.4, who: 'THE VOICE', text: '"Perhaps none. Perhaps all. Wake up, Aeren. The forest is waiting."', dur: 2.6 },
            ],
            events: [{ at: 4.5, fn: () => { audio.sfx('crack'); g.flash('#000000'); } }],
          },
        ]);
      },
    },
  ],
};

// ================================================================== CHAPTER 3: THE DEAD FOREST
const FRUITS = ['ember', 'moon', 'blood', 'storm', 'void'] as const;
const FRUIT_NAMES: Record<string, string> = { ember: 'Ember', moon: 'Moon', blood: 'Blood Root', storm: 'Storm', void: 'Void' };
const forest: ChapterDef = {
  id: 'forest',
  act: 'Act II',
  title: 'The Dead Forest',
  subtitle: 'Everything here is dying. Nothing here is allowed to die.',
  quote: '“Different food gives different gifts. What you eat is who you become.”',
  art: '/art/forest.jpg',
  biome: 'forest',
  start: { pos: [0, 0], heading: 0, segments: 20, size: 0.85 },
  sections: [
    {
      id: 'fruits',
      run: async (g) => {
        await g.cinematic([
          { dur: 6, cam: V(-50, 40, -60), camTo: V(-12, 8, -18), look: V(0, 4, 0), lookTo: head(g), fov: 50, fadeIn: 1.5, lines: [{ at: 1, who: '', text: 'Black trees. Dry rivers. A sky that has been red for a thousand years.', dur: 3.8 }] },
          { dur: 4.5, cam: front(g, 4, 1.5, 2), look: head(g), fov: 40, lines: [{ at: 0.3, who: 'THE VOICE', text: '"Strange fruit grows here, fed by the Core\'s leaking power. Each will change you."', dur: 3.8 }] },
        ]);
        const eaten = new Set<string>();
        g.onEat((p) => { if ((FRUITS as readonly string[]).includes(p.kind)) eaten.add(p.kind); });
        // one of each nearby, then a mixed field
        FRUITS.forEach((f, i) => {
          const a = (i / 5) * TAU;
          g.spawn(f, gp(g, Math.cos(a) * 24, Math.sin(a) * 24));
        });
        g.field({ count: 24, kinds: { seed: 4, insect: 2, critter: 2, ember: 1, moon: 1, blood: 1, storm: 1, void: 1 }, radius: 100 });
        const hidden = gp(g, -70, 55);
        g.memory('gentle', hidden, true);
        g.hint('Fruits grant temporary powers. MOON SIGHT reveals things hidden in the dark...', 7000);
        await g.objective('Taste the five fruits of the Dead Forest', () => eaten.size >= 5, {
          sub: () => FRUITS.map((f) => `${eaten.has(f) ? '◆' : '◇'} ${FRUIT_NAMES[f]}`).join('   '),
        });
        g.say([{ who: 'THE VOICE', text: 'Fire-skin. Night-sight. Regrowth. Speed. The void between things. Remember them — you will need every one.' }]);
      },
    },
    {
      id: 'hunted',
      start: { segments: 24 },
      run: async (g) => {
        g.field({ count: 26, kinds: { seed: 5, insect: 2, critter: 3, essence: 2, blood: 1, storm: 1 }, radius: 100 });
        const drones: Drone[] = [];
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          const d = new Drone(gp(g, Math.cos(a) * 60, Math.sin(a) * 60, 3));
          drones.push(d);
          g.addEnemy(d);
        }
        g.music(null, 1);
        g.say([{ who: 'THE VOICE', text: 'Something is following you through the trees. Something big. Grow — quickly.' }]);
        await g.objective('Grow strong enough to face what hunts you', () => g.player.segments >= 34, { sub: () => `${Math.floor(g.player.segments)} / 34 segments` });
        await g.cinematic([
          {
            dur: 4, cam: behind(g, 10, 5), look: front(g, 20, 0), fov: 50, shake: 1.5, fadeOut: 1.2,
            events: [{ at: 0.2, fn: () => { audio.sfx('roar', 0.7); audio.sfx('charge'); } }],
            lines: [{ at: 0.5, who: '', text: 'The ground splits. Metal screams beneath the ash.', dur: 3 }],
          },
        ]);
      },
    },
  ],
};

// ================================================================== CHAPTER 4: THE HARVESTER
const harvester: ChapterDef = {
  id: 'harvester',
  act: 'Act II',
  title: 'The Harvester',
  subtitle: 'It does not grow. It steals.',
  quote: '“Eat. Grow. Escape. Turn. Attack.”',
  art: '/art/forest.jpg',
  biome: 'harvester',
  start: { pos: [0, 30], heading: Math.PI, segments: 34, size: 0.95 },
  sections: [
    {
      id: 'boss',
      run: async (g) => {
        const boss = new Harvester(gp(g, 0, -30), g);
        boss.heading = 0;
        g.addEnemy(boss);
        const bp = () => boss.pos.clone().setY(boss.pos.y + 1);
        await g.cinematic([
          orbit(bp, 16, 4, -1.2, 0.4, 5, {
            fov: 42, shake: 0.8,
            events: [{ at: 0.3, fn: () => { audio.sfx('roar', 0.7); g.bursts.emit(boss.pos, { count: 200, color: '#6a4a3a', speed: 14, size: 1.4, life: 1.6 }); } }],
            lines: [{ at: 1.5, who: '', text: 'A mechanical serpent — built by humans to hunt what they could not grow.', dur: 3.2 }],
          }),
          { dur: 3, cam: front(g, 5, 1.6, -2), look: bp, fov: 40, events: [{ at: 0.2, fn: () => bossBanner('THE HARVESTER', 'Machine of the Last Kingdom') }] },
        ], { live: true });
        g.setBoss({ name: 'THE HARVESTER', title: 'Machine of the Last Kingdom', color: '#ff3a1a', hp: () => boss.hp / boss.maxHp });
        g.music(null, 3);
        g.field({ count: 24, kinds: { seed: 5, essence: 2, critter: 2, blood: 1, storm: 1 }, radius: 70 });
        g.hint('It HARVESTS your body on contact. Dodge its CHARGE — when it overheats, COIL around it!', 7000);
        boss.onPhase = (hp) => {
          if (hp === 2) {
            g.say([{ who: 'THE VOICE', text: 'It is calling for help. Keep moving!' }]);
            for (let i = 0; i < 2; i++) g.addEnemy(new Drone(gp(g, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 3)));
          }
          if (hp === 1) g.say([{ who: 'THE VOICE', text: 'It is breaking. Its pulses will tear you apart — stay clear of the rings.' }]);
        };
        await g.waitUntil(() => !boss.alive);
        g.setBoss(null);
        g.music(null, 1);
        g.projectiles.clear();
        for (const e of [...g.enemies]) if (e !== boss) g.removeEnemy(e);
        // aftermath: inside the machine
        const skull = makeSkeleton(7, 0.03, { length: 60 });
        skull.position.copy(boss.pos).setY(boss.pos.y + 0.6);
        g.stage.add(skull);
        await g.cinematic([
          orbit(bp, 12, 5, 0, 1.2, 4.5, {
            fov: 45,
            events: [{ at: 0.2, fn: () => { audio.sfx('boom', 1.5); g.shake(1.5); g.bursts.emit(boss.pos, { count: 300, color: '#ff7a2a', speed: 18, size: 1.2, life: 1.8 }); g.light(boss.pos, '#ff6a2a', 200, 1.2); } }],
            lines: [{ at: 1.5, who: '', text: 'The Harvester collapses. Its head splits open.', dur: 2.8 }],
          }),
          {
            dur: 7, cam: () => boss.pos.clone().add(V(2.5, 2.2, 2.5)), look: () => boss.pos.clone(), fov: 35,
            lines: [
              { at: 0.4, who: '', text: 'Inside — a human skeleton. A message scratched into the metal:', dur: 2.8 },
              { at: 3.3, who: 'THE MESSAGE', text: '"If you find the serpent... do not let it reach the ocean."', dur: 3.5 },
            ],
          },
        ]);
      },
    },
  ],
};

// ================================================================== CHAPTER 5: CITY OF BONES
const city: ChapterDef = {
  id: 'city',
  act: 'Act III',
  title: 'City of Bones',
  subtitle: 'Some worship serpents. Some fear them.',
  quote: '“Humans did not break the Cycle. They were trying to repair it.”',
  art: '/art/city.jpg',
  biome: 'city',
  reserved: [{ x: 0, z: -12, r: 6 }, { x: 55, z: 20, r: 7 }, { x: -50, z: 40, r: 7 }, { x: -20, z: -70, r: 7 }, { x: 70, z: -60, r: 12 }, { x: -80, z: -20, r: 6 }],
  start: { pos: [0, 20], heading: Math.PI, segments: 34, size: 1.05 },
  sections: [
    {
      id: 'oracle',
      run: async (g) => {
        const oraclePos = gp(g, 0, -12);
        const oracle = new Human(oraclePos, 'Oracle', '#e8d0a0', { staff: true, scale: 1.3 });
        g.stage.add(oracle.obj);
        const acolytes = [new Human(gp(g, -3, -14), 'Acolyte', '#6a1a14', { torch: true }), new Human(gp(g, 3, -14), 'Acolyte', '#6a1a14', { torch: true })];
        acolytes.forEach((a) => g.stage.add(a.obj));
        g.hook((dt) => { [oracle, ...acolytes].forEach((h) => h.update(dt, g.player.pos, g.world.height(h.pos.x, h.pos.z))); });
        await g.cinematic([
          { dur: 6, cam: V(80, 50, 80), camTo: V(20, 12, 30), look: V(0, 8, 0), lookTo: () => oraclePos.clone().setY(oraclePos.y + 2), fov: 50, fadeIn: 1.5, lines: [{ at: 1, who: '', text: 'The City of Bones. A human kingdom built inside the ribs of a dead god.', dur: 3.8 }] },
        ]);
        await g.objective('Approach the robed humans', () => g.player.pos.distanceTo(oraclePos) < 10, { marker: oraclePos });
        await g.interact(oraclePos, 10, 'E — Listen');
        await g.cinematic([
          {
            dur: 12, cam: () => oraclePos.clone().add(V(4, 2.5, 5)), look: () => oraclePos.clone().setY(oraclePos.y + 2), fov: 38,
            lines: [
              { at: 0.3, who: 'THE ORACLE', text: '"The hatchling returns. The old texts said you would rise from beneath the ruins."', dur: 3.6 },
              { at: 4.2, who: 'THE ORACLE', text: '"Not all of us fear you. But the Wardens do — and they hunt our pilgrims for hiding your kind."', dur: 3.8 },
              { at: 8.2, who: 'THE ORACLE', text: '"Protect them, serpent. Then I will show you the truth in the Archive."', dur: 3.6 },
            ],
          },
        ]);
      },
    },
    {
      id: 'pilgrims',
      run: async (g) => {
        const groups = [V(55, 0, 20), V(-50, 0, 40), V(-20, 0, -70)].map((c) => {
          const center = gp(g, c.x, c.z);
          const people = [0, 1, 2].map((i) => new Human(gp(g, c.x + Math.cos(i * 2.1) * 1.6, c.z + Math.sin(i * 2.1) * 1.6), 'Pilgrim', ['#c8a060', '#8a6a3a', '#a07a4a'][i], { torch: i === 0 }));
          people.forEach((p) => g.stage.add(p.obj));
          const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          dome.position.copy(center);
          g.stage.add(dome);
          return { center, people, dome, warded: false };
        });
        g.hook((dt) => groups.forEach((gr) => {
          gr.people.forEach((h) => h.update(dt, g.player.pos, g.world.height(h.pos.x, h.pos.z)));
          (gr.dome.material as THREE.MeshBasicMaterial).opacity = gr.warded ? 0.12 + Math.sin(g.time * 3) * 0.04 : 0;
        }));
        const drones: Drone[] = [];
        groups.forEach((gr, i) => {
          for (let k = 0; k < 2; k++) {
            const d = new Drone(gr.center.clone().add(V(8 + k * 4, 3, 6)), 60);
            d.target = () => (gr.warded ? null : gr.center.clone().setY(gr.center.y + 1));
            drones.push(d);
            g.addEnemy(d);
          }
        });
        g.onCoil((poly) => {
          for (const gr of groups) {
            if (gr.warded) continue;
            // inside the loop, or close to its centre (coils are forgiving)
            const { x, z } = gr.center;
            let cx = 0, cz = 0;
            for (const q of poly) { cx += q.x; cz += q.z; }
            cx /= poly.length; cz /= poly.length;
            let rr = 0;
            for (const q of poly) rr += Math.hypot(q.x - cx, q.z - cz);
            rr /= poly.length;
            const inside = pointInPoly(x, z, poly) || Math.hypot(x - cx, z - cz) < Math.max(4.5, rr * 1.8);
            if (inside) {
              gr.warded = true;
              g.projectiles.shields.push({ pos: gr.center.clone().setY(gr.center.y + 1), r: 4.2 });
              audio.sfx('memory');
              g.bursts.emit(gr.center, { count: 80, color: '#ffd27a', speed: 6, size: 0.7, life: 1.2 });
              g.say([{ who: 'PILGRIM', text: ['"The serpent shields us! Blessed coil!"', '"It... it protected us?"', '"Go, little god. We will pray for you."'][groups.filter((q) => q.warded).length - 1] ?? '"Thank you."' }]);
            }
          }
        });
        g.field({ count: 20, kinds: { seed: 5, critter: 2, essence: 2, blood: 1 }, radius: 100 });
        g.memory('engineers', gp(g, -80, -20));
        g.music(null, 2);
        g.hint('COIL around each group of pilgrims to raise a ward. Drones are firing at them!', 6000);
        await g.objective('Ward the pilgrims', () => groups.every((q) => q.warded), {
          sub: () => `${groups.filter((q) => q.warded).length} / 3 warded`,
          marker: () => groups.find((q) => !q.warded)?.center ?? g.player.pos,
        });
        g.music(null, 1);
        g.say([{ who: 'THE ORACLE', text: '"You protect what you were told to destroy. Come — the Archive is to the east."' }]);
      },
    },
    {
      id: 'archive',
      run: async (g) => {
        const ap = gp(g, 70, -60);
        const holo = makeHologram('#ffcf8a');
        holo.group.position.copy(ap).setY(ap.y + 6);
        holo.group.scale.setScalar(3.5);
        holo.group.visible = false;
        g.stage.add(holo.group);
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 1, 12), new THREE.MeshStandardMaterial({ color: '#8a7656', roughness: 0.8 }));
        plinth.position.copy(ap);
        g.stage.add(plinth);
        const mural = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: imageTexture('/art/mural.jpg'), emissive: '#ffffff', emissiveMap: imageTexture('/art/mural.jpg'), emissiveIntensity: 0.25 }));
        mural.position.copy(ap).add(V(0, 7, -9));
        g.stage.add(mural);
        g.hook(() => { holo.uniforms.uTime.value = g.time; holo.group.rotation.y = Math.atan2(g.player.pos.x - ap.x, g.player.pos.z - ap.z); });
        g.field({ count: 12, kinds: { seed: 4, essence: 2 }, radius: 100 });
        await g.objective('Enter the Archive', () => g.player.pos.distanceTo(ap) < 12, { marker: ap });
        await g.interact(ap, 12, 'E — Awaken the recording');
        const hp = () => holo.group.position.clone();
        await g.cinematic([
          {
            dur: 8, cam: () => ap.clone().add(V(10, 4, 10)), look: () => ap.clone().setY(ap.y + 5), fov: 45,
            events: [{ at: 0.5, fn: () => { holo.group.visible = true; audio.sfx('memory'); g.flash('#ffcf8a'); } }],
            lines: [
              { at: 1.0, who: 'THE ORACLE', text: '"Everyone believes humanity broke the Cycle. It is a lie."', dur: 3.2 },
              { at: 4.4, who: 'THE ORACLE', text: '"The Core was made by serpents. We only tried to repair it — after someone sabotaged it."', dur: 3.5 },
            ],
          },
          {
            dur: 6, cam: () => hp().add(V(0, -1, 14)), camTo: () => hp().add(V(0, -0.5, 8)), look: hp, fov: 40,
            events: [{ at: 0.2, fn: () => audio.sfx('deep') }],
            lines: [{ at: 0.6, who: 'THE FIRST SERPENT (RECORDING)', text: '"When the cycle breaks... one serpent must consume the others."', dur: 4.5, voice: VO.consume }],
          },
          { dur: 4.5, cam: () => mural.position.clone().add(V(0, 0, 11)), camTo: () => mural.position.clone().add(V(0, 0, 6)), look: () => mural.position.clone(), fov: 45, lines: [{ at: 0.4, who: '', text: 'Seven serpents. One survivor.', dur: 3.5 }] },
          {
            dur: 6, cam: front(g, 8, 3, 3), camTo: front(g, 2.5, 0.6, 0.6), look: head(g), fov: 40,
            events: [{ at: 0.3, fn: () => g.music(null, 1) }],
            lines: [
              { at: 0.5, who: '', text: 'Aeren wasn\'t born to save the serpents.', dur: 2.6 },
              { at: 3.2, who: '', text: 'Aeren was born to eat them.', dur: 2.8 },
            ],
          },
          {
            dur: 6, cam: () => ap.clone().add(V(-6, 3, 8)), look: head(g), fov: 45, fadeOut: 1.5,
            lines: [{ at: 0.3, who: 'THE ORACLE', text: '"Seven Eternals still live, each ruling a dying land. Find them, child of the First. The Cycle is waiting for you."', dur: 5 }],
          },
        ]);
        toast('THE SEVEN', 'Find and consume the seven Eternals', 'boss', 4200);
      },
    },
  ],
};

// ================================================================== THE SEVEN (factory)
interface EternalScript {
  id: EternalId;
  biome: string;
  size: number;
  subtitle: string;
  quote: string;
  intro: string[];
  last: string;
  memory: { id: string; pos: [number, number] };
  field: Record<string, number>;
  hint: string;
  setup?: (g: Game, boss: EternalBoss) => void;
  start?: [number, number];
}

function eternalChapter(e: EternalScript, index: number): ChapterDef {
  const def = ETERNALS[e.id];
  return {
    id: e.id,
    act: `Act IV · The Seven · ${index + 1}/7`,
    title: `${def.name}`,
    subtitle: def.title,
    quote: e.quote,
    art: '/art/seven.jpg',
    biome: e.biome,
    reserved: [{ x: e.memory.pos[0], z: e.memory.pos[1], r: 5 }],
    start: { pos: e.start ?? [0, 45], heading: Math.PI, segments: 34 + index * 3, size: e.size },
    eternalsConsumed: index,
    sections: [
      {
        id: 'fight',
        run: async (g) => {
          const boss = new EternalBoss(def, gp(g, 0, -25), g, g.hazards);
          boss.heading = 0;
          g.addEnemy(boss);
          if (e.id === 'stone') {
            boss.mode = 'dormant';
            boss.yOff = boss.yTarget = -def.radius * 1.3;
          }
          const bp = () => boss.pos.clone().setY(boss.pos.y + def.radius);
          const shots: Shot[] = [
            { dur: 4, cam: V(-30, 25, 70), camTo: V(-10, 8, 55), look: V(0, 3, 0), lookTo: bp, fov: 50, fadeIn: 1.5, lines: [{ at: 0.8, who: '', text: e.intro[0], dur: 3 }] },
          ];
          if (e.id === 'stone') {
            shots.push({
              dur: 5, cam: () => boss.pos.clone().add(V(20, 8, 20)), look: bp, fov: 45, shake: 2,
              events: [{ at: 1, fn: () => { boss.yTarget = 0; audio.sfx('roar', 0.35); audio.sfx('boom', 2); g.shake(2.5); } }],
              lines: [{ at: 0.3, who: '', text: 'Then... the mountain moves.', dur: 3 }],
            });
          }
          shots.push(
            orbit(bp, def.radius * 8, def.radius * 2, -0.6, 0.6, 5, {
              fov: 42,
              events: [{ at: 0.2, fn: () => audio.sfx('roar', 1 / Math.sqrt(def.radius)) }],
              lines: e.intro.slice(1).map((t, i) => ({ at: 0.4 + i * 2.4, who: def.name, text: t, dur: 2.3 })),
            }),
            { dur: 3, cam: front(g, 5, 1.6, -2), look: bp, fov: 40, events: [{ at: 0.2, fn: () => bossBanner(def.name, def.title) }] },
          );
          const wasDormant = e.id === 'stone';
          await g.cinematic(shots, { live: !wasDormant });
          if (boss.mode === 'dormant') boss.mode = 'roam';
          g.setBoss({ name: def.name, title: def.title, color: def.color, hp: () => Math.max(0, boss.hp) / boss.maxHp });
          g.music(null, 3);
          g.field({ count: 22, kinds: e.field as any, radius: g.world.radius * 0.85 });
          g.memory(e.memory.id, gp(g, e.memory.pos[0], e.memory.pos[1]));
          g.hint(e.hint, 8000);
          boss.onHit = (hp) => {
            if (hp > 0) g.say([{ who: def.name, text: ['"You bite like the First..."', '"Again? Hungry little thing."', '"Enough!"', '"Is this what I was waiting for?"'][boss.maxHp - hp - 1] ?? '"..."', dur: 2.4 }]);
          };
          e.setup?.(g, boss);
          await g.waitUntil(() => !boss.alive);
          await absorbEternal(g, boss, e.last, index);
        },
      },
    ],
  };
}

const SEVEN: EternalScript[] = [
  {
    id: 'ember', biome: 'ember', size: 1.2, start: [30, 45],
    subtitle: 'The Burning Coil', quote: '“Everything that burns was always going to.”',
    intro: ['A land of lava rivers and black glass. The air itself is burning.', '"Little hatchling."', '"You smell of the First. Have you come to eat me?"'],
    last: '"Burn well, little one... it was always going to end in fire."',
    memory: { id: 'ignis', pos: [60, 55] },
    field: { seed: 4, ember: 2, essence: 1, blood: 1 },
    hint: 'Bite the glowing core at the TAIL. Ignis leaves burning trails — eat EMBER FRUIT to walk through fire.',
  },
  {
    id: 'tide', biome: 'tide', size: 1.3,
    subtitle: 'Mother of the Deep', quote: '“Every river returns to the sea. Every serpent returns to the egg.”',
    intro: ['Beneath the waves, the ruins of a drowned temple.', '"Child of the First..."', '"You are too young to drown. Let me teach you."'],
    last: '"Return... every river returns..."',
    memory: { id: 'thalassa', pos: [-55, -50] },
    field: { seed: 4, essence: 2, blood: 1, storm: 1 },
    hint: 'Thalassa DIVES and erupts beneath you — watch for the blue rings. Bite her tail while she is surfaced. Avoid the whirlpools.',
    setup: (g) => { g.hazards.whirlpool(gp(g, 30, 10), 10, 6); g.hazards.whirlpool(gp(g, -35, -20), 9, 6); },
  },
  {
    id: 'gale', biome: 'gale', size: 1.38, start: [0, 12],
    subtitle: 'Breath Between Worlds', quote: '“To forget is to be free.”',
    intro: ['Islands adrift above an endless sky. One wrong turn, and the abyss takes you.', '"Such a small thing, crawling on my islands."', '"Can you fly, hatchling? No? Then fall."'],
    last: '"At last... something heavier than the wind..."',
    memory: { id: 'zephyra', pos: [14, 62] },
    field: { seed: 5, storm: 2, essence: 1 },
    hint: 'Zephyra flies too high to reach — wait for her to SWOOP low, then bite her tail. Gales will push you toward the edges!',
  },
  {
    id: 'root', biome: 'root', size: 1.46,
    subtitle: 'The Grove That Hungers', quote: '“Hunger is how the world says: continue.”',
    intro: ['An ancient grove, green in a dying world. The trees are watching.', '"The roots told me you were coming."', '"I will feed you to them, as I have fed everything else."'],
    last: '"Continue... little hunger... continue..."',
    memory: { id: 'sylvara', pos: [62, -40] },
    field: { seed: 4, blood: 2, critter: 2, essence: 1 },
    hint: 'Walls of thorned roots erupt ahead of you — watch the green rings and turn early. Bite Sylvara\'s tail.',
  },
  {
    id: 'stone', biome: 'stone', size: 1.55,
    subtitle: 'The Mountain That Moves', quote: '“They were so brief. Like sparks.”',
    intro: ['A grey range of peaks. One ridge is shaped strangely, like a spine...', '"...I have slept for ten thousand years."', '"And you woke me for THIS?"'],
    last: '"Brief... so brief... like sparks..."',
    memory: { id: 'korrath', pos: [-60, 45] },
    field: { seed: 4, essence: 2, blood: 1, storm: 1 },
    hint: 'Korrath is colossal and slow — never meet him head on. Dodge the rockfall and bite his tail.',
  },
  {
    id: 'void', biome: 'void', size: 1.62,
    subtitle: 'Your Shadow, Hungry', quote: '“I am what you will be if you stop choosing.”',
    intro: ['Darkness. Only your own light. Something moves at the edge of it — exactly as you move.', '"..."', '"I am you. Every move you make, I make."'],
    last: '"Choose... always choose... or become me..."',
    memory: { id: 'nihil', pos: [45, 50] },
    field: { seed: 4, void: 2, moon: 1, essence: 1 },
    hint: 'Nihil MIRRORS your movement and cannot be hurt. Eat a VOID CRYSTAL to break the reflection — then bite its tail while it is stunned. MOON SIGHT reveals it.',
    setup: (g, boss) => {
      g.onEat((p) => {
        if (p.kind === 'void' && boss.alive) {
          boss.stun(5.5);
          g.hint('The reflection shatters — NIHIL is stunned! Bite its tail!', 3000);
          audio.sfx('crack');
          g.flash('#b06aff');
        }
      });
    },
  },
  {
    id: 'astra', biome: 'astra', size: 1.7,
    subtitle: 'Keeper of the Hours', quote: '“I saw every ending. I never learned which was true.”',
    intro: ['A floor of stars. The sky is a clock. Time pools here like water.', '"I have watched this moment ten thousand times."', '"In some, you win. Shall we find out which this is?"'],
    last: '"Ah... so THIS is the ending... how lovely..."',
    memory: { id: 'astra', pos: [-50, -55] },
    field: { seed: 4, essence: 2, storm: 1, blood: 1 },
    hint: 'Astra spawns ECHOES of your past movements and REWINDS time. Avoid your echoes — bite Astra\'s tail.',
    setup: (g, boss) => {
      let echoT = 6, rewT = 15;
      g.hook((dt) => {
        if (!boss.alive || boss.mode === 'dormant') return;
        echoT -= dt; rewT -= dt;
        if (echoT <= 0) {
          echoT = 7;
          if (g.player.history.length > 30) {
            g.addEnemy(new Echo([...g.player.history], Math.min(20, g.player.length * 0.6), g));
            g.hint('An ECHO of your past follows your old path!', 2000);
            audio.sfx('rewind');
          }
        }
        if (rewT <= 0) {
          rewT = 16;
          const h = g.player.history;
          if (h.length > 30) {
            const pt = h[h.length - 30];
            g.flash('#ffd28a');
            audio.sfx('rewind');
            g.player.place(gp(g, pt.x, pt.z), pt.h, g.world);
            g.snapCamera();
            g.hint('Time REWINDS!', 1800);
          }
        }
      });
    },
  },
];

// ================================================================== THE OCEAN
const ocean: ChapterDef = {
  id: 'ocean',
  act: 'Act V',
  title: 'The Ocean',
  subtitle: 'Do not let it reach the ocean.',
  quote: '“The ancient serpent isn\'t wrapped around the world.”',
  art: '/art/ocean.jpg',
  biome: 'ocean',
  start: { pos: [0, 80], heading: Math.PI, segments: 50, size: 1.78 },
  eternalsConsumed: 7,
  sections: [
    {
      id: 'descent',
      run: async (g) => {
        const { ring, uniforms } = makeWorldRing(62);
        ring.position.copy(gp(g, 0, -10, -2));
        g.stage.add(ring);
        g.hook(() => (uniforms.uTime.value = g.time));
        const cp = () => ring.position.clone().setY(ring.position.y + 6);
        await g.cinematic([
          { dur: 6, cam: V(0, 60, 120), camTo: V(20, 20, 95), look: V(0, 0, 0), lookTo: cp, fov: 55, fadeIn: 2, lines: [{ at: 1, who: '', text: 'The bottom of the ocean. A circular structure, so vast its edges vanish into the dark.', dur: 4 }] },
          { dur: 5, cam: front(g, 6, 2, 2), look: head(g), fov: 40, lines: [{ at: 0.3, who: 'THE VOICE', text: '"You have eaten all seven. Now you must see what they were guarding."', dur: 4 }] },
        ]);
        g.field({ count: 16, kinds: { seed: 4, essence: 2 }, radius: 100 });
        g.hazards.whirlpool(gp(g, 40, 30), 9, 5);
        g.memory('sleeper', gp(g, -62, -10));
        const wps = [gp(g, 55, 20), gp(g, -30, -60), gp(g, 0, -10)];
        for (let i = 0; i < wps.length; i++) {
          const w = wps[i];
          await g.objective(i < 2 ? 'Follow the glowing runes along the ring' : 'Descend into the heart of the ring', () => g.player.pos.distanceTo(w) < 8, { marker: w, sub: () => `Rune ${i + 1} / 3` });
          audio.sfx('bell');
          g.bursts.emit(w, { count: 80, color: '#3affd8', speed: 8, size: 0.8, life: 1.2 });
          if (i === 0) g.say([{ who: 'THE VOICE', text: 'These are not carvings. Look closer. They are scales.' }]);
          if (i === 1) g.say([{ who: 'THE VOICE', text: 'It is not a structure, Aeren. It is a bone.' }]);
        }
      },
    },
    {
      id: 'revelation',
      run: async (g) => {
        const cos = makeCosmos();
        g.stage.add(cos.group);
        const world = g.world;
        const fog = g.scene.fog;
        const bg = g.scene.background;
        const setCosmic = (on: boolean) => {
          g.scene.fog = on ? null : fog;
          g.scene.background = on ? new THREE.Color('#000000') : bg;
          world.sky.visible = !on;
        };
        const C = cos.center;
        await g.cinematic([
          {
            dur: 3, cam: behind(g, 5, 3), camTo: () => g.player.pos.clone().add(V(0, 40, 0)), look: head(g), fov: 50, fadeOut: 1,
            events: [{ at: 0.2, fn: () => { audio.sfx('deep'); g.flash('#3affd8'); } }],
          },
          {
            dur: 8, cam: C.clone().add(V(0, 20, 70)), camTo: C.clone().add(V(40, 60, 190)), look: C, fov: 45, fadeIn: 1.5,
            events: [{ at: 0, fn: () => setCosmic(true) }],
            update: (k) => { cos.planet.rotation.y = k * 0.8; },
            lines: [{ at: 1.5, who: '', text: 'The ancient serpent isn\'t wrapped around the world.', dur: 3.5 }],
          },
          {
            dur: 8, cam: C.clone().add(V(40, 60, 190)), camTo: C.clone().add(V(-30, 25, 110)), look: C, fov: 45,
            update: (k) => {
              cos.planetMat.opacity = 1 - Math.min(1, k * 1.6) * 0.8;
              cos.planetMat.depthWrite = cos.planetMat.opacity > 0.9;
              cos.serpent.visible = k > 0.1;
              cos.uniforms.uTime.value = k * 10;
              cos.rim.intensity = k * 300;
              cos.planet.rotation.y = 0.8 + k * 0.5;
              cos.serpent.rotation.y = k * 0.6;
            },
            events: [{ at: 0.5, fn: () => audio.sfx('memory') }],
            lines: [{ at: 1.0, who: '', text: 'The world is wrapped around the serpent.', dur: 4 }],
          },
          {
            dur: 12, cam: C.clone().add(V(-30, 25, 110)), camTo: C.clone().add(V(0, 5, 62)), look: C, fov: 42, fadeOut: 1.5,
            update: (k) => { cos.serpent.rotation.y = 0.6 + k * 0.4; },
            lines: [
              { at: 0.4, who: 'THE VOICE', text: '"The First Serpent is not dead. It is asleep."', dur: 3.5, voice: VO.asleep },
              { at: 4.3, who: 'THE VOICE', text: '"The Eternal Core is not keeping the world alive. It is keeping the First Serpent asleep."', dur: 4.5 },
              { at: 9.0, who: 'THE VOICE', text: '"Destroy the Core — and it wakes. Leave it — and the world slowly dies."', dur: 3 },
            ],
          },
        ]);
        setCosmic(false);
        cos.group.visible = false;
      },
    },
    {
      id: 'choice',
      run: async (g) => {
        g.snapCamera();
        const pick = await g.choice('The Core beneath the ocean trembles. What will you do?', [
          { id: 'wake', label: 'Wake the Serpent', desc: 'Crack the Core. Let the Creator open its eyes — whatever it sees.' },
          { id: 'die', label: 'Let the World Die', desc: 'Leave the seal intact. The world fades slowly, but the Sleeper sleeps.' },
        ], 'This choice will be remembered.');
        updateSave((s) => { s.oceanChoice = pick as 'wake' | 'die'; });
        await g.cinematic([
          {
            dur: 5, cam: front(g, 6, 2, 2), look: head(g), fov: 42, shake: 1, fadeOut: 1.5,
            events: [{ at: 0.4, fn: () => { audio.sfx('boom', 2); g.shake(2); g.flash('#ffffff'); } }],
            lines: [{ at: 0.6, who: '', text: pick === 'wake' ? 'Aeren strikes the Core. A crack runs through the ocean floor — and through the sky.' : 'Aeren turns away from the Core. For a moment, nothing happens. Then the ground screams.', dur: 4 }],
          },
        ]);
      },
    },
  ],
};

// ================================================================== THE FALL
const fall: ChapterDef = {
  id: 'fall',
  act: 'Act VI',
  title: 'The Fall',
  subtitle: 'Get to the center of the world.',
  quote: '“Regardless of the choice, something goes wrong.”',
  art: '/art/fall.jpg',
  biome: 'fall',
  start: { pos: [fallPathX(FALL_START_Z + 30), FALL_START_Z + 30], heading: 0, segments: 50, size: 1.8 },
  eternalsConsumed: 7,
  sections: [
    {
      id: 'run',
      run: async (g) => {
        const choice = useUI.getState().save.oceanChoice;
        await g.cinematic([
          { dur: 5, cam: () => g.player.pos.clone().add(V(-20, 30, -30)), camTo: () => g.player.pos.clone().add(V(10, 14, -18)), look: () => g.player.pos.clone().add(V(0, 20, 60)), fov: 55, fadeIn: 1.5, shake: 1, lines: [{ at: 0.8, who: '', text: 'The sky cracks. Gravity breaks. Oceans rise. Cities fall.', dur: 3.8 }] },
          {
            dur: 5, cam: front(g, 6, 2, 2), look: head(g), fov: 42,
            lines: [{ at: 0.3, who: 'THE VOICE', text: choice === 'wake' ? '"You woke it — and the Eternals\' deaths have shattered the seal. The world is folding in on itself!"' : '"The Eternals are dead. Without them the Core collapses anyway. The world is folding in on itself!"', dur: 4.4 }],
          },
          { dur: 3, cam: behind(g, 8, 3), look: front(g, 30, 2), fov: 60, lines: [{ at: 0.2, who: 'THE VOICE', text: '"GO. To the center of the world. NOW."', dur: 2.6 }] },
        ]);
        g.hazards.startCollapse(FALL_START_Z - 20, 8.6);
        g.field({ count: 22, kinds: { seed: 5, storm: 2, blood: 1, essence: 2 }, alongFall: true });
        g.music(null, 3);
        const goal = gp(g, fallPathX(FALL_END_Z), FALL_END_Z);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4e0').multiplyScalar(4), fog: false }));
        beacon.position.copy(goal).setY(goal.y + 25);
        g.stage.add(beacon);
        let metT = 2;
        g.hook((dt) => {
          metT -= dt;
          const p = g.player;
          if (metT <= 0) {
            metT = 1.1 + Math.random() * 0.8;
            const z = p.pos.z + 12 + Math.random() * 30;
            g.hazards.meteor(gp(g, fallPathX(z) + (Math.random() - 0.5) * 34, z), g, 3.5 + Math.random() * 2, 1.6, 2, '#ffae6a');
          }
          if (g.hazards.collapse) g.hazards.collapse.speed = 8.6 + Math.max(0, (p.pos.z - FALL_START_Z) / 800) * 3;
          beacon.scale.setScalar(1 + Math.sin(g.time * 3) * 0.05);
        });
        g.hint('Outrun the collapse! SURGE with SHIFT/W. Storm Berries make you faster.', 6000);
        await g.objective('Reach the Center of the World', () => g.player.pos.z > FALL_END_Z - 6, { marker: goal, sub: () => `${Math.max(0, Math.round(FALL_END_Z - g.player.pos.z))} m` });
        g.hazards.clear(g);
        await g.cinematic([
          {
            dur: 4, cam: behind(g, 8, 4), camTo: () => goal.clone().add(V(0, 30, -20)), look: () => beacon.position, fov: 60, fadeOut: 1.5,
            events: [{ at: 0.4, fn: () => { g.flash('#ffffff'); audio.sfx('whoosh'); audio.sfx('deep'); } }],
            lines: [{ at: 0.5, who: '', text: 'Aeren dives into the light at the heart of the world.', dur: 3 }],
          },
        ]);
      },
    },
  ],
};

// ================================================================== THE FIRST SERPENT
const first: ChapterDef = {
  id: 'first',
  act: 'Act VII',
  title: 'The First Serpent',
  subtitle: 'There is no villain. There is only the Creator.',
  quote: '“You have mistaken the cycle for a prison.”',
  art: '/art/first.jpg',
  biome: 'final',
  start: { pos: [0, 30], heading: Math.PI, segments: 52, size: 1.85 },
  eternalsConsumed: 7,
  sections: [
    {
      id: 'meeting',
      run: async (g) => {
        const fs = new FirstSerpent(g);
        g.addEnemy(fs);
        (g as any).__first = fs;
        const hp = () => fs.pos.clone();
        await g.cinematic([
          { dur: 7, cam: V(-40, 8, 80), camTo: V(-10, 30, 60), look: V(0, 20, 0), lookTo: hp, fov: 55, fadeIn: 2, lines: [{ at: 1, who: '', text: 'The center of the world. No villain. No evil god.', dur: 3 }, { at: 4.2, who: '', text: 'Only the First Serpent.', dur: 2.6 }] },
          { dur: 6, cam: front(g, 6, 1, 3), look: hp, fov: 45, lines: [{ at: 0.5, who: 'THE FIRST SERPENT', text: '"You have mistaken the cycle for a prison."', dur: 4, voice: VO.prison }] },
          { dur: 4, cam: front(g, 2.5, 0.5, 0.5), look: head(g), fov: 36, lines: [{ at: 0.3, who: 'AEREN', text: '"Why did you create me?"', dur: 3.2 }] },
          { dur: 5, cam: () => fs.pos.clone().add(V(14, -4, 20)), look: hp, fov: 40, events: [{ at: 0.2, fn: () => audio.sfx('deep') }], lines: [{ at: 0.4, who: 'THE FIRST SERPENT', text: '"Because I was afraid to die."', dur: 4, voice: VO.afraid }] },
          { dur: 3, cam: () => fs.pos.clone().add(V(14, -4, 20)), look: hp, fov: 38, lines: [{ at: 0.2, who: '', text: '...', dur: 2 }] },
          { dur: 6, cam: () => fs.pos.clone().add(V(8, -2, 12)), look: hp, fov: 34, lines: [{ at: 0.3, who: 'THE FIRST SERPENT', text: '"So I created something that could kill me."', dur: 4.5, voice: VO.killMe }] },
          { dur: 4, cam: behind(g, 7, 3), look: hp, fov: 50, events: [{ at: 0.5, fn: () => { audio.sfx('roar', 0.4); g.shake(2); bossBanner('THE FIRST SERPENT', 'Creator of the Cycle'); } }] },
        ], { live: true });
      },
    },
    {
      id: 'hearts',
      run: async (g) => {
        let fs = (g as any).__first as FirstSerpent | undefined;
        if (!fs || !g.enemies.includes(fs)) { fs = new FirstSerpent(g); g.addEnemy(fs); (g as any).__first = fs; }
        const f = fs;
        f.startFight();
        f.slamming = true;
        const hearts = f.archBases.map((b) => g.spawn('heart', b.clone().setY(b.y + 1.8)));
        g.setBoss({ name: 'THE FIRST SERPENT', title: 'Creator of the Cycle', color: '#ffcf8a', hp: () => 0.4 + 0.6 * (hearts.filter((h) => g.pickups.items.includes(h)).length / 5) });
        g.music(null, 3);
        g.field({ count: 20, kinds: { seed: 5, essence: 2, blood: 1, storm: 1 }, radius: 110 });
        g.hint('Devour the HEART NODES at the base of each colossal arch. Dodge the head slam!', 7000);
        await g.objective('Devour the Heart Nodes', () => hearts.every((h) => !g.pickups.items.includes(h)), {
          sub: () => `${hearts.filter((h) => !g.pickups.items.includes(h)).length} / 5 devoured`,
          marker: () => hearts.find((h) => g.pickups.items.includes(h))?.pos ?? g.player.pos,
        });
        f.slamming = false;
        await g.cinematic([
          {
            dur: 6, cam: front(g, 5, 1.5, 3), camTo: front(g, 16, 8, 10), look: head(g), fov: 45,
            events: [
              { at: 0.5, fn: () => { g.player.targetSize = 3.0; g.player.grow(25); audio.sfx('memory'); g.flash('#ffcf8a'); } },
              { at: 3, fn: () => audio.sfx('roar', 0.6) },
            ],
            lines: [{ at: 0.8, who: '', text: 'Five hearts of the Creator burn inside Aeren. Aeren grows.', dur: 3.6 }],
          },
        ]);
      },
    },
    {
      id: 'bind',
      start: { size: 3.0, segments: 70 },
      run: async (g) => {
        let fs = (g as any).__first as FirstSerpent | undefined;
        if (!fs || !g.enemies.includes(fs)) { fs = new FirstSerpent(g); g.addEnemy(fs); fs.startFight(); (g as any).__first = fs; }
        const f = fs;
        g.player.targetSize = 3.0;
        f.slamming = true;
        f.minCoil = 30;
        f.coilHits = 0;
        g.setBoss({ name: 'THE FIRST SERPENT', title: 'Creator of the Cycle', color: '#ffcf8a', hp: () => 0.4 * (1 - f.coilHits / f.coilNeeded) });
        g.field({ count: 20, kinds: { seed: 5, essence: 2, blood: 1 }, radius: 110 });
        f.onCoilHit = (n) => g.say([{ who: 'THE FIRST SERPENT', text: ['"Yes... tighter..."', '"I can feel it — the end..."', '"...thank you."'][n - 1] ?? '', dur: 2.5 }]);
        g.hint('When the head slams into the ground, COIL around it! (3 times)', 7000);
        await g.objective('Bind the First Serpent', () => f.coilHits >= f.coilNeeded, { sub: () => `${f.coilHits} / ${f.coilNeeded} coils`, marker: () => f.pos });
        g.setBoss(null);
        f.slamming = false;
        f.mode = 'idle';
        const hp = () => f.pos.clone();
        await g.cinematic([
          { dur: 4, cam: behind(g, 14, 6), look: hp, fov: 50, events: [{ at: 0.3, fn: () => audio.sfx('roar', 0.35) }], lines: [{ at: 0.4, who: 'THE FIRST SERPENT', text: '"Not like this. Come inside, child. See what you are killing."', dur: 3.5 }] },
          {
            dur: 4, cam: front(g, 10, 3, 4), look: head(g), fov: 45,
            update: (k) => { f.pos.lerp(g.player.pos.clone().setY(g.player.pos.y + 4), k * 0.15); f.rig.jaw = 1; },
            events: [{ at: 1.5, fn: () => { g.shake(2); audio.sfx('bite'); audio.sfx('boom', 1.5); } }],
          },
          { dur: 3, cam: () => f.pos.clone().add(V(0, 1, 0)), look: head(g), fov: 70, fadeOut: 1.2, lines: [{ at: 0.2, who: '', text: 'The First Serpent swallows Aeren whole.', dur: 2.6 }] },
        ], { live: false });
      },
    },
  ],
};

// ================================================================== INSIDE THE SERPENT + THE CHOICE
const ECHOES = [
  { pos: [55, 30], who: 'THE ORACLE', text: '"You protect what you were told to destroy."' },
  { pos: [-50, 45], who: 'IGNIS', text: '"Everything that burns was always going to."' },
  { pos: [-40, -55], who: 'THALASSA', text: '"Every serpent returns to the egg."' },
  { pos: [60, -45], who: 'NIHIL', text: '"Choose... always choose."' },
  { pos: [0, 75], who: 'THE MESSAGE', text: '"Do not let it reach the ocean."' },
];

const inside: ChapterDef = {
  id: 'inside',
  act: 'Act VIII – X',
  title: 'Inside the Serpent',
  subtitle: 'Forests. Cities. Oceans. Memories. Everything you have been.',
  quote: '“Every beginning is a memory of an ending.”',
  art: '/art/memory.jpg',
  biome: 'inside',
  reserved: [{ x: 0, z: 0, r: 22 }, ...ECHOES.map((e) => ({ x: e.pos[0], z: e.pos[1], r: 5 })), { x: -75, z: 5, r: 5 }],
  start: { pos: [0, 60], heading: Math.PI, segments: 60, size: 2.2 },
  eternalsConsumed: 7,
  final: true,
  sections: [
    {
      id: 'echoes',
      run: async (g) => {
        await g.cinematic([
          { dur: 6, cam: V(0, 50, 120), camTo: V(10, 14, 80), look: V(0, 5, 0), lookTo: head(g), fov: 55, fadeIn: 2.5, lines: [{ at: 1, who: '', text: 'Inside the First Serpent there is an entire world.', dur: 3.2 }, { at: 4.2, who: '', text: 'Everything Aeren has ever experienced.', dur: 2 }] },
        ]);
        const found = new Set<number>();
        const echoItems = ECHOES.map((e, i) => g.spawn('essence', gp(g, e.pos[0], e.pos[1]), { data: { echo: i }, scale: 2.2 }));
        g.onEat((p) => {
          const d = p.data as { echo?: number } | undefined;
          if (d && d.echo !== undefined) {
            found.add(d.echo);
            const e = ECHOES[d.echo];
            audio.sfx('memory');
            g.say([{ who: e.who, text: e.text, dur: 3.2 }]);
          }
        });
        g.memory('fear', gp(g, -75, 5));
        g.field({ count: 16, kinds: { seed: 4, essence: 1, blood: 1 }, radius: 100 });
        await g.objective('Gather the echoes of your journey', () => found.size >= ECHOES.length, {
          sub: () => `${found.size} / ${ECHOES.length} echoes`,
          marker: () => echoItems.find((it) => g.pickups.items.includes(it))?.pos ?? g.player.pos,
        });
      },
    },
    {
      id: 'heart',
      run: async (g) => {
        const heart = makeHeart();
        heart.group.position.copy(gp(g, 0, 0, 3));
        g.stage.add(heart.group);
        g.world.colliders.push({ x: 0, z: 0, r: 5 });
        g.hook(() => heart.update(g.time));
        const hp = heart.group.position;
        await g.objective('Reach the Heart', () => Math.hypot(g.player.pos.x, g.player.pos.z) < 16, { marker: hp.clone() });
        await g.interact(hp.clone(), 16, 'E — Face the Heart');
        const all = MEMORY_IDS.every((id) => has(id));
        const choice = useUI.getState().save.oceanChoice;
        await g.cinematic([
          {
            dur: 6, cam: () => hp.clone().add(V(20, 6, 20)), look: () => hp.clone().setY(hp.y + 4), fov: 45,
            lines: [
              { at: 0.4, who: 'THE FIRST SERPENT', text: choice === 'wake' ? '"You woke me, and I did not fear it. Strange."' : '"You let me sleep, and still you came. Strange."', dur: 3 },
              { at: 3.4, who: 'THE FIRST SERPENT', text: '"This is my heart. Do with it what you were made to do — or what you choose to."', dur: 2.6 },
            ],
          },
        ]);
        const options = [
          { id: 'kill', label: 'Kill', desc: 'Destroy the First Serpent. The Cycle restarts and the world is reborn — but Aeren dies.' },
          { id: 'replace', label: 'Replace', desc: 'Take the First Serpent\'s place. The world survives — but Aeren can never leave.' },
          { id: 'break', label: 'Break the Cycle', desc: 'Destroy the Eternal Core. No more rebirth. Everything becomes mortal — and free to choose how to live.' },
          { id: 'ouroboros', label: all ? 'Ouroboros' : '???', desc: all ? 'Refuse all three. There is a fourth way — the oldest one.' : `Collect every Memory Fragment to reveal this path (${MEMORY_IDS.filter(has).length}/${MEMORY_IDS.length}).`, locked: !all },
        ];
        let pick = await g.choice('The heart of the Creator beats before you.', options, 'Choose how the story ends.');
        while (pick === 'ouroboros' && !all) pick = await g.choice('The heart of the Creator beats before you.', options, 'That path is sealed.');
        await playEnding(g, pick, heart.group.position.clone());
      },
    },
  ],
};

async function playEnding(g: Game, id: string, heartPos: THREE.Vector3) {
  const hp = () => heartPos.clone().setY(heartPos.y + 4);
  const endings: Record<string, { title: string; lines: string[] }> = {
    kill: {
      title: 'KILL — The Cycle Renewed',
      lines: [
        'Aeren strikes the heart. The Creator does not resist.',
        'Light pours out of the world like water from a broken vessel — and then pours back in.',
        'Forests rise from ash. Rivers remember their beds. Children are born who will never know what was lost.',
        'Somewhere, in the dark beneath new ruins, an egg waits for its turn.',
        'Aeren is gone. The Cycle turns again.',
      ],
    },
    replace: {
      title: 'REPLACE — The New World Serpent',
      lines: [
        'Aeren coils around the heart, and the heart coils around Aeren.',
        'The First Serpent closes its eyes at last, and dies content.',
        'Aeren becomes the world — its mountains are Aeren\'s spine, its oceans Aeren\'s breath.',
        'The world survives. The humans build new cities on Aeren\'s back, and Aeren lets them.',
        'They are so brief. Like sparks. Aeren can never leave.',
      ],
    },
    break: {
      title: 'BREAK THE CYCLE — A Mortal World',
      lines: [
        'Aeren shatters the Eternal Core.',
        'No more reincarnation. No more eternal serpents. No more predetermined destiny.',
        'The First Serpent smiles — the way only something that finally gets to end can smile.',
        'The world becomes mortal. Everything can finally die.',
        'But everything can finally choose how to live.',
      ],
    },
    ouroboros: {
      title: 'OUROBOROS — The Secret Ending',
      lines: [
        'Aeren refuses the three choices.',
        'Instead, Aeren eats its own tail.',
        '"Every beginning is a memory of an ending."',
        'A tiny egg appears. It cracks. Inside is another Aeren.',
        'But this time, there is no voice telling it where to go.',
        'NEW GAME+ unlocked — the world has changed.',
      ],
    },
  };
  if (id === 'kill') {
    await g.cinematic([
      { dur: 4, cam: behind(g, 10, 4, 4), look: hp, fov: 45, events: [{ at: 1.2, fn: () => { g.player.jawTarget = 1; audio.sfx('bite'); audio.sfx('roar', 0.35); } }, { at: 2.4, fn: () => { g.flash('#ffffff'); audio.sfx('boom', 2); g.shake(2.5); } }] },
      { dur: 7, cam: () => heartPos.clone().add(V(0, 20, 50)), camTo: () => heartPos.clone().add(V(0, 120, 160)), look: hp, fov: 50, fadeOut: 2, update: (k) => { g.engine.setGrade({ exposure: 1 + k * 2.5, saturation: 0.2 }); g.player.rig.mat.opacity = 1 - k; g.player.rig.mat.transparent = true; } },
    ]);
  } else if (id === 'replace') {
    const cos = makeCosmos();
    g.stage.add(cos.group);
    await g.cinematic([
      { dur: 5, cam: () => heartPos.clone().add(V(22, 10, 22)), look: hp, fov: 45, update: () => {}, events: [{ at: 0.5, fn: () => { audio.sfx('memory'); g.flash('#ffcf8a'); } }] },
      {
        dur: 9, cam: cos.center.clone().add(V(0, 30, 150)), camTo: cos.center.clone().add(V(-40, 60, 120)), look: cos.center, fov: 45, fadeIn: 1.5, fadeOut: 2,
        events: [{ at: 0, fn: () => { g.scene.fog = null; g.scene.background = new THREE.Color('#000'); g.world.sky.visible = false; cos.serpent.visible = true; cos.planetMat.opacity = 0.35; cos.rim.intensity = 400; } }],
        update: (k) => { cos.serpent.rotation.y = k; cos.uniforms.uTime.value = k * 12; },
      },
    ]);
  } else if (id === 'break') {
    await g.cinematic([
      {
        dur: 5, cam: () => heartPos.clone().add(V(16, 8, 16)), look: () => heartPos.clone().setY(heartPos.y + 7.5), fov: 40,
        events: [{ at: 1.5, fn: () => { audio.sfx('crack'); audio.sfx('boom', 1.5); g.shake(2); g.flash('#ffffff'); g.bursts.emit(heartPos.clone().setY(heartPos.y + 7.5), { count: 400, color: '#fff2c8', speed: 25, size: 1.2, life: 2.5 }); } }],
      },
      { dur: 7, cam: () => g.player.pos.clone().add(V(0, 8, 20)), camTo: () => g.player.pos.clone().add(V(0, 60, 30)), look: () => g.player.pos.clone().add(V(0, 40, -40)), fov: 55, fadeOut: 2, update: (k) => { const s = g.world.sky.material as THREE.ShaderMaterial; s.uniforms.uNebula.value = 1 - k; s.uniforms.uStars.value = k; s.uniforms.uRing.value = 1 - k; s.uniforms.uTop.value.lerp(new THREE.Color('#0a1a3a'), 0.02); } },
    ]);
  } else if (id === 'ouroboros') {
    g.say([{ who: 'THE VOICE', text: 'Not three ways. Four. The oldest shape there is.' }]);
    await g.objective('Eat your own tail', () => {
      const t = g.player.tailTip(new THREE.Vector3());
      return t.distanceTo(g.player.pos) < g.player.radius * 3.2;
    }, { sub: () => 'Turn back and bite the tip of your tail' });
    const egg = makeEgg();
    await g.cinematic([
      { dur: 4, cam: () => g.player.pos.clone().add(V(0, 40, 10)), look: head(g), fov: 50, events: [{ at: 0.5, fn: () => { audio.sfx('bite'); audio.sfx('memory'); g.flash('#ffcf8a'); } }], fadeOut: 1.5, lines: [{ at: 0.8, who: '', text: 'Ouroboros.', dur: 2.5 }] },
      {
        dur: 6, cam: V(0, 2, 8), look: V(0, 1.5, 0), fov: 38,
        events: [{ at: 0, fn: () => { useUI.setState({ fade: 1 }); } }],
        update: () => useUI.setState({ fade: 1 }),
        lines: [{ at: 1, who: 'THE VOICE', text: '"Every beginning is a memory of an ending."', dur: 4, voice: VO.beginning }],
      },
      {
        dur: 7, cam: () => egg.group.position.clone().add(V(3, 2.5, 6)), look: () => egg.group.position.clone().setY(egg.group.position.y + 1.8), fov: 38, fadeIn: 2,
        events: [
          { at: 0, fn: () => { egg.group.position.copy(heartPos).add(V(0, -3, 25)); egg.group.position.y = g.world.height(egg.group.position.x, egg.group.position.z); g.stage.add(egg.group); g.player.rig.group.visible = false; } },
          { at: 3, fn: () => { audio.sfx('crack'); egg.setCrack(0.8); } },
          { at: 5, fn: () => { egg.hatch(); g.flash('#bfe0ff'); audio.sfx('heartbeat', 1.5); } },
        ],
        update: (_k, dt) => egg.update(dt),
        lines: [{ at: 5.3, who: '', text: 'Inside is another Aeren. But this time, there is no voice telling it where to go.', dur: 1.7 }],
      },
    ]);
    updateSave((s) => { s.ngPlus += 1; });
  }
  updateSave((s) => { if (!s.endings.includes(id)) s.endings.push(id); s.unlocked = Math.max(s.unlocked, CHAPTERS.length - 1); });
  g.music('dream', 0);
  useUI.setState({ screen: 'ending', ending: { id, title: endings[id].title, lines: endings[id].lines }, fade: 0, letterbox: false });
}

// ================================================================== the campaign
export const CHAPTERS: ChapterDef[] = [
  prologue,
  hatchling,
  memory,
  forest,
  harvester,
  city,
  ...SEVEN.map((e, i) => eternalChapter(e, i)),
  ocean,
  fall,
  first,
  inside,
];
