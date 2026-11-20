import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTER, PROGRESSION } from '../src/config.js';
import { Character } from '../src/world/character.js';
import { Enemy } from '../src/world/enemies.js';
import { experienceToNextLevel } from '../src/world/progression.js';
import {
  abilitiesForClass,
  cooldownKey,
  findAbility,
  hotkeySlotForCode,
  validateAbilityCast,
} from '../src/world/abilities.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Grid } from '../src/world/grid.js';
import { Rng } from '../src/world/rng.js';
import { resolveMeleeAttack } from '../src/world/combat.js';
import { createSummon } from '../src/world/summons.js';
import { PickupSystem } from '../src/world/pickups.js';

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

function makeSystems() {
  const projectiles = new ProjectileSystem();
  const areas = new AreaEffectSystem();
  const effects = new TimedEffectSystem();
  const cooldowns = new Cooldowns();
  return {
    projectiles,
    areas,
    effects,
    cooldowns,
    abilities: new AbilitySystem({ projectiles, areas, effects, cooldowns }),
  };
}

function makeHooks() {
  const hits = [];
  return {
    hits,
    hooks: {
      damage: (target, amount) => {
        const applied = target.takeDamage(amount);
        hits.push({ target, amount, applied });
        return { applied, killed: !target.alive };
      },
      beam: () => {},
      summon: () => null,
    },
  };
}

function unlocked(classId, abilityId) {
  const character = new Character(classId);
  character.spellFumbleChance = 0;
  assert.equal(character.unlockAbility(abilityId), true, `${classId} unlocks ${abilityId}`);
  return character;
}

test('experience to advance follows floor(50 * 1.09^(L - 1))', () => {
  assert.equal(experienceToNextLevel(1), 50);
  assert.equal(experienceToNextLevel(2), 54);
  assert.equal(experienceToNextLevel(3), 59);
  for (let level = 1; level <= 25; level++) {
    assert.equal(experienceToNextLevel(level), Math.floor(PROGRESSION.baseExperience * 1.09 ** (level - 1)));
  }
});

test('leveling grants points without losing stats or unlocked abilities', () => {
  const character = new Character('wizard');
  assert.equal(character.allocateStat('intelligence', 2), true);
  assert.equal(character.unlockAbility('fireball'), true);
  const statsBefore = { ...character.stats };

  assert.equal(character.awardExperience(49), 49);
  assert.equal(character.level, 1);
  assert.equal(character.awardExperience(1), 0);
  assert.equal(character.level, 2);
  assert.equal(character.experience, 0);
  assert.equal(character.statPoints, CHARACTER.startingStatPoints - 2 + PROGRESSION.statPointsPerLevel);
  assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints - 1 + PROGRESSION.abilityPointsPerLevel);
  assert.deepEqual(character.stats, statsBefore);
  assert.equal(character.hasAbility('fireball'), true);
  assert.equal(character.hotbar[0], 'basicAttack');
  assert.equal(character.hotbar[1], 'fireball');
  assert.equal(character.experienceToNextLevel, 54);

  assert.equal(character.awardExperience(54), 0);
  assert.equal(character.level, 3);
});

test('experience overflow carries across multiple level-ups', () => {
  const character = new Character('warrior');
  const earned = 50 + 54 + 59 + 10;
  assert.equal(character.awardExperience(earned), 10);
  assert.equal(character.level, 4);
  assert.equal(character.statPoints, CHARACTER.startingStatPoints + 3 * PROGRESSION.statPointsPerLevel);
  assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints + 3 * PROGRESSION.abilityPointsPerLevel);
  assert.equal(character.experienceToNextLevel, experienceToNextLevel(4));
});

test('every class ability can be unlocked without another ability', () => {
  for (const classId of ['wizard', 'warrior']) {
    for (const ability of abilitiesForClass(classId)) {
      const character = new Character(classId);
      assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints);
      assert.equal(character.unlockAbility(ability.id), true, `${classId}: ${ability.id}`);
      assert.equal(character.hasAbility(ability.id), true);
      assert.equal(character.unlockAbility(ability.id), false, `${classId}: ${ability.id} cannot be unlocked twice`);
      assert.equal(character.unlockAbility(ability.id), false);
    }
  }
});

