
# Overview.

The name of this game is: Birthday Bash. THe name has no reflection on the mechancis.

Birthday Bash is a Diablo style game with topdown isometric graphics. The basica premise is that you explore a dungeon, collect loot, and level up your character. Every dungeon has a boss.

To limit the scope of development we will be only making one dungeon. The name of the dungeonwill be the Lich's Den, and it will be populated by a lot of undead enemies like skeletons, zombies, and intelligent wandering vampires. The lich itself is a high-level undead found in at the end of the dungeon in a boss room, and it can cast powerful magic and summon undead to use as shields.

# Tech Stack.

This is a browser based game that uses WebGL.

# Movement.

You use the your mouse to right click and target enemies for your abilities. The game is isometric.

# Dungeon Generation.

The dungeon generation is done via binary-space partitioning. We will tune the algorithm via active play and verification. For now there should be hallways, rooms that can contain chest and shrines that five minor bonuses.

## Shrines.

1. Health Shrine. Boosts your health regeneration by 50% for a minute.
2. Mana Shrine. Boosts your mana regenaretation by 50% for a minute.
3. Speed Shrine. Boosts your speed by 20% for a minute.

That's it for now, we can always add more. The shrines should be relatively rare, about 1 out of every 20 rooms should have them.

# Classes.

There are four stats.

1. Strength.
2. Intelligence.
3. Vitality.
4. Dexterity.

Strength increases your melee damage and lets you wear heavier armors.

Intelligence affects total mana, mana regeneration, and influences spell damage.

Vitality determines your health pool.

Dexterity determines your ability to dodge attacks, and your accuracy on hard to hit enemies, and your spells' fumble chance.

The classes determine what ability trees you get, but the stats can be assinged freely on level-up, and you get five points per level.

The exerience requirements for each subsequent level are 9% higher than the previous level so it scales exponentially. The first level up requires 50 experience.

## Wizard.

1. Fireball, single target, explodes in a small radius.
2. Chain Lightning, chains off an enemy on up to five enemies.
3. Ice Spear, single target, slows the enemy 35% on hit.
4. Tornado, pulls enemies in a radius torwards the tornado and does heavy damage.
5. Mana Shield, that absorbs damage using your mana pool instead of your health.
6. Summon Totem, summons a small arcane totem that automatically attacks in a small radius, if you attack it with an elemental spell the totems attacks are infused with that element.
7. Summon Golem, a golem that fights enemies for you. High health, low damage, can aggro nearby enemies.


## Warrior.

1. Bash. A strong strike that deals more damage than normal and stuns the enemy for up to four seconds, but not less than two.
2. Berserker's Rage. You lose all your defense, but you gain attack speed, movement speed, and a bonus to strength.
3. Parry. Passive, has a 15% chance to parry melee attacks.
4. Slingshot. Sling a stone at an enemy. Limited range, and it's meant to poke rather than deal damage, can be used to finish off enemies.
5. Spin Blade, spins the character that strikes all enemies aroudn him and pushes them away.
6. Vampiric Blessing. Enemies have a 5% to drop crystallized blood which can be picked up for a small amount of health.
7. Rush. Dashes and tackles an enemy that is away from you, good for closing distance, but range is limited.

# Enemies.

1. Skeleton.
2. Skeleton archer.
3. Skeleton mage.
4. Zombie.
5. Bat.
6. Vampire, wandering, relatively strong.


## Boss.

### Lich

Undead spellcaster.

#### Abilities.

1. Fireball.
2. Summon. Brings in a mixture of skeletons of all kinds and zombies, can't be spammed. If less than three summons remain, it can be cast again, but the previous summons crumble and are replaced by the new ones. Summons eight minions by default.
3. Arcane Push. Used when the enemy is close, and pushes them away.
4. Arcane Pull. Pulls the enemy close.
5. Slash. An area of effect slash that targets the area infront of the lich.

