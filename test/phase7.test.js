import test from 'node:test';
import assert from 'node:assert/strict';

import { ABILITIES } from '../src/config.js';
import { Character } from '../src/world/character.js';
import { Enemy } from '../src/world/enemies.js';
import { updateEnemy } from '../src/world/enemyAI.js';
import { abilityDamage, findAbility, validateAbilityCast } from '../src/world/abilities.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { resolveMeleeAttack, rollMeleeDamage } from '../src/world/combat.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Grid } from '../src/world/grid.js';
import { Rng } from '../src/world/rng.js';
import { PickupSystem, rollBloodDrop } from '../src/world/pickups.js';

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
  const explosions = [];
  const dashes = [];
  return {
    hits,
    explosions,
    dashes,
    hooks: {
      damage: (target, amount) => {
        const applied = target.takeDamage(amount);
        hits.push({ target, amount, applied });
        return { applied, killed: !target.alive };
      },
      beam: () => {},
      explosion: (x, y, radius, element) => explosions.push({ x, y, radius, element }),
      dash: (from, to) => dashes.push({ from, to }),
      summon: () => null,
    },
  };
}

function sequenceRng(values, fallback = 0.5) {
  let index = 0;
  return {
    float() {
      return index < values.length ? values[index++] : fallback;
    },
    range(min, max) {
      return min + this.float() * (max - min);
    },
    chance(probability) {
      return this.float() < probability;
    },
  };
}

function unlocked(abilityId) {
  const character = new Character('warrior');
  character.spellFumbleChance = 0;
  character.mana = character.maxMana;
  assert.equal(character.unlockAbility(abilityId), true, `warrior unlocks ${abilityId}`);
  return character;
}

function advanceProjectiles(systems, entities, grid, frames = 240) {
  for (let i = 0; i < frames && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid, entities });
  }
}

test('the warrior kit defines all seven abilities with the required roles', () => {
  const expected = {
    bash: 'singleTarget',
    berserkersRage: 'buff',
    parry: 'passive',
    slingshot: 'projectile',
    spinBlade: 'area',
    vampiricBlessing: 'passive',
    rush: 'dash',
  };
  assert.equal(ABILITIES.warrior.length, 7);
  for (const [abilityId, category] of Object.entries(expected)) {
    const ability = findAbility('warrior', abilityId);
    assert.ok(ability, `${abilityId} exists`);
    assert.equal(ability.category, category);

    const character = unlocked(abilityId);
    if (ability.kind === 'passive') {
      assert.equal(character.hotbar.includes(abilityId), false, 'passives never occupy a hotkey');
      assert.equal(character.selectAbility(abilityId), false, 'passives are not selectable');
    } else {
      assert.equal(character.hotbar.includes(abilityId), true);
      assert.equal(character.selectAbility(abilityId), true);
      assert.equal(character.selectedAbilityId, abilityId);
    }
  }

  assert.equal(findAbility('warrior', 'bash').stun.min, 2);
  assert.equal(findAbility('warrior', 'bash').stun.max, 4);
  assert.equal(findAbility('warrior', 'berserkersRage').buff.zeroDefense, true);
  assert.ok(findAbility('warrior', 'berserkersRage').buff.stats.strength > 0);
  assert.ok(findAbility('warrior', 'berserkersRage').buff.speedMultiplier > 1);
  assert.ok(findAbility('warrior', 'berserkersRage').buff.attackSpeedMultiplier < 1);
  assert.equal(findAbility('warrior', 'parry').passive.parryChance, 0.15);
  assert.ok(findAbility('warrior', 'slingshot').range <= 6);
  assert.ok(findAbility('warrior', 'slingshot').damageMultiplier < 1);
  assert.ok(findAbility('warrior', 'spinBlade').area.knockback > 0);
  assert.equal(findAbility('warrior', 'vampiricBlessing').passive.bloodDropChance, 0.05);
  assert.ok(findAbility('warrior', 'rush').dash.stopDistance > 0);
});