test('ability unlocks spend exactly one point and reject unknown abilities', () => {
  const character = new Character('warrior');
  assert.equal(character.unlockAbility('meteor'), false);
  assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints);
  character.abilityPoints = 1;
  assert.equal(character.unlockAbility('bash'), true);
  assert.equal(character.abilityPoints, 0);
  assert.equal(character.unlockAbility('spinBlade'), false);
  assert.equal(character.hasAbility('spinBlade'), false);
});

test('passives operate automatically once unlocked', () => {
  const warrior = new Character('warrior');
  assert.equal(warrior.parryChance, 0);
  assert.equal(warrior.vampiricBlessing, null);

  assert.equal(warrior.unlockAbility('parry'), true);
  close(warrior.parryChance, 0.15);
  assert.equal(warrior.hotbar.includes('parry'), false);

  const defender = new Enemy('trainingDummy', warrior.x + 1, warrior.y);
  defender.parryChance = 1;
  const parried = resolveMeleeAttack(warrior, defender, new Rng(7));
  assert.equal(parried.ok, true);
  assert.equal(parried.parried, true);
  assert.equal(parried.damage, 0);
  assert.equal(defender.health, defender.maxHealth);

  const blessed = new Character('warrior');
  assert.equal(blessed.unlockAbility('vampiricBlessing'), true);
  close(blessed.vampiricBlessing.chance, 0.05);
  assert.ok(blessed.vampiricBlessing.heal > 0);
});

test('active abilities auto-assign to hotkeys and can be reassigned', () => {
  const character = new Character('wizard');
  assert.equal(character.hotbar[0], 'basicAttack');
  assert.equal(character.unlockAbility('fireball'), true);
  assert.equal(character.hotbar[1], 'fireball');

  character.abilityPoints = 1;
  assert.equal(character.unlockAbility('iceSpear'), true);
  assert.equal(character.hotbar[2], 'iceSpear');

  assert.equal(character.assignAbility(5, 'fireball'), true);
  assert.equal(character.hotbar[1], null);
  assert.equal(character.hotbar[5], 'fireball');
  assert.equal(character.hotbar[2], 'iceSpear');

  assert.equal(character.assignAbility(9, 'meteor'), false);
  assert.equal(character.assignAbility(10, 'fireball'), false);
  assert.equal(character.assignAbility(1, 'parry'), false);
});

test('basic attack is always available, assignable and selects the basic attack mode', () => {
  const character = new Character('warrior');
  assert.equal(character.hotbarAbility(0).id, 'basicAttack');
  assert.equal(character.hotbarAbility(0).name, 'Basic Attack');
  assert.equal(character.unlockAbility('basicAttack'), false);
  assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints);

  assert.equal(character.selectAbility('bash'), false);
  assert.equal(character.selectHotkey(0), true);
  assert.equal(character.selectedAbilityId, null);
  assert.equal(character.selectedAbility(), null);

  character.abilityPoints = 1;
  assert.equal(character.unlockAbility('bash'), true);
  assert.equal(character.selectHotkey(1), true);
  assert.equal(character.selectedAbility().id, 'bash');

  assert.equal(character.selectHotkey(0), true);
  assert.equal(character.selectedAbility(), null);
  assert.equal(character.assignAbility(9, 'basicAttack'), true);
  assert.equal(character.hotbar[0], null);
  assert.equal(character.hotbar[9], 'basicAttack');
});

test('hotkey codes map to the ten ability slots', () => {
  assert.equal(hotkeySlotForCode('Digit1'), 0);
  assert.equal(hotkeySlotForCode('Digit9'), 8);
  assert.equal(hotkeySlotForCode('Digit0'), 9);
  assert.equal(hotkeySlotForCode('Numpad4'), 3);
  assert.equal(hotkeySlotForCode('KeyK'), null);
});

