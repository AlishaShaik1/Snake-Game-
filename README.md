# SERPENT: THE LAST CYCLE

A story-driven 3D snake game running in real time in the browser. You play **Aeren**, the last hatchling of the World Serpent. You grow, coil and fight your way through a dying world to the First Serpent, then choose how the cycle ends.

Built with **Three.js** (a custom renderer and post-processing stack), **React** for the UI overlays and **Zustand** for state. All geometry, animation, textures, music and sound effects are generated in code at runtime. The only external assets are the key-art paintings in `public/art/`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # type-check + production bundle in dist/
npm run preview
```

You need a browser with WebGL2. Headphones are recommended because the music and effects are synthesized live with WebAudio.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Steer | A / D or ← / → (hold to tighten the curl) | left / right third of the screen |
| Surge (uses stamina) | W / ↑ / Shift | centre of the screen |
| Interact | E / Enter | tap |
| Advance / skip dialogue | Space / Enter | tap |
| Toggle camera (chase / classic top-down) | V | — |
| Pause | Esc / P | — |

## How the snake mechanics fit the story

- **Growth is power.** Eating makes Aeren longer and larger. A longer body can wrap bigger enemies.
- **Coiling is your weapon.** Close a loop around an enemy to crush it. Each foe needs a minimum body length to encircle it: drones need 10 segments, the Harvester 18 and the First Serpent 30.
- **Losing segments means losing memories.** Hits cut your tail off. If you drop below 3 segments, you die.
- **Sacred fruits give abilities:**
  - Ember Fruit: fire immunity.
  - Moon Seed: night-sight, which reveals hidden things.
  - Blood Root: regeneration.
  - Storm Berry: speed.
  - Void Crystal: phase through hazards.
- **Memory fragments** are hidden in every chapter. Collect all 14, then bite your own tail at the end to find the secret **Ouroboros** ending, which unlocks New Game+.

## Campaign (17 chapters)

1. Prologue: *Don't look at the corpse.*
2. The Hatchling.
3. The First Memory.
4. The Burning Forest.
5. The Harvester.
6. The City of Bones.
7. The seven Eternals:
   - Ignis (Ember).
   - Thalassa (Tide).
   - Zephyra (Gale).
   - Sylvara (Root).
   - Korrath (Stone).
   - Nihil (Void).
   - Astra.
8. The Ocean, with a mid-game choice: **Wake the Serpent** or **Let the World Die**.
9. The Fall.
10. The First Serpent, a four-phase final boss.
11. Inside the Serpent.

There are four endings: **Kill**, **Replace**, **Break the Cycle** and the secret **Ouroboros**. Your progress, fragments and endings are saved in `localStorage`. You can replay any unlocked chapter from the title screen.

## Graphics

- Physically based materials and a procedural sky with image-based lighting.
- Soft shadows.
- Post-processing:
  - N8AO ambient occlusion.
  - Mip-mapped bloom.
  - ACES tone mapping.
  - Per-biome colour grading.
  - Cinematic depth of field.
  - Chromatic aberration.
  - Film grain.
  - SMAA anti-aliasing.
- Instanced vegetation and props that sway in the wind. Props dissolve when they block the camera.
- Soft light shafts.
- GPU particles, caustics and lava.
- A dynamic tube body for the serpent, with runic emissive scales and a fresnel rim light.
- A cinematic camera director with letterboxing, subtitles and voice lines.

The quality preset (Low / Medium / High / Ultra) is in Settings. If the frame rate stays under 30 fps, the game lowers the preset automatically.

## Project layout

```
src/
  App.tsx, main.tsx, index.css   React shell + overlay styling
  ui/                            Title, HUD, dialogs, settings
  game/
    engine.ts                    renderer + post-processing stack
    world.ts, biomes.ts, sky.ts  terrain, water/lava, per-biome looks
    props.ts, particles.ts       instanced set dressing, particle systems
    serpent.ts                   Aeren: movement, body mesh, coils, abilities
    enemies.ts, bosses.ts        drones, Harvester, Eternals, First Serpent
    hazards.ts, pickups.ts       hazards, food, fruits, memory fragments
    cinematic.ts                 camera director for cutscenes
    audio.ts                     procedural music + SFX (WebAudio)
    game.ts                      game loop, objectives, coil/crush logic
    story/                       chapters, memories, set pieces, endings
public/art/                      title / chapter key art
```
