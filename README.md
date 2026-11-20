# Birthday Bash

Isometric, Diablo-style dungeon crawler rendered with raw WebGL (no rendering library or game engine).
Design: [specs/01_game_design_document.md](specs/01_game_design_document.md).
Plan: [specs/02_implementation.md](specs/02_implementation.md).

## Run

Requires Node.js 20 or newer. No install step and no dependencies.

```sh
npm run dev          # serves http://127.0.0.1:8080
npm test             # node --test, simulation and math checks
```

Open the printed URL in a desktop browser. The first screen chooses a class and allocates the
starting stat points. `?class=wizard` or `?class=warrior` skips character creation using that
class's recommended spread; `?str=1&int=4&vit=3&dex=2` overrides the allocation.
`http://127.0.0.1:8080/?capture=N` renders N frames and then copies the WebGL framebuffer into the
DOM (used for headless screenshots; headless Firefox does not composite WebGL canvases).
Development-only URL helpers also exist: `?unlock=fireball,iceSpear` grants abilities without spending
points, `?select=fireball` selects one, `?cast=1` casts the selected ability at the nearest enemy once,
and `?panel=1` opens the character sheet.

## Controls

| Input | Action |
| --- | --- |
| Right-click | Pathfind and move to the clicked tile (clicking a wall walks to the nearest floor tile) |
| Left-click enemy | With no ability selected: target and melee basic attack. With an ability selected: cast it at that enemy |
| Left-click ground | Cast a point-target ability, or with no ability selected clear the target and show a click marker |
| `1` through `0` | Select the ability or Basic Attack assigned to that hotkey |
| `k` or `c` (or the Character button) | Open the character sheet to spend stat and ability points and assign hotkeys |
| Escape | Return left-click to the basic attack (or close the character sheet) |
| R | Generate a new floor with a new seed |
| Shift+R | Regenerate the current seed (same layout) |
| S | Walk to the staircase (debug shortcut) |
| H / M | Heal 25 health / restore 25 mana (debug shortcuts) |
| T | Target the nearest enemy (debug shortcut) |

## Phase 1: foundation

- Raw WebGL 2 (WebGL 1 fallback) sprite renderer: shader compilation, single dynamic vertex buffer,
  one texture atlas, alpha blending, sprite batching, resource cleanup.
- Procedurally drawn placeholder sprites in a generated atlas.
- Isometric world/screen conversion, fixed-orientation camera that follows the player with smoothing.
- Input capture with canvas-relative coordinates, right-click context-menu suppression.
- Canvas resizing and DPR handling, pause on blur/focus loss, WebGL context-loss and restore handling.
- Debug HUD with FPS, sprite count, camera, player, hover, seed, room count and error count.

## Phase 2: dungeon generation

- Seeded BSP generator producing exactly 50 rooms per floor on a 144x144 tile map, connected by
  2-tile-wide hallways. The same seed always reproduces the same floor.
- Connectivity validation: spawn, staircase and every room are on one connected walkable region;
  invalid layouts are regenerated deterministically.
- Spawn in a randomly chosen room; staircase placed in a room roughly 80 BFS-steps away.
- A* pathfinding on the tile grid (8-way, no corner cutting) with line-of-sight path smoothing;
  clicking a wall targets the nearest reachable floor tile.
- Circle-versus-tile collision with wall sliding and stair-triggered floor transitions (dev placeholder
  until Phase 8).
- Debug HUD shows the seed, floor number, room count and staircase position.

## Phase 3: characters and combat

- Class selection for the Wizard and Warrior, including a stat-allocation screen with a live preview
  of every derived value.
- Level-one characters begin with zero base stats, ten stat points, one ability point, 25 base health
  and 25 base mana. The Wizard uses an Apprentice Staff and the Warrior uses a Long Sword; both basic
  attacks are melee.
- Centralized provisional formulas for health, mana, regeneration, melee and spell damage, defense,
  damage reduction, dodge, accuracy and spell fumble. Stats, health and mana are clamped to valid
  ranges, and zero-health entities die exactly once.
- Enemy targeting by click, chase-into-range behavior, attack range checks, seeded hit rolls,
  defense mitigation, cooldowns, experience rewards and death feedback.
- Reusable simulation systems for entities, health/mana resources, projectiles, area effects, timed
  effects (additive stacking) and cooldowns, ready for the ability and enemy phases.
- Combat HUD with class, level, health, mana, experience, stat points, ability points and a target
  frame, plus floating damage text and a combat log.
- Three training dummies spawn near the spawn room of every generated floor for combat testing.
- Death shows a restart prompt; Enter returns to a fresh level-one character and dungeon.

### Phase 3 verification

- Both classes move, target a dummy and perform melee basic attacks; the Wizard has no ranged basic
  attack.
- Stat allocation updates max health, mana, regeneration, damage, defense, dodge, accuracy and spell
  fumble according to the configured formulas.