test('selection persists, switches by hotkey and resets to basic attacks', () => {
  const character = new Character('wizard');
  assert.equal(character.unlockAbility('fireball'), true);
  character.abilityPoints = 1;
  assert.equal(character.unlockAbility('chainLightning'), true);

  assert.equal(character.selectHotkey(1), true);
  assert.equal(character.selectedAbility().id, 'fireball');
  assert.equal(character.selectHotkey(2), true);
  assert.equal(character.selectedAbility().id, 'chainLightning');
  assert.equal(character.selectAbility('iceSpear'), false);
  assert.equal(character.selectedAbility().id, 'chainLightning');
  assert.equal(character.selectHotkey(7), false);
  assert.equal(character.selectedAbility().id, 'chainLightning');

  assert.equal(character.selectHotkey(0), true);
  assert.equal(character.selectedAbilityId, null);
  assert.equal(character.selectedAbility(), null);

  character.resetSelection();
  assert.equal(character.selectedAbilityId, null);
  assert.equal(character.selectedAbility(), null);
});

test('cast validation rejects locked, passive, dead, distant and unaffordable casts', () => {
  const { cooldowns } = makeSystems();
  const fireball = findAbility('wizard', 'fireball');
  const character = new Character('wizard');
  const target = new Enemy('trainingDummy', character.x + 2, character.y);

  assert.equal(validateAbilityCast({ caster: character, ability: fireball, target, cooldowns }).reason, 'locked');

  character.unlockAbility('fireball');
  assert.equal(validateAbilityCast({ caster: character, ability: fireball, target, cooldowns }).ok, true);

  const far = new Enemy('trainingDummy', character.x + 40, character.y);
  assert.equal(validateAbilityCast({ caster: character, ability: fireball, target: far, cooldowns }).reason, 'range');

  const dead = new Enemy('trainingDummy', character.x + 2, character.y);
  dead.alive = false;
  assert.equal(validateAbilityCast({ caster: character, ability: fireball, target: dead, cooldowns }).reason, 'target');

  character.mana = 0;
  assert.equal(validateAbilityCast({ caster: character, ability: fireball, target, cooldowns }).reason, 'mana');
  character.mana = character.maxMana;

  cooldowns.start(cooldownKey(fireball), 2);
  const cooling = validateAbilityCast({ caster: character, ability: fireball, target, cooldowns });
  assert.equal(cooling.reason, 'cooldown');
  assert.ok(cooling.remaining > 1.9);

  const warrior = new Character('warrior');
  warrior.unlockAbility('parry');
  const parry = findAbility('warrior', 'parry');
  assert.equal(validateAbilityCast({ caster: warrior, ability: parry, cooldowns }).reason, 'passive');
});

test('point-target abilities reject out-of-range casts', () => {
  const character = unlocked('wizard', 'tornado');
  const tornado = findAbility('wizard', 'tornado');
  const near = { x: character.x + 2, y: character.y };
  const far = { x: character.x + 40, y: character.y };
  assert.equal(validateAbilityCast({ caster: character, ability: tornado, point: near }).ok, true);
  assert.equal(validateAbilityCast({ caster: character, ability: tornado, point: far }).reason, 'range');
  assert.equal(validateAbilityCast({ caster: character, ability: tornado }).reason, 'target');
});

test('a cast spends mana, starts its cooldown and fires a projectile', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'fireball');
  const fireball = findAbility('wizard', 'fireball');
  const target = new Enemy('trainingDummy', character.x + 1.5, character.y);
  const { hits, hooks } = makeHooks();
  const manaBefore = character.mana;
  assert.equal(character.selectAbility('fireball'), true);

  const result = systems.abilities.cast(character, fireball, {
    target,
    entities: [target],
    rng: new Rng(11),
    hooks,
  });

  assert.equal(result.ok, true);
  assert.equal(character.selectedAbilityId, 'fireball', 'selection survives a cast');
  close(character.mana, manaBefore - fireball.manaCost);
  assert.ok(systems.cooldowns.remaining(cooldownKey(fireball)) > 1.5);
  assert.equal(systems.projectiles.projectiles.length, 1);

  for (let i = 0; i < 120 && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid: new Grid(20, 20, 0), entities: [target] });
  }
  assert.equal(hits.length, 1);
  assert.equal(target.health, target.maxHealth - hits[0].applied);

  const again = systems.abilities.cast(character, fireball, { target, entities: [target], hooks });
  assert.equal(again.reason, 'cooldown');
});

