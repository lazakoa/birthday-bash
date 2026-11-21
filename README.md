# Birthday Bash

Isometric, Diablo-style dungeon crawler rendered with raw WebGL (no rendering library or game engine).
Design: [specs/01_game_design_document.md](specs/01_game_design_document.md).
Plan: [specs/02_implementation.md](specs/02_implementation.md).
Mini map: [specs/03_mini_map.md](specs/03_mini_map.md).

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
`?panel=1` opens the character sheet. Add `?floor=N` to a `?class=...` start to begin on floor N with
one level of experience per skipped floor; the character-creation screen also has a Starting floor
selector with the same reward for testing.

## Controls

| Input | Action |
| --- | --- |
| Right-click | Pathfind and move to the clicked tile (clicking a wall walks to the nearest floor tile) |
| Left-click enemy | With no ability selected: target and melee basic attack. With an ability selected: cast it at that enemy |
| Left-click ground | Cast a point-target ability, or with no ability selected clear the target and show a click marker |
| `1` through `0` | Select the ability or Basic Attack assigned to that hotkey |
| `k` or `c` (or the Character button) | Open the character sheet to spend stat and ability points and assign hotkeys |
| `M` | Open or close the full-level map (pauses play while open) |
| Escape | Return left-click to the basic attack (or close the character sheet / full map) |
| R | Generate a new floor with a new seed (same floor number) |
| Shift+R | Regenerate the current seed (same layout) |
| S | Walk to the staircase on floors 1–4 (debug shortcut) |
| H / Shift+M | Heal 25 health / restore 25 mana (debug shortcuts) |
| T | Target the nearest enemy (debug shortcut) |

## Mini map

- A 176-pixel local map sits in the top-left corner and follows the player. Walkable tiles are
  light, walls are dark, and the player is a red dot.
- `M` opens a full-screen map of the current floor. The game pauses while the full map is open;
  `M`, `Escape` or the close button resumes it.
- The full map shows the entire floor at once, including the boss floor, with the same red player
  marker. Floor changes rebuild both maps from the current collision grid.
- The debug readout moved below the mini map so the two overlays do not cover each other.

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
- Circle-versus-tile collision with wall sliding.
- Debug HUD shows the seed, floor number, room count and staircase position.

## Phase 3: characters and combat

- Class selection for the Wizard and Warrior, including a stat-allocation screen with a live preview
  of every derived value.
- Level-one characters begin with zero base stats, ten stat points, two ability points, 25 base health
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
- Training dummy support remains in the simulation for combat tests; generated floors use the Phase 5
  enemy population.
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

## Phase 4: progression and abilities

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

## Phase 5: enemy roster and floor population

- Every generated floor is populated from a configurable spawn table in `src/config.js`. Room spawn
  chance, enemies per room, guaranteed types, placement spacing, and per-floor health, damage and
  experience scaling are all centralized there.
- Six regular enemy types spawn through the shared enemy runtime: Skeletons and Zombies pursue and
  melee, Skeleton Archers fire bone-arrow projectiles at range, Skeleton Mages cast Fireball and
  Mana Shield through the shared ability system, Bats are fast erratic melee enemies, and Vampires
  are durable roamers that wander the dungeon.
- Enemies share idle, wander, aggro, pursuit, attack and death states. Aggro uses an aggro radius and
  line of sight, combat uses A* navigation with wall sliding and a leash back to the spawn room, and
  attacks require line of sight so enemies cannot strike through walls.
- Melee and ranged attacks use a windup telegraph rendered under the enemy. Projectiles, enemy damage
  and player damage feedback reuse the existing combat, projectile, area, effect and cooldown systems.
- Floor transitions, regeneration and restart clear enemies, projectiles, areas and timed effects;
  enemy deaths award their configured experience exactly once and remove the enemy immediately.

### Phase 5 verification

- All six enemy types spawn on walkable tiles, and the same seed and floor reproduce the same
  population.
- Skeletons and Zombies aggro, path around walls, wind up and damage the player; Bats move faster.
- Skeleton Archers hold range and fire projectiles; Skeleton Mages raise Mana Shield and cast
  Fireball; Vampires wander when no player is nearby.
- Enemies cannot attack through walls, dead enemies stop acting, and killed enemies grant experience
  once.