- Health and mana stay within `0..max`, and a killed entity is removed and awards experience once.
- Click targeting, range checks and the floating combat feedback remain correct after the camera
  moves or the canvas resizes.
- The HUD reports the class, level, health, mana, experience and target, and the console error count
  stays at 0.

## Phase 4: progression and abilities (current build)

- Experience progression uses `floor(50 * 1.09^(L - 1))` per level; overflow carries into the next
  level. Each level grants five stat points and one ability point without resetting allocated stats,
  unlocked abilities or hotkey assignments.
- The character sheet (`k`, `c` or the Character button) spends stat and ability points. An unlock
  costs exactly one ability point, has no prerequisites and has no additional ranks.
- Active abilities auto-assign to the first free hotkey and can be reassigned from the sheet. Basic
  Attack starts in slot `1`, is always available, and can be assigned to any hotkey; selecting it
  returns left-click to basic attacks. Passive abilities apply immediately, operate automatically and
  never occupy a hotkey.
- A shared ability runtime covers single-target spells, homing projectiles and splash, chain effects,
  timed areas with pull, radial damage with knockback, buffs, debuffs, summons, dashes and passive
  triggers. Summon Totem and Summon Golem are placed at the cursor up to four tiles away.
- Selecting a hotkey replaces the basic attack for left-click. Repeated casts keep the ability
  selected, another hotkey switches it, and Escape returns left-click to the basic attack.
- Cooldown, mana, range, target and fumble checks run before every cast, with floating feedback for
  each failure. The hotbar shows keys, mana costs, the current selection and remaining cooldowns.
- Both kits are wired as castable framework implementations with provisional tuning in
  `src/config.js`; the exact per-ability rules and tuning arrive in Phases 6 and 7.
- Training dummy kills grant experience; Vampiric Blessing can drop collectible crystallized blood
  that heals on pickup.

### Phase 4 verification

- Level one to two requires exactly 50 experience; the next requirements are 54 and 59, following the
  rounded 9% curve, and large awards can cross several levels in one go.
- Level-ups keep previously allocated stats, unlocked abilities and hotbar assignments.
- Every ability can be unlocked on its own with one point, and passives work immediately.
- An active ability stays selected after casting, hotkeys change the selection and Escape restores
  the basic attack.
- Locked, cooling, unaffordable, out-of-range and invalid-target casts are rejected consistently.
- `npm test` covers the experience curve, grants, independent unlocks, selection, hotbar mapping, cast
  validation, projectile splash, chain target limit, tornado pull, spin knockback, stun bounds, mana
  shield, rage buffs, ice slow, summons, rush and blood pickups.

## Layout

```
index.html               page shell, HUD, ability bar, character sheet, early error capture
styles.css               HUD, ability bar/sheet, combat feedback and creation styling
src/main.js              bootstrap
src/config.js            renderer, character, class, formula, progression and ability tuning
src/core/loop.js         fixed-step game loop with accumulator
src/core/input.js        mouse/keyboard, canvas-relative coordinates
src/core/game.js         game states, character creation, update/render orchestration, HUD
src/gfx/gl.js            WebGL context, shader and program helpers
src/gfx/texture.js       canvas-to-texture upload
src/gfx/atlas.js         procedural placeholder sprite atlas
src/gfx/renderer.js      batched sprite renderer
src/gfx/iso.js           isometric world/screen conversion
src/gfx/camera.js        camera follow
src/ui/hud.js            health/mana/experience/target HUD, combat log, floating text
src/ui/creator.js        class selection and stat-allocation panel
src/ui/abilityBar.js     ten-slot ability hotbar with costs, selection and cooldowns
src/ui/abilityPanel.js   character sheet: stat spending, unlocks and hotkey assignment
src/world/grid.js        tile grid and circle collision
src/world/entity.js      entity base class, health/mana resources, damage filters, entity store
src/world/player.js      player movement
src/world/character.js   character stats, leveling, unlocks, hotbar, selection and buffs
src/world/stats.js       stat formulas and derived-value calculation
src/world/progression.js experience curve and level rewards
src/world/combat.js      range checks, hit chance, parry, damage rolls, spell fumble
src/world/abilities.js   ability definitions, lookup, validation, hotkeys and passives
src/world/abilitySystem.js shared cast runtime for every ability category
src/world/summons.js     totem/golem summons and movement
src/world/pickups.js     collectible crystallized blood
src/world/enemies.js     placeholder enemy types and floor population
src/world/effects.js     timed effects and cooldowns
src/world/projectile.js  projectile simulation
src/world/area.js        radial damage and timed area effects
src/world/rng.js         seeded PRNG, seed derivation
src/world/bsp.js         BSP partition, rooms, hallway rectangles
src/world/floor.js       floor assembly, spawn/stairs placement, validation
src/world/pathfinding.js A* pathfinding, smoothing, line of sight, BFS distances
test/                    node:test suites for non-rendering logic
tools/dev-server.mjs     dependency-free static dev server
```