test('fireball splash damages enemies around the impact', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'fireball');
  const fireball = findAbility('wizard', 'fireball');
  const target = new Enemy('trainingDummy', character.x + 2, character.y);
  const neighbor = new Enemy('trainingDummy', character.x + 2.6, character.y + 0.3);
  const distant = new Enemy('trainingDummy', character.x + 6, character.y + 6);
  const { hooks } = makeHooks();

  systems.abilities.cast(character, fireball, {
    target,
    entities: [target, neighbor, distant],
    rng: new Rng(3),
    hooks,
  });
  for (let i = 0; i < 120 && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid: new Grid(30, 30, 0), entities: [target, neighbor, distant] });
  }

  assert.ok(target.health < target.maxHealth);
  assert.ok(neighbor.health < neighbor.maxHealth);
  assert.equal(distant.health, distant.maxHealth);
});

test('chain lightning never exceeds five targets and never repeats one', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'chainLightning');
  const ability = findAbility('wizard', 'chainLightning');
  character.x = 1;
  character.y = 1;

  const enemies = [];
  for (let i = 0; i < 7; i++) {
    enemies.push(new Enemy('trainingDummy', 3 + i * 1.2, 1));
  }
  const { hits, hooks } = makeHooks();

  const result = systems.abilities.cast(character, ability, {
    target: enemies[0],
    entities: enemies,
    rng: new Rng(5),
    hooks,
  });

  assert.equal(result.ok, true);
  assert.equal(hits.length, ability.chain.maxTargets);
  assert.equal(new Set(hits.map((hit) => hit.target.id)).size, hits.length);
});

test('tornado pulls enemies inward and damages them on each tick', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'tornado');
  const ability = findAbility('wizard', 'tornado');
  character.x = 5;
  character.y = 5;
  const grid = new Grid(30, 30, 0);
  const point = { x: 8, y: 5 };
  const enemy = new Enemy('trainingDummy', 9.5, 5);
  const entities = [enemy];
  const { hooks } = makeHooks();

  systems.abilities.cast(character, ability, { point, entities, grid, rng: new Rng(2), hooks });
  assert.equal(systems.areas.effects.length, 1);
  const before = Math.hypot(enemy.x - point.x, enemy.y - point.y);

  systems.areas.update(0.35, { grid, entities });

  const after = Math.hypot(enemy.x - point.x, enemy.y - point.y);
  assert.ok(after < before, `${after} should be closer than ${before}`);
  assert.ok(enemy.health < enemy.maxHealth);
});

test("spinning blade damages and knocks nearby enemies away without crossing walls", () => {
  const systems = makeSystems();
  const character = unlocked('warrior', 'spinBlade');
  const ability = findAbility('warrior', 'spinBlade');
  character.x = 5;
  character.y = 5;
  const grid = new Grid(20, 20, 0);
  const enemy = new Enemy('trainingDummy', 6.2, 5);
  const { hooks } = makeHooks();

  const result = systems.abilities.cast(character, ability, {
    entities: [enemy],
    grid,
    rng: new Rng(4),
    hooks,
  });

  assert.equal(result.ok, true);
  assert.ok(Math.hypot(enemy.x - character.x, enemy.y - character.y) > 1.2);
  assert.ok(enemy.health < enemy.maxHealth);

  const wallGrid = new Grid(20, 20, 0);
  for (let y = 0; y < 20; y++) wallGrid.set(7, y, 1);
  const walled = new Enemy('trainingDummy', 6.5, 5);
  systems.abilities.cast(character, ability, { entities: [walled], grid: wallGrid, rng: new Rng(4), hooks });
  assert.ok(walled.x < 7, 'knockback stops at the wall');
});

