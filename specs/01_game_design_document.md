# Birthday Bash

## Overview

Birthday Bash is a single-player, Diablo-style game with top-down isometric graphics. The name has no bearing on the mechanics.

The player explores the Lich's Den, levels up their character, and attempts to defeat the Lich. The dungeon is populated by undead enemies such as skeletons, zombies, and intelligent wandering vampires. The Lich is a high-level undead spellcaster found in the boss room at the end of the dungeon. It can cast powerful magic and summon undead to use as shields.

The initial release includes both classes and all abilities listed below. A run ends when the player dies or reaches the exit after defeating the Lich.

## Technology and Presentation

- The game runs in a desktop browser using WebGL.
- It is single-player and desktop-only.
- Graphics use 2D sprites.
- The isometric camera remains fixed on and follows the player.
- Placeholder art, animation, sound, and music are acceptable for now.

## Run Structure

1. The player selects a class and creates a level-one character.
2. The character spawns on the first floor of a newly generated Lich's Den.
3. The player traverses four generated floors and descends to the boss floor.
4. The player defeats the Lich and reaches the exit that appears in its room.
5. Death at any point ends the run. The player has the option to restart.

Restarting returns the player to class selection with a fresh level-one character and a newly generated dungeon. There is no persistent progression or carry-over between runs in the initial version, although persistence may be added later.

## Controls

- **Right-click:** Move.
- **Left-click:** Use the basic attack when no ability is selected.
- **Ability hotkey, then left-click:** Select an equipped ability and cast it. The keys `1` through `0` are available for active abilities.
- The selected ability remains selected for repeated casts. The player can select a different ability with its hotkey.
- **Escape:** Return left-click to the basic attack.

Unlocked passive abilities work automatically and do not need to be equipped or activated.

Both starting weapons are melee weapons. The Wizard starts with a staff, and the Warrior starts with a long sword.

## Dungeon Generation

The Lich's Den has five floors:

- Floors 1–4 are generated using binary-space partitioning (BSP). Each contains 50 rooms connected by hallways.
- Floor 5 is an unpartitioned boss floor containing the Lich's room.

Room and hallway layout will be tuned through active play and verification.

### Shrines

Rooms on the four generated floors can contain shrines that grant minor temporary bonuses. Each regular room independently has a 2.5% chance to contain a shrine.

1. **Health Shrine:** Increases health regeneration by 50% for 60 seconds.
2. **Mana Shrine:** Increases mana regeneration by 50% for 60 seconds.
3. **Speed Shrine:** Increases movement speed by 20% for 60 seconds.

Shrine effects stack additively rather than multiplicatively. Each application has its own independent 60-second duration. For example, two simultaneous Health Shrine effects provide a total of +100% health regeneration.

Chests are omitted for now.

## Character Progression

New characters begin at level 1 with:

- All four stats at 0.
- Ten stat points to allocate.
- One ability point to spend.
- 25 base health.
- 25 base mana.

Each subsequent level grants five stat points and one ability point. Stats can be assigned freely.

The first level-up requires 50 experience. Each subsequent level's experience requirement is 9% higher than the previous requirement, with fractional results rounded down. Thus, the experience required to advance from level `L` to level `L + 1` is `floor(50 * 1.09^(L - 1))`.

Exact combat formulas and numerical balancing will be tuned during development.

### Stats

1. **Strength:** Increases melee damage. When equipment is added, it will also be used for heavier armor requirements.
2. **Intelligence:** Affects total mana, mana regeneration, and spell damage.
3. **Vitality:** Determines the health pool.
4. **Dexterity:** Determines dodge chance, accuracy against hard-to-hit enemies, and spell fumble chance.

### Ability Unlocks

Each class determines which abilities are available to the character. Spending one ability point unlocks an ability. Abilities currently have only one unlocked version and do not have additional ranks.

There are no prerequisite abilities or requirements to invest points elsewhere in the ability tree. Passive abilities function automatically once unlocked, while active abilities can be assigned to the `1` through `0` hotkeys.

## Classes

### Wizard

The Wizard starts with a melee staff and has the following abilities:

1. **Fireball:** A single-target spell that explodes in a small radius.
2. **Chain Lightning:** Chains from the target to up to five enemies.
3. **Ice Spear:** A single-target spell that slows the enemy by 35% on hit.
4. **Tornado:** Pulls enemies within a radius toward the tornado and deals heavy damage.
5. **Mana Shield:** Absorbs damage using the mana pool instead of health.
6. **Summon Totem:** Summons a small arcane totem that automatically attacks enemies within a small radius. Attacking the totem with an elemental spell infuses its attacks with that element.
7. **Summon Golem:** Summons a high-health, low-damage golem that fights enemies and can aggro nearby enemies.

### Warrior

The Warrior starts with a melee long sword and has the following abilities:

1. **Bash:** A strong strike that deals more damage than a basic attack and stuns the enemy for between two and four seconds.
2. **Berserker's Rage:** Removes all defense while granting attack speed, movement speed, and a Strength bonus.
3. **Parry:** A passive ability with a 15% chance to parry melee attacks.
4. **Slingshot:** Slings a stone at an enemy. It has limited range and is intended to poke or finish off enemies rather than deal heavy damage.
5. **Spin Blade:** Spins the character, striking all nearby enemies and pushing them away.
6. **Vampiric Blessing:** Enemies have a 5% chance to drop crystallized blood, which can be picked up to restore a small amount of health.
7. **Rush:** Dashes toward and tackles an enemy at a limited range, allowing the Warrior to close distance.

## Enemies

The dungeon contains the following enemy types:

1. **Skeleton.**
2. **Skeleton Archer.**
3. **Skeleton Mage:** Uses Fireball and Mana Shield.
4. **Zombie.**
5. **Bat.**
6. **Vampire:** A relatively strong enemy that wanders through the dungeon.

## Boss: The Lich

The Lich is an undead spellcaster located on floor 5.

### Abilities

1. **Fireball.**
2. **Summon:** Brings in a mixture of skeletons of all kinds and zombies. It summons eight minions by default and cannot be spammed. If fewer than three summons remain, it can be cast again; any previous summons crumble and are replaced by the new ones.
3. **Arcane Push:** Used when an enemy is close and pushes that enemy away.
4. **Arcane Pull:** Pulls an enemy close.
5. **Slash:** An area-of-effect slash targeting the area in front of the Lich.

### Boss Defeat and Exit

When the Lich dies, an exit appears in the boss room. The player must reach the exit to complete the run. Any surviving summoned minions remain active and can still kill the player before they escape.

## Deferred Systems

- Loot and item drops.
- Chests.
- General equipment beyond the starting staff and long sword.
- Prefix and suffix item modifiers.
- Persistent progression between runs.

When general equipment is introduced, any class may equip any item as long as the character meets its stat requirements.
