# Birthday Bash Implementation Plan

## Purpose

This document divides the game described in [01_game_design_document.md](01_game_design_document.md) into implementation phases. Each phase produces a testable result and should be verified before the next phase begins.

The phases prioritize an end-to-end playable foundation before content breadth and balance. Development conveniences such as test arenas, debug controls, and reduced dungeon sizes may be used during implementation, but the final game must satisfy the design document.

## Fixed Constraints

- The game is single-player and targets desktop browsers.
- Game rendering uses the browser's raw WebGL API directly. Do not use Three.js, PixiJS, Phaser, Babylon.js, or another rendering library or game engine.
- Graphics use placeholder 2D sprites with a fixed isometric camera that follows the player.
- The final dungeon has four BSP-generated floors with 50 rooms each, followed by an unpartitioned boss floor.
- Both classes and every listed ability are required.
- Loot, chests, general equipment, item prefixes and suffixes, and persistent progression are out of scope.
- The Wizard's staff and Warrior's long sword are starting melee weapons, not the beginning of an equipment system.

## Implementation Latitude

The implementation may choose the language, build tooling, application structure, UI rendering approach, collision and navigation algorithms, and placeholder asset formats unless later specifications say otherwise.

Combat values and AI tuning may use reasonable provisional defaults. Keep health, mana, regeneration, damage, defense, cooldowns, mana costs, ranges, movement speeds, spawn rates, and experience rewards in centralized configuration or data definitions so they can be tuned without rewriting game logic. Provisional tuning must not change the mechanics stated in the design document.

Use seeded random generation for dungeon generation and randomized combat behavior so bugs can be reproduced. Keep simulation logic separate from WebGL rendering so generation, progression, combat, and shrine rules can be tested independently.

## Phase 1: Application and Raw WebGL Foundation

### Work

- Create a browser application that starts without manual setup beyond the documented install and development commands.
- Establish the application entry point, game loop, timing, cleanup, and top-level game states.
- Build the raw WebGL renderer, including shader compilation, buffers, textures, sprite rendering, transparency, and resource cleanup.
- Implement world-to-screen and screen-to-world coordinate conversion for the isometric view.
- Implement a fixed-orientation camera centered on the player.
- Add placeholder sprites and a test map.
- Capture mouse and keyboard input, including canvas coordinate conversion and browser context-menu suppression where required.
- Handle canvas resizing, focus loss, and WebGL context loss gracefully.

### Verification

- Placeholder sprites render correctly through raw WebGL with no rendering library.
- The camera follows a moving placeholder character without changing its isometric orientation.
- Mouse targeting remains accurate after resizing the canvas.
- The game loop starts, stops, and restarts without duplicate listeners or leaked WebGL resources.
- The browser console remains free of shader, texture, and runtime errors.

## Phase 2: Dungeon Generation and Navigation

### Work

- Implement a tile or grid representation for rooms, walls, floors, and hallways.
- Generate one floor using BSP with exactly 50 rooms connected by hallways.
- Add a valid player spawn and a reachable staircase to the next floor.
- Validate that the spawn, staircase, and every room belong to the connected playable space.
- Add world collision and right-click movement.
- Add navigation around walls and obstacles as required by movement and future enemy AI.
- Render the generated map and placeholder player using the Phase 1 renderer.
- Add debug output for the generation seed and a way to regenerate a floor during development.

### Verification

- A representative batch of seeds produces exactly 50 rooms and a connected hallway network.
- The player always spawns on a walkable tile and can reach the staircase.
- The player cannot cross walls, leave the playable map, or become stuck because of click-to-move pathing.
- Regenerating the same seed reproduces the same layout.
- The camera and mouse-to-world conversion remain correct across the generated map.

## Phase 3: Characters, Basic Combat, and Core HUD

### Work

- Add class selection for Wizard and Warrior.
- Create level-one characters with zero in every base stat, ten allocatable stat points, two ability points, 25 base health, and 25 base mana.
- Add stat allocation and the provisional formulas for health, mana, regeneration, damage, defense, dodge, accuracy, and spell fumble.
- Implement melee basic attacks using the Wizard's staff and Warrior's long sword.
- Implement enemy targeting, attack range checks, hit resolution, damage, healing, mana use, death, and combat feedback.
- Add reusable systems for entities, projectiles, area effects, timed effects, cooldowns, and resources needed by later phases.
- Add health, mana, experience, class, level, and basic combat HUD elements.
- Add simple target dummies or placeholder enemies for combat testing.

### Verification