test('bash stuns for two to four seconds', () => {
  const systems = makeSystems();
  const character = unlocked('warrior', 'bash');
  const ability = findAbility('warrior', 'bash');
  const target = new Enemy('trainingDummy', character.x + 1.2, character.y);
  const { hooks } = makeHooks();

  for (let i = 0; i < 20; i++) {
    systems.cooldowns.clear();
    character.mana = character.maxMana;
    target.health = target.maxHealth;
    const result = systems.abilities.cast(character, ability, {
      target,
      entities: [target],
      rng: new Rng(i + 1),
      hooks,
    });
    assert.equal(result.ok, true);
    assert.ok(target.stunRemaining >= 2, `stun ${target.stunRemaining} >= 2`);
    assert.ok(target.stunRemaining <= 4, `stun ${target.stunRemaining} <= 4`);
  }
});

test('mana shield absorbs damage with mana and expires cleanly', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'manaShield');
  const ability = findAbility('wizard', 'manaShield');
  const { hooks } = makeHooks();

  assert.equal(systems.abilities.cast(character, ability, { entities: [], hooks }).ok, true);
  assert.equal(character.hasBuff('manaShield'), true);
  const manaAfterCast = character.mana;
  assert.equal(manaAfterCast, character.maxMana - ability.manaCost);

  character.takeDamage(5);
  assert.equal(character.health, character.maxHealth);
  close(character.mana, manaAfterCast - 5);

  character.mana = 2;
  character.takeDamage(10);
  assert.equal(character.mana, 0);
  close(character.health, character.maxHealth - 8);

  systems.effects.update(ability.buff.duration + 0.1);
  assert.equal(character.hasBuff('manaShield'), false);
  assert.equal(character.damageFilter, null);
});

test("berserker's rage zeroes defense, boosts speed and Strength, then expires", () => {
  const systems = makeSystems();
  const character = unlocked('warrior', 'berserkersRage');
  const ability = findAbility('warrior', 'berserkersRage');
  character.allocateStat('dexterity', 4);
  character.recalculate({ fill: true });
  const defenseBefore = character.defense;
  const speedBefore = character.speed;
  const strengthBefore = character.effectiveStats.strength;
  const { hooks } = makeHooks();

  assert.ok(defenseBefore > 0);
  assert.equal(systems.abilities.cast(character, ability, { entities: [], hooks }).ok, true);

  assert.equal(character.defense, 0);
  assert.equal(character.damageReduction, 0);
  close(character.effectiveStats.strength, strengthBefore + 6);
  assert.ok(character.speed > speedBefore);
  close(character.attackSpeedMultiplier, 0.7);

  systems.effects.update(ability.buff.duration + 0.1);
  assert.equal(character.defense, defenseBefore);
  close(character.speed, speedBefore);
  close(character.effectiveStats.strength, strengthBefore);
  close(character.attackSpeedMultiplier, 1);
});

test('ice spear applies a 35% slow that expires', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'iceSpear');
  const ability = findAbility('wizard', 'iceSpear');
  const target = new Enemy('trainingDummy', character.x + 1.5, character.y);
  const { hooks } = makeHooks();
  const grid = new Grid(20, 20, 0);

  systems.abilities.cast(character, ability, { target, entities: [target], rng: new Rng(6), hooks });
  for (let i = 0; i < 120 && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid, entities: [target] });
  }

  close(target.moveSpeedMultiplier, 0.65);
  assert.equal(target.health < target.maxHealth, true);
  systems.effects.update(ability.status.slowDuration + 0.1);
  close(target.moveSpeedMultiplier, 1);
});