- `npm test` covers the roster, deterministic population, per-floor scaling, pursuit and melee
  attacks, line-of-sight attack blocking, archer projectiles, mage abilities, roaming and dead-enemy
  cleanup.

## Phase 6: Wizard ability kit

- Fireball impacts its target and explodes in a small radius, dealing full damage on impact and
  reduced splash damage to nearby enemies.
- Chain Lightning arcs from the selected target through up to five valid enemies without repeating
  or striking dead targets.
- Ice Spear slows its target by 35% for three seconds and restores movement speed when the effect
  expires.
- Tornado pulls enemies inside its radius toward the center while dealing heavy damage per tick for
  its full duration.
- Mana Shield converts incoming damage into mana at a one-to-one rate, then applies only the
  unabsorbed remainder to health when mana runs out. Health and mana never go negative.
- Summon Totem automatically attacks the nearest enemy in its radius. An elemental spell that
  strikes the totem infuses its attacks with that element for the rest of its duration.
- Summon Golem has high health and low damage, fights nearby enemies, and pulls enemy aggro from the
  player while it lives. Golems and totems are removed on death or expiry.
- Explosion bursts, mana-shield aura, elemental summon beams and cast feedback use the existing
  rendering and combat systems. Death, floor regeneration and restart clear projectiles, areas,
  timed effects and summons.

### Phase 6 verification

- Every Wizard ability unlocks, assigns to a hotkey, selects and casts repeatedly through the common
  controls.
- Fireball's impact and explosion radius hit only valid nearby enemies, and Chain Lightning stops at
  five targets while ignoring dead enemies.
- Ice Spear applies exactly a 35% slow and removes it on expiry.
- Tornado pulls and damages only enemies within its radius.
- Mana Shield consumes mana before health and clamps both resources at zero when depleted.
- Totem attacks acquire valid targets, and elemental spells change its attack element while
  non-elemental attacks leave it unchanged.
- The Golem fights, draws enemy aggro, retargets enemies to the player after death, and is cleaned
  up with other summons.
- `npm test` covers the complete Wizard kit, including infusion, golem aggro, mana depletion, slow
  expiry and summon cleanup.

## Phase 7: Warrior ability kit

- Bash strikes harder than a basic attack and stuns the target for two to four seconds. Stunned
  enemies stop navigating, pursuing and attacking until the stun expires. A stun indicator marks
  affected enemies, and repeated bashes keep the strongest active stun.
- Berserker's Rage removes all defense and damage reduction while granting a Strength bonus, extra
  movement speed and faster attack speed, then restores the character's original values on expiry.
  Recasting refreshes the single rage buff instead of stacking it.
- Parry is an automatic passive with a 15% chance to parry valid melee attacks. Ranged projectiles
  and spells bypass it, and it never occupies a hotkey.
- Slingshot launches a stone projectile at limited range for low damage. It is a poke and finish
  tool, not a replacement for the sword, and has no stun or knockback.
- Spinning Blade damages every valid enemy inside its radius, ignores dead and distant enemies, and
  knocks survivors outward without pushing them through walls.
- Vampiric Blessing gives each killed enemy a 5% chance to drop crystallized blood. The drop is
  collectible, heals within the health cap, expires if left behind, and is cleared on floor
  transitions, death and restart.
- Rush dashes toward an enemy up to its configured range, stops just beside the target and deals
  tackle damage. It cannot cross walls or leave the playable map, and invalid or out-of-range
  targets are rejected before the dash starts.
- Feedback reuses the existing systems: Spinning Blade shows a radial burst, Rush leaves a dash trail,
  Bash shows stun sparks and a floating stun label, Berserker's Rage draws a red aura and parries
  and dodges report in the combat log.

### Phase 7 verification

- All seven Warrior abilities unlock independently; passives never occupy a hotkey and actives
  select and cast through the common controls.
- Bash's stun always lands within its two-to-four-second bounds and freezes enemy movement for the
  duration.
- Berserker's Rage applies and removes every configured effect, including zeroed defense.
- Parry triggers automatically at 15% against melee attacks only.
- Slingshot obeys its shorter range and lower damage role.
- Spinning Blade hits valid nearby targets and stops knockback at walls; Vampiric Blessing drops at the
  configured chance, heals within the cap and cleans up; Rush stops at valid destinations and
  handles blocked paths, invalid targets and range limits.