test('bash deals bonus damage and stuns the target for two to four seconds', () => {
  const systems = makeSystems();
  const character = unlocked('bash');
  const ability = findAbility('warrior', 'bash');
  const basicDamage = rollMeleeDamage(character);
  assert.ok(abilityDamage(character, ability) > basicDamage, 'bash hits harder than a basic attack');

  for (let seed = 1; seed <= 24; seed++) {
    const target = new Enemy('trainingDummy', character.x + 1.2, character.y);
    const { hooks } = makeHooks();
    systems.cooldowns.clear();
    character.mana = character.maxMana;

    const result = systems.abilities.cast(character, ability, {
      target,
      entities: [target],
      rng: new Rng(seed),
      hooks,
    });

    assert.equal(result.ok, true);
    assert.ok(target.health < target.maxHealth, 'bash damages the target');
    assert.ok(target.stunRemaining >= 2, `stun ${target.stunRemaining} >= 2`);
    assert.ok(target.stunRemaining <= 4, `stun ${target.stunRemaining} <= 4`);
    assert.equal(result.events.some((event) => event.type === 'stun'), true);
  }
});

test('a stunned enemy cannot move or attack until the stun expires', () => {
  const systems = makeSystems();
  const character = unlocked('bash');
  const ability = findAbility('warrior', 'bash');
  const grid = new Grid(40, 40, 0);
  const enemy = new Enemy('skeleton', character.x + 1.2, character.y);
  enemy.aggroed = true;
  const { hooks } = makeHooks();

  const cast = systems.abilities.cast(character, ability, {
    target: enemy,
    entities: [enemy],
    rng: new Rng(4),
    hooks,
  });
  assert.equal(cast.ok, true);
  const stunnedAt = { x: enemy.x, y: enemy.y };
  const stunDuration = enemy.stunRemaining;
  assert.ok(stunDuration >= 2 && stunDuration <= 4);

  const context = {
    player: character,
    entities: [character, enemy],
    grid,
    rng: new Rng(9),
    abilitySystem: systems.abilities,
    hooks: {},
  };

  for (let i = 0; i < 30; i++) {
    updateEnemy(enemy, 1 / 30, context);
    systems.effects.update(1 / 30);
  }
  assert.equal(enemy.x, stunnedAt.x, 'stunned enemy holds position');
  assert.equal(enemy.y, stunnedAt.y, 'stunned enemy holds position');
  assert.ok(enemy.stunRemaining > 0);

  systems.effects.update(stunDuration + 0.1);
  assert.equal(enemy.stunRemaining, 0);
});

test("berserker's rage removes all defense and boosts strength, speed and attack speed", () => {
  const systems = makeSystems();
  const character = unlocked('berserkersRage');
  const ability = findAbility('warrior', 'berserkersRage');
  character.allocateStat('dexterity', 4);
  character.recalculate({ fill: true });
  const defenseBefore = character.defense;
  const speedBefore = character.speed;
  const strengthBefore = character.effectiveStats.strength;
  const { hooks } = makeHooks();

  assert.ok(defenseBefore > 0);
  assert.equal(systems.abilities.cast(character, ability, { entities: [], hooks }).ok, true);

  assert.equal(character.defense, 0, 'all defense is removed');
  assert.equal(character.damageReduction, 0);
  close(character.effectiveStats.strength, strengthBefore + ability.buff.stats.strength);
  assert.ok(character.speed > speedBefore);
  close(character.speed, speedBefore * ability.buff.speedMultiplier);
  close(character.attackSpeedMultiplier, ability.buff.attackSpeedMultiplier);
  assert.equal(systems.effects.countFor(character, 'berserkersRage'), 1);

  systems.abilities.cast(character, ability, { entities: [], hooks });
  assert.equal(systems.effects.countFor(character, 'berserkersRage'), 1, 'recasing refreshes one buff');

  systems.effects.update(ability.buff.duration + 0.1);
  assert.equal(character.hasBuff('berserkersRage'), false);
  assert.equal(character.defense, defenseBefore);
  close(character.damageReduction, defenseBefore / (defenseBefore + 60));
  close(character.speed, speedBefore);
  close(character.effectiveStats.strength, strengthBefore);
  close(character.attackSpeedMultiplier, 1);
});