test('summons are created at the cursor point with the configured stats', () => {
  const systems = makeSystems();
  const character = unlocked('wizard', 'summonTotem');
  const ability = findAbility('wizard', 'summonTotem');
  const point = { x: character.x + 3, y: character.y };
  let summon = null;
  let receivedPoint = null;
  const hooks = {
    damage: () => ({ applied: 0, killed: false }),
    beam: () => {},
    summon: (abilityDef, caster, summonPoint) => {
      receivedPoint = summonPoint;
      summon = createSummon(abilityDef, caster, {
        x: summonPoint.x,
        y: summonPoint.y,
        damage: abilityDef.summon.damage,
      });
      return summon;
    },
  };

  assert.equal(systems.abilities.cast(character, ability, { point, entities: [], hooks }).ok, true);
  assert.deepEqual(receivedPoint, point);
  assert.ok(summon);
  assert.equal(summon.faction, 'ally');
  assert.equal(summon.x, point.x);
  assert.equal(summon.y, point.y);
  assert.equal(summon.maxHealth, ability.summon.health);
  assert.equal(summon.remaining, ability.summon.duration);
});

test('totem and golem are point-targeted with a four-tile range', () => {
  for (const abilityId of ['summonTotem', 'summonGolem']) {
    const character = unlocked('wizard', abilityId);
    const ability = findAbility('wizard', abilityId);
    assert.equal(ability.target, 'point');
    assert.equal(ability.range, 4);

    const near = { x: character.x + 4, y: character.y };
    const far = { x: character.x + 4.05, y: character.y };
    assert.equal(validateAbilityCast({ caster: character, ability, point: near }).ok, true);
    assert.equal(validateAbilityCast({ caster: character, ability, point: far }).reason, 'range');
    assert.equal(validateAbilityCast({ caster: character, ability }).reason, 'target');
  }
});

test('rush closes the distance and stops at its target', () => {
  const systems = makeSystems();
  const character = unlocked('warrior', 'rush');
  const ability = findAbility('warrior', 'rush');
  character.x = 5;
  character.y = 5;
  const target = new Enemy('trainingDummy', 9, 5);
  const grid = new Grid(30, 30, 0);
  const { hooks } = makeHooks();

  const result = systems.abilities.cast(character, ability, {
    target,
    entities: [target],
    grid,
    rng: new Rng(8),
    hooks,
  });

  assert.equal(result.ok, true);
  const distance = Math.hypot(target.x - character.x, target.y - character.y);
  assert.ok(distance < 2, `stops near the target (${distance})`);
  assert.ok(distance >= 1, `does not overlap the target (${distance})`);
  assert.ok(target.health < target.maxHealth);
});

test('crystallized blood pickups heal within the cap and expire', () => {
  const pickups = new PickupSystem();
  const player = new Character('warrior');
  player.x = 1;
  player.y = 1;
  player.health = 10;

  pickups.spawn({ x: 1, y: 1, heal: 6, ttl: 5 });
  let collected = 0;
  pickups.update(0.01, {
    player,
    onCollect: (pickup) => {
      collected += 1;
      player.heal(pickup.healAmount);
    },
  });
  assert.equal(collected, 1);
  assert.equal(pickups.size, 0);
  assert.equal(player.health, 16);

  pickups.spawn({ x: 10, y: 10, heal: 50, ttl: 0.2 });
  pickups.update(0.3, { player });
  assert.equal(pickups.size, 0);
});

test('ability definitions keep provisional tuning in configuration', () => {
  for (const classId of ['wizard', 'warrior']) {
    const list = abilitiesForClass(classId);
    assert.equal(list.length, 7);
    const ids = new Set(list.map((ability) => ability.id));
    assert.equal(ids.size, list.length);
    for (const ability of list) {
      assert.equal(typeof ability.name, 'string');
      assert.ok(ability.kind === 'active' || ability.kind === 'passive');
      if (ability.kind === 'active') {
        assert.ok(ability.manaCost >= 0);
        assert.ok(ability.cooldown >= 0);
      }
    }
  }
  assert.equal(new Character('wizard').experienceToNextLevel, 50);
});