- `npm test` covers the complete Warrior kit, including stun expiry, rage removal, melee-only parry,
  slingshot range and damage, wall-respecting knockback, blood drops and blocked rushes.

## Phase 8: shrines and complete run flow

- The dungeon now has five floors: four BSP-generated 50-room floors followed by one unpartitioned
  boss arena. Staircases on floors 1–4 carry the same character forward, preserving stats, health,
  mana, experience, unlocked abilities, buffs, cooldowns and shrine timers.
- Rooms on floors 1–4 each make an independent 2.5% shrine roll. Health, Mana and Speed Shrines
  grant +50% health regeneration, +50% mana regeneration and +20% movement speed for 60 seconds.
- Shrine bonuses stack additively. Every activation owns an independent 60-second timer, so two
  Health Shrines give +100% regeneration and expire separately.
- The HUD status panel shows the floor out of five, the boss-floor marker and every active effect
  (shrine or buff) with its remaining duration. Shrine pickups also produce floating text and log
  lines.
- Floor 5 is a single arena. Phase 8 used a temporary boss placeholder; Phase 9 replaces it with the
  Lich. Death at any point allows a restart from class selection with a fresh level-one character and
  a newly generated dungeon, with no persistent progression.
- The character-creation screen includes a Starting floor selector. Choosing a later floor grants one
  full level of experience per skipped floor, so tests can reach later floors with level-up points.
- Shrines, the placeholder boss and the exit have placeholder sprite-art in the procedural atlas.

### Phase 8 verification

- A generated run always contains four validated 50-room floors followed by one unpartitioned boss
  floor with walkable spawn, boss and exit positions.
- The same seed and floor number reproduce the same layout, shrine placement and shrine types.
- Every room on floors 1–4 rolls the configured 2.5% shrine chance independently; placed shrines are
  walkable and clear of the spawn and staircase.
- Shrine effects stack additively, expire on their own timers and survive floor transitions; they
  do not produce negative bonuses when an application expires.
- The boss floor has no regular enemy population. Its room is a single open arena with a distant
  player spawn.
- `npm test` covers the five-floor run, boss layout, deterministic shrine rolls, per-room shrine
  chances, additive stacking with independent timers, effect retention across floors, the boss
  placeholder and the one-level-per-skipped-floor starting experience.

## Phase 9: Lich boss and victory condition

- Floor 5 now spawns the Lich in the boss arena. The Lich is a durable spellcaster with Fireball,
  Summon, Arcane Push, Arcane Pull and a frontal area-of-effect Slash.
- Fireball is a ranged projectile that explodes in a small radius. Arcane Push hurls a close enemy
  away, Arcane Pull drags a distant enemy closer, and Slash tears through a forward cone after a
  short telegraph. Every ability has its own cooldown and obeys line of sight, range and wall
  collision.
- Summon raises eight minions drawn from every skeleton type and zombies. The summon cannot be spammed
  and is recast only after its cooldown when fewer than three summoned minions remain; existing
  summons crumble and are replaced by the new host.
- Boss casts, summons, forced movement and the slash telegraph produce placeholder audiovisual
  feedback in the combat log, floating text, beams, bursts and the slash sprite.
- Killing the Lich opens the exit in the boss room but does not end the run and does not remove
  surviving summons. The player must reach the exit alive to complete the run; dying after the Lich
  falls still fails the run. Victory and death both offer a fresh restart from class selection.
- Survivors keep attacking after the Lich dies, so the escape can be contested.

### Phase 9 verification

- The Lich uses every listed ability with valid targets, ranges, line of sight and cooldown behavior.
- Summon creates eight minions with the configured skeleton/zombie mixture, grants experience for
  killed minions like normal enemies, respects its recast threshold and replaces previous summons.
- Push and Pull move only valid enemies and stop at walls; Slash hits only living enemies in the
  forward cone within range.
- The exit appears only after the Lich dies, surviving minions remain alive and dangerous, and the run
  completes only when the living player reaches the exit.
- `npm test` covers the Lich spawn, ability set, summon count and composition, recast rules and
  replacement, collision-aware push/pull, frontal slash targeting and the exit-after-death flow.

## Phase 10: integration, balance and release hardening (current build)