test('parry is automatic, rolls 15 percent, and only applies to melee attacks', () => {
  const defender = unlocked('parry');
  close(defender.parryChance, 0.15);
  assert.equal(defender.hotbar.includes('parry'), false);

  const attacker = new Enemy('skeleton', defender.x + 1, defender.y);
  const parried = resolveMeleeAttack(attacker, defender, sequenceRng([0.5, 0.1]));
  assert.equal(parried.parried, true);
  assert.equal(parried.hit, false);
  assert.equal(parried.damage, 0);
  assert.equal(defender.health, defender.maxHealth);

  const hit = resolveMeleeAttack(attacker, defender, sequenceRng([0.5, 0.9]));
  assert.equal(hit.parried, false);
  assert.equal(hit.hit, true);
  assert.ok(defender.health < defender.maxHealth);
  defender.health = defender.maxHealth;

  const far = new Enemy('skeleton', defender.x + 5, defender.y);
  const outOfRange = resolveMeleeAttack(far, defender, sequenceRng([0.5, 0.1]));
  assert.equal(outOfRange.ok, false);
  assert.equal(outOfRange.reason, 'out-of-range');
  assert.equal(defender.health, defender.maxHealth);

  const systems = makeSystems();
  const archer = new Enemy('skeletonArcher', defender.x + 6, defender.y);
  const arrow = archer.abilities.find((ability) => ability.id === 'boneArrow');
  defender.parryChance = 1;
  const { hooks } = makeHooks();
  systems.abilities.cast(archer, arrow, {
    target: defender,
    entities: [defender, archer],
    grid: new Grid(30, 30, 0),
    rng: new Rng(2),
    cooldowns: archer.cooldowns,
    hooks,
  });
  advanceProjectiles(systems, [defender, archer], new Grid(30, 30, 0));
  assert.ok(defender.health < defender.maxHealth, 'ranged attacks bypass parry');
});

test('slingshot is a limited-range low-damage poke', () => {
  const systems = makeSystems();
  const character = unlocked('slingshot');
  const ability = findAbility('warrior', 'slingshot');
  const grid = new Grid(30, 30, 0);
  const { hooks, hits } = makeHooks();

  const target = new Enemy('trainingDummy', character.x + 4, character.y);
  const farTarget = new Enemy('trainingDummy', character.x + ability.range + target.radius + 0.2, character.y);
  assert.equal(
    validateAbilityCast({ caster: character, ability, target: farTarget }).reason,
    'range',
  );

  assert.equal(systems.abilities.cast(character, ability, { target, entities: [target], rng: new Rng(3), hooks }).ok, true);
  advanceProjectiles(systems, [target], grid);

  const shot = hits.find((hit) => hit.target === target);
  assert.ok(shot && shot.applied > 0);
  assert.ok(shot.applied < rollMeleeDamage(character), 'slingshot deals less than a sword swing');
  assert.equal(target.stunRemaining ?? 0, 0);
  assert.equal(systems.projectiles.projectiles.length, 0);
});