- Both classes can move, target an enemy, and perform melee basic attacks.
- The Wizard does not receive a ranged basic attack.
- Stat allocation changes the derived character values according to the configured formulas.
- Health and mana stay within their valid ranges, and zero-health entities die exactly once.
- Targeting, range checks, and attack feedback work at different camera positions and canvas sizes.

## Phase 4: Progression and Ability Framework

### Work

- Implement experience rewards and the level requirement formula `floor(50 * 1.09^(L - 1))`.
- Award five stat points and one ability point on each level after character creation.
- Add the ability unlock interface: one point unlocks an ability, with no prerequisites and no additional ranks.
- Add active-ability assignment to the `1` through `0` hotkeys.
- Implement hotkey selection, left-click casting, repeated casting, switching abilities, and Escape returning to the basic attack.
- Make unlocked passive abilities operate automatically without hotkey assignment.
- Implement shared ability behavior for single-target spells, projectiles, area effects, chained effects, forced movement, buffs, debuffs, summons, and passive triggers.
- Add cooldown, mana-cost, range, duration, stacking, and insufficient-resource feedback.

### Verification

- The initial level-up costs exactly 50 experience, and subsequent costs follow the 9% curve with fractional results rounded down.
- Level-ups grant the correct points without losing previously allocated stats or unlocked abilities.
- Every ability can be unlocked without investing in another ability.
- Passive abilities work immediately after being unlocked.
- Active abilities remain selected after casting, another hotkey changes the selection, and Escape restores the basic attack.
- Cooldowns, mana costs, valid targets, and range restrictions prevent invalid casts consistently.

## Phase 5: Enemy Roster and Floor Population

### Work

- Implement shared enemy states such as idle, wandering, aggro, pursuit, attack, and death.
- Populate generated floors using configurable spawn tables, density, difficulty scaling, and experience rewards.
- Implement Skeleton and Zombie behavior.
- Implement Skeleton Archer ranged attacks and projectile behavior.
- Implement Skeleton Mage behavior using Fireball and Mana Shield through the shared ability systems.
- Implement Bat behavior.
- Implement relatively strong Vampires that wander through the dungeon.
- Add enemy navigation, aggro rules, attack telegraphs or animations, and cleanup on floor transitions and restart.

### Verification

- All six enemy types spawn and can damage, pursue where applicable, and be killed by the player.
- Skeleton Archers attack at range, and Skeleton Mages use Fireball and Mana Shield.
- Vampires wander rather than remaining stationary at their spawn points.
- Enemies cannot attack through invalid geometry or remain active after death.
- Enemy deaths grant the configured experience exactly once.
- Enemy populations and difficulty remain configurable for playtesting.

## Phase 6: Wizard Ability Kit

### Work

Implement and test the complete Wizard kit:

1. Fireball with single-target impact and a small explosion radius.
2. Chain Lightning with up to five affected enemies.
3. Ice Spear with its 35% slow.
4. Tornado with radial pull and heavy damage.
5. Mana Shield with damage absorbed from mana instead of health.
6. Summon Totem with automatic attacks and elemental infusion when struck by an elemental spell.
7. Summon Golem with high health, low damage, combat behavior, and nearby-enemy aggro.

Add required visuals, placeholders, cast feedback, target rules, durations, and cleanup for each ability.

### Verification

- Each ability can be unlocked, assigned, selected, and repeatedly cast using the common controls.
- Chain Lightning does not exceed its configured target limit or hit invalid dead targets.
- Ice Spear's slow has the configured magnitude and expires correctly.
- Tornado's pull and damage use valid in-radius enemies.
- Mana Shield consumes mana and handles depleted mana without producing negative health or mana.
- Totem attacks acquire valid targets, and elemental infusion changes the totem's attack element as specified.
- Golem health, damage, aggro, death, and cleanup behave correctly.
- Repeated casts, floor transitions, death, and restart do not leave orphaned projectiles or summons.

## Phase 7: Warrior Ability Kit

### Work

Implement and test the complete Warrior kit:

1. Bash with bonus damage and a stun lasting between two and four seconds.
2. Berserker's Rage with zero defense and bonuses to attack speed, movement speed, and Strength.
3. Parry as an automatic passive with a 15% chance to parry melee attacks.
4. Slingshot as a limited-range, low-damage ranged poke.
5. Spin Blade with radial damage and enemy knockback.
6. Vampiric Blessing with a 5% chance for enemies to drop collectible crystallized blood that heals the player.
7. Rush as a limited-range dash and tackle.

Add required visuals, cast feedback, target rules, durations, and cleanup for each ability.

### Verification