- Automated integration checks drive both classes through all five floors, kill the Lich and reach
  the exit, and also cover simultaneous deaths, repeated restarts, every floor transition and large
  summon counts.
- Team-aware targeting: player spells, projectiles, chains and explosions no longer damage allied
  golems and totems, while enemy area damage still hits the player and their summons.
- Slows and enemy buffs now compose correctly. Mana Shield no longer clears Ice Spear's slow, and
  removing a buff or letting a slow expire restores the correct movement speed.
- Removing an enemy or summon clears its timed effects. Repeated runs leave no stale entities,
  projectiles, areas, pickups, effects or cooldowns behind.
- Rendering culls off-screen shrines, areas, projectiles, pickups, enemies and combat visuals, and
  pathfinding reuses per-grid scratch buffers so repathing does not allocate full maps. The debug HUD
  reports sprite-buffer overflow.
- Combat float text is capped so very large fights cannot grow the DOM without bound.
- Setup, controls, configuration, tests, provisional balance values and known limitations are
  documented below.

### Phase 10 verification

- Both classes complete a full five-floor run, defeat the Lich and escape; a simultaneous death on
  the exit tile still counts as a failed run.
- Both complete ability kits cast through the shared runtime in the same build, and passives never
  occupy a hotkey.
- Player damage never lands on allied summons, while enemy damage does.
- Slow stacking, buff removal and slow expiry keep the expected movement multiplier.
- Eight consecutive restarts, every floor transition and dozens of simultaneous summons leave the
  entity, effect, cooldown, projectile, area and pickup collections clean.
- `npm test` covers the full-run flow, both kits, friendly-fire rules, slow/buff composition, stale
  state cleanup, restart and floor-transition cleanup, summon expiry, simultaneous deaths, render
  culling, reused pathfinding buffers and balance guards for the early game and Lich fight.

## Known limitations

- Graphics are procedural placeholder sprites with no audio. The game targets single-player desktop
  browsers and requires WebGL.
- Rooms are rectangular BSP spaces connected by two-tile hallways; enemies use individual pathfinding
  and do not coordinate their attacks.
- Balance is provisional. Clearing every room grants enough experience to out-level the Lich, while
  rushing the stairs makes the later floors much harder. Tune `POPULATION`, `ENEMY_TYPES`,
  `ABILITIES` and `FORMULAS` in `src/config.js` for a different pacing.
- Loot, chests, equipment, item affixes and persistent progression remain out of scope as specified.

## Configuration and provisional balance

Combat and progression tuning lives in `src/config.js`; presentation-only constants stay with the
system that uses them. The main values are the experience curve (50 base, 9% growth), the five-floor
dungeon layout, the 16%/12%/10% per-floor enemy health/damage/experience scaling, the 2.5% per-room
shrine chance with 60-second bonuses, the 950-health Lich, and every ability's damage, cost, cooldown
and range. Debug shortcuts (`R`, `Shift+R`, `S`, `H`, `Shift+M`, `T`) and the URL helpers stay
available in the release build.

## Layout

```
index.html               page shell, HUD, ability bar, character sheet, early error capture
styles.css               HUD, ability bar/sheet, combat feedback and creation styling
src/main.js              bootstrap
src/config.js            renderer, character, class, formula, progression, ability and enemy tuning
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
src/ui/minimap.js        local mini map, full-level map overlay and floor map cache
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
src/world/summons.js     totem/golem stats, combat, movement and elemental infusion
src/world/pickups.js     collectible crystallized blood
src/world/shrines.js     per-room shrine rolls, placement and shrine definitions
src/world/enemies.js     enemy and Lich definitions, floor population and spawn tables
src/world/lich.js        Lich arena AI, summons, forced movement, frontal slash
src/world/enemyAI.js     enemy states, navigation, aggro, attacks and telegraphs
src/world/effects.js     timed effects and cooldowns
src/world/projectile.js  projectile simulation
src/world/area.js        radial damage and timed area effects
src/world/rng.js         seeded PRNG, seed derivation
src/world/bsp.js         BSP partition, rooms, hallway rectangles
src/world/floor.js       regular and boss floor assembly, spawn/stairs/shrine placement, validation
src/world/pathfinding.js A* pathfinding, smoothing, line of sight, BFS distances
test/                    node:test suites for non-rendering logic
tools/dev-server.mjs     dependency-free static dev server
```