test('spin blade damages and knocks back only nearby valid enemies, respecting walls', () => {
  const systems = makeSystems();
  const character = unlocked('spinBlade');
  const ability = findAbility('warrior', 'spinBlade');
  character.x = 5;
  character.y = 5;
  const grid = new Grid(20, 20, 0);
  const near = new Enemy('trainingDummy', 6.2, 5);
  const far = new Enemy('trainingDummy', 12, 5);
  const dead = new Enemy('trainingDummy', 5.5, 5.6);
  dead.takeDamage(9999);
  const { hooks, explosions } = makeHooks();

  const result = systems.abilities.cast(character, ability, {
    entities: [near, far, dead],
    grid,
    rng: new Rng(4),
    hooks,
  });

  assert.equal(result.ok, true);
  assert.ok(near.health < near.maxHealth);
  assert.ok(Math.hypot(near.x - character.x, near.y - character.y) > 1.2, 'knocked outward');
  assert.equal(far.health, far.maxHealth);
  assert.equal(far.x, 12);
  assert.equal(dead.health, 0);
  assert.equal(dead.x, 5.5);
  assert.equal(explosions.length, 1);
  close(explosions[0].radius, ability.area.radius);

  const wallGrid = new Grid(20, 20, 0);
  for (let y = 0; y < 20; y++) wallGrid.set(7, y, 1);
  const walled = new Enemy('trainingDummy', 6.5, 5);
  systems.abilities.cast(character, ability, { entities: [walled], grid: wallGrid, rng: new Rng(4), hooks });
  assert.ok(walled.x < 7, 'knockback stops at the wall');
});

test('vampiric blessing rolls a 5 percent blood drop that heals and is cleaned up', () => {
  const character = unlocked('vampiricBlessing');
  assert.equal(character.vampiricBlessing.chance, 0.05);
  assert.ok(character.vampiricBlessing.heal > 0);
  assert.ok(character.vampiricBlessing.ttl > 0);

  assert.equal(rollBloodDrop(null, sequenceRng([0])), null);
  assert.equal(rollBloodDrop(character.vampiricBlessing, { chance: () => false }), null);
  const drop = rollBloodDrop(character.vampiricBlessing, { chance: () => true });
  assert.deepEqual(drop, { heal: character.vampiricBlessing.heal, ttl: character.vampiricBlessing.ttl });

  const pickups = new PickupSystem();
  character.x = 1;
  character.y = 1;
  character.health = character.maxHealth - 3;
  pickups.spawn({ x: 1, y: 1, heal: drop.heal, ttl: drop.ttl });
  let collected = 0;
  pickups.update(0.01, {
    player: character,
    onCollect: (pickup) => {
      collected += 1;
      character.heal(pickup.healAmount);
    },
  });
  assert.equal(collected, 1);
  assert.equal(pickups.size, 0);
  close(character.health, Math.min(character.maxHealth, character.maxHealth - 3 + drop.heal));

  pickups.spawn({ x: 10, y: 10, heal: 99, ttl: 0.2 });
  pickups.update(0.3, { player: character });
  assert.equal(pickups.size, 0, 'uncollected blood expires');
  pickups.spawn({ x: 10, y: 10, heal: 6, ttl: 20 });
  pickups.clear();
  assert.equal(pickups.size, 0, 'floor transitions and restarts clear blood');
});

test('rush closes distance, stops at its target, and respects range and walls', () => {
  const systems = makeSystems();
  const character = unlocked('rush');
  const ability = findAbility('warrior', 'rush');
  character.x = 5;
  character.y = 5;
  const grid = new Grid(40, 40, 0);
  const target = new Enemy('trainingDummy', 9, 5);
  const { hooks, dashes } = makeHooks();

  assert.equal(
    validateAbilityCast({ caster: character, ability, target: new Enemy('trainingDummy', 20, 5) }).reason,
    'range',
  );
  assert.equal(validateAbilityCast({ caster: character, ability, target: null }).reason, 'target');

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
  assert.equal(dashes.length, 1);

  const blocked = unlocked('rush');
  blocked.x = 5.5;
  blocked.y = 10.5;
  const wallGrid = new Grid(40, 40, 0);
  for (let y = 0; y < 40; y++) wallGrid.set(7, y, 1);
  const beyond = new Enemy('trainingDummy', 10.5, 10.5);
  systems.cooldowns.clear();
  const blockedResult = systems.abilities.cast(blocked, ability, {
    target: beyond,
    entities: [beyond],
    grid: wallGrid,
    rng: new Rng(10),
    hooks,
  });
  assert.equal(blockedResult.ok, true);
  assert.ok(blocked.x < 7, 'rush cannot cross a wall');
  assert.equal(beyond.health, beyond.maxHealth, 'a blocked rush does not reach the target');
});