- Bash's stun never falls outside its two-to-four-second bounds.
- Berserker's Rage applies and removes every configured effect correctly.
- Parry works automatically and only against valid melee attacks.
- Slingshot obeys its range and damage role.
- Spin Blade hits valid nearby targets and applies knockback without moving enemies through invalid geometry.
- Crystallized blood drops at the configured chance, can be collected, heals within the health cap, and is cleaned up appropriately.
- Rush stops at valid destinations and handles blocked paths, invalid targets, and range limits.

## Phase 8: Shrines and Complete Run Flow

### Work

- Expand generation to four consecutive floors of exactly 50 rooms each.
- Add working floor staircases and transitions while preserving the character's current stats, health, mana, abilities, experience, and active effects as appropriate.
- Generate floor 5 as an unpartitioned boss floor and provide a temporary boss placeholder until Phase 9.
- Add Health, Mana, and Speed Shrines to eligible rooms on floors 1–4.
- Roll shrine placement independently at 2.5% per regular room.
- Implement additive shrine stacking with an independent 60-second timer per application.
- Add shrine and active-effect HUD feedback.
- Complete death, victory-placeholder, restart, class-selection, and fresh-dungeon flow without persistent progression.

### Verification

- Every run contains four generated 50-room floors followed by one unpartitioned boss floor.
- Staircases are reachable and floor transitions do not duplicate or reset the character.
- Each eligible room uses an independent 2.5% shrine roll.
- Two Health Shrine effects produce +100% regeneration rather than a multiplicative result.
- Each shrine application expires on its own timer without removing other active applications.
- Death allows a restart, and restarting produces a fresh level-one character and dungeon with no old entities, timers, or input handlers.
- No loot, chests, general equipment, or persistent progression appear in the run.

## Phase 9: Lich Boss and Victory Condition

### Work

- Replace the boss-floor placeholder with the Lich and its arena behavior.
- Implement Fireball, Summon, Arcane Push, Arcane Pull, and frontal area-of-effect Slash.
- Implement summoning of eight skeleton-and-zombie minions by default, cooldown restrictions, the fewer-than-three-survivors recast rule, and replacement of previous summons.
- Add boss combat feedback and placeholder audiovisual effects.
- Spawn an exit in the boss room when the Lich dies.
- Keep surviving summons active and dangerous after the Lich dies.
- Complete the run only when the living player reaches the exit, then offer a fresh restart.

### Verification

- The Lich uses every listed ability with valid targeting and cooldown behavior.
- Summon creates the correct composition and count, respects its recast condition, and removes replaced summons.
- Push, Pull, and Slash respect their spatial rules and collision constraints.
- Killing the Lich does not immediately complete the run or remove surviving minions.
- The exit appears only after the Lich dies, and reaching it alive completes the run.
- Death after the Lich dies but before escape still counts as a failed run.

## Phase 10: Integration, Balance, and Release Hardening

### Work

- Tune combat values, enemy density, experience rewards, floor difficulty, ability values, and the Lich encounter through active play.
- Test full runs with both classes and varied stat and ability builds.
- Verify prolonged play, repeated restarts, all floor transitions, and large summon counts for resource leaks and stale state.
- Test browser focus changes, resizing, rapid input, invalid targets, blocked paths, simultaneous deaths, and WebGL context restoration.
- Profile rendering and simulation performance using representative maximum room populations and effects; batch or cull rendering where needed without changing gameplay.
- Replace or improve placeholders only where useful; asset polish is not a release blocker.
- Document setup, controls, configuration, testing commands, known limitations, and any provisional balance values.

### Final Acceptance Criteria

- A player can select either class, allocate stats, unlock abilities, traverse all five floors, defeat the Lich, and escape—or die and restart.
- Both complete ability kits and all six regular enemy types work together in the same build.
- Generation, progression, controls, shrine stacking, summoning, death, restart, and victory satisfy the design document.
- Game rendering uses raw WebGL directly, with no rendering library or game engine.
- Automated checks cover deterministic generation, connectivity, experience rounding, progression grants, cooldown and resource rules, shrine stacking, and other simulation logic that does not require rendering.
- Browser playtesting covers the full run and the phase-specific edge cases above.
- No deferred systems are introduced, and no undocumented prerequisite services or accounts are required.

## Recommended Delivery Order

Treat Phases 1–3 as the first playable foundation, Phases 4–7 as the combat and progression vertical slice, Phases 8–9 as the complete run, and Phase 10 as balancing and hardening. Keep each phase's additions integrated into the main application rather than developing isolated demos that cannot be combined.
