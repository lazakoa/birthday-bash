import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTER, CLASSES, FORMULAS } from '../src/config.js';
import { Character } from '../src/world/character.js';
import { Entity } from '../src/world/entity.js';
import { Enemy, spawnTrainingDummies } from '../src/world/enemies.js';
import { createBaseStats, damageReductionFromDefense, deriveStats } from '../src/world/stats.js';
import {
  attackRange,
  hitChance,
  inAttackRange,
  reduceDamage,
  resolveMeleeAttack,
  rollSpellFumble,
} from '../src/world/combat.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { AreaEffectSystem, applyDamageInRadius } from '../src/world/area.js';
import { generateFloor } from '../src/world/floor.js';
import { Grid } from '../src/world/grid.js';
import { Rng } from '../src/world/rng.js';

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('level-one characters start with the design defaults', () => {
  for (const classId of ['wizard', 'warrior']) {
    const character = new Character(classId);
    assert.deepEqual(character.stats, { strength: 0, intelligence: 0, vitality: 0, dexterity: 0 });
    assert.equal(character.statPoints, CHARACTER.startingStatPoints);
    assert.equal(character.abilityPoints, CHARACTER.startingAbilityPoints);
    assert.equal(character.level, 1);
    assert.equal(character.experience, 0);
    assert.equal(character.maxHealth, CHARACTER.baseHealth);
    assert.equal(character.health, CHARACTER.baseHealth);
    assert.equal(character.maxMana, CHARACTER.baseMana);
    assert.equal(character.mana, CHARACTER.baseMana);
    assert.equal(character.weapon.name, CLASSES[classId].weapon.name);
    assert.equal(character.alive, true);
  }
});

test('stat allocation spends points, recalculates and rejects invalid spends', () => {
  const character = new Character('wizard');
  assert.equal(character.allocateStat('vitality', 3), true);
  assert.equal(character.stats.vitality, 3);
  assert.equal(character.statPoints, 7);
  assert.equal(character.maxHealth, CHARACTER.baseHealth + 3 * FORMULAS.healthPerVitality);

  assert.equal(character.allocateStat('vitality', 8), false);
  assert.equal(character.allocateStat('strength', 0), false);
  assert.equal(character.allocateStat('strength', -1), false);
  assert.equal(character.allocateStat('luck', 1), false);
  assert.equal(character.allocateStat('intelligence', 1.5), false);

  assert.equal(character.allocateStat('intelligence', 2), true);
  assert.equal(character.maxMana, CHARACTER.baseMana + 2 * FORMULAS.manaPerIntelligence);
});

test('derived values follow the configured formulas', () => {
  const stats = { strength: 4, intelligence: 3, vitality: 2, dexterity: 8 };
  const derived = deriveStats('warrior', stats);

  assert.equal(derived.maxHealth, CHARACTER.baseHealth + 2 * FORMULAS.healthPerVitality);
  assert.equal(derived.maxMana, CHARACTER.baseMana + 3 * FORMULAS.manaPerIntelligence);
  close(derived.healthRegen, FORMULAS.healthRegenBase + 2 * FORMULAS.healthRegenPerVitality);
  close(derived.manaRegen, FORMULAS.manaRegenBase + 3 * FORMULAS.manaRegenPerIntelligence);
  close(derived.meleeDamageBonus, 4 * FORMULAS.meleeDamagePerStrength);
  close(derived.spellDamageBonus, 3 * FORMULAS.spellDamagePerIntelligence);
  assert.equal(derived.defense, Math.floor(8 * FORMULAS.defensePerDexterity));
  close(derived.damageReduction, damageReductionFromDefense(derived.defense));
  close(derived.dodgeChance, 8 * FORMULAS.dodgePerDexterity);
  close(derived.accuracy, FORMULAS.baseAccuracy + 8 * FORMULAS.accuracyPerDexterity);
  close(derived.spellFumbleChance, FORMULAS.baseSpellFumble - 8 * FORMULAS.spellFumblePerDexterity);
  assert.equal(derived.weapon, CLASSES.warrior.weapon);
});

test('health, mana and death stay inside valid ranges', () => {
  const entity = new Entity({ maxHealth: 20, maxMana: 10 });
  assert.equal(entity.takeDamage(8), 8);
  assert.equal(entity.health, 12);
  assert.equal(entity.takeDamage(999), 12);
  assert.equal(entity.health, 0);
  assert.equal(entity.alive, false);
  assert.equal(entity.deathCount, 1);
  assert.equal(entity.takeDamage(5), 0);
  assert.equal(entity.deathCount, 1);
  assert.equal(entity.heal(10), 0);

  const mage = new Entity({ maxHealth: 20, maxMana: 10 });
  assert.equal(mage.spendMana(4), true);
  assert.equal(mage.mana, 6);
  assert.equal(mage.spendMana(7), false);
  assert.equal(mage.mana, 6);
  assert.equal(mage.restoreMana(100), 4);
  assert.equal(mage.mana, 10);
  mage.takeDamage(5);
  assert.equal(mage.heal(100), 5);
  assert.equal(mage.health, 20);
});

test('both classes use melee basic attacks with range checks', () => {
  for (const classId of ['wizard', 'warrior']) {
    const character = new Character(classId);
    assert.ok(attackRange(character) < 2, `${classId} basic attack is melee`);

    const near = new Enemy('trainingDummy', character.x + 1.2, character.y);
    assert.equal(inAttackRange(character, near), true, `${classId} reaches a nearby target`);

    const far = new Enemy('trainingDummy', character.x + 6, character.y);
    assert.equal(inAttackRange(character, far), false, `${classId} cannot reach a distant target`);

    const result = resolveMeleeAttack(character, far, new Rng(1));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'out-of-range');
  }
});

test('melee attacks resolve damage, dodge and death exactly once', () => {
  const warrior = new Character('warrior');
  warrior.accuracy = 1;
  const target = new Enemy('trainingDummy', warrior.x + 1, warrior.y);
  target.dodgeChance = 0;

  const before = target.health;
  const hit = resolveMeleeAttack(warrior, target, new Rng(1));
  assert.equal(hit.ok, true);
  assert.equal(hit.hit, true);
  assert.ok(hit.damage > 0);
  assert.equal(target.health, before - hit.damage);
  assert.equal(target.deathCount, 0);

  target.health = 1;
  const kill = resolveMeleeAttack(warrior, target, new Rng(1));
  assert.equal(kill.killed, true);
  assert.equal(target.health, 0);
  assert.equal(target.deathCount, 1);

  const after = resolveMeleeAttack(warrior, target, new Rng(1));
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'dead');
  assert.equal(target.deathCount, 1);
});

test('accuracy and dodge combine into a clamped hit chance', () => {
  const attacker = new Character('wizard');
  attacker.accuracy = 0.5;
  const target = new Enemy('trainingDummy', 0, 0);
  target.dodgeChance = 0.2;
  close(hitChance(attacker, target), 0.3);

  attacker.accuracy = 2;
  target.dodgeChance = 0;
  close(hitChance(attacker, target), 0.99);

  attacker.accuracy = -2;
  target.dodgeChance = 1;
  close(hitChance(attacker, target), 0.05);

  const dodged = resolveMeleeAttack(attacker, target, new Rng(1));
  assert.equal(dodged.ok, true);
  assert.equal(dodged.dodged, true);
  assert.equal(dodged.damage, 0);
});

test('defense reduces damage without reaching zero', () => {
  const target = new Entity({ maxHealth: 50 });
  target.damageReduction = 0.5;
  close(reduceDamage(10, target), 5);
  target.damageReduction = 0.99;
  assert.equal(reduceDamage(10, target), 2.5);
  assert.ok(reduceDamage(0.01, target) >= 1);
});

test('spell fumble follows dexterity', () => {
  const clumsy = new Character('wizard');
  clumsy.dexterity = 0;
  clumsy.spellFumbleChance = 1;
  assert.equal(rollSpellFumble(clumsy, new Rng(1)), true);

  clumsy.spellFumbleChance = 0;
  assert.equal(rollSpellFumble(clumsy, new Rng(1)), false);
});

test('cooldowns block reuse until they expire', () => {
  const cooldowns = new Cooldowns();
  assert.equal(cooldowns.ready('attack'), true);
  cooldowns.start('attack', 1);
  assert.equal(cooldowns.ready('attack'), false);
  cooldowns.update(0.4);
  assert.ok(cooldowns.remaining('attack') > 0.5 && cooldowns.remaining('attack') < 0.7);
  cooldowns.update(0.7);
  assert.equal(cooldowns.ready('attack'), true);
  assert.equal(cooldowns.remaining('attack'), 0);
});

test('timed effects stack additively and expire on independent timers', () => {
  const effects = new TimedEffectSystem();
  let expired = 0;
  effects.add({ target: 'player', name: 'healthRegen', duration: 6, magnitude: 0.5, onExpire: () => (expired += 1) });
  effects.add({ target: 'player', name: 'healthRegen', duration: 4, magnitude: 0.5, onExpire: () => (expired += 1) });

  close(effects.totalMagnitude('player', 'healthRegen'), 1);
  effects.update(3);
  assert.equal(effects.countFor('player', 'healthRegen'), 2);
  close(effects.totalMagnitude('player', 'healthRegen'), 1);
  assert.equal(expired, 0);

  effects.update(2);
  assert.equal(expired, 1);
  assert.equal(effects.countFor('player', 'healthRegen'), 1);
  close(effects.totalMagnitude('player', 'healthRegen'), 0.5);

  effects.update(2);
  assert.equal(expired, 2);
  assert.equal(effects.totalMagnitude('player', 'healthRegen'), 0);
});

test('projectiles travel, hit an enemy once and expire on walls', () => {
  const grid = new Grid(20, 20, 0);
  const target = new Entity({ faction: 'enemy', x: 6.5, y: 1.5, radius: 0.3, maxHealth: 20 });
  const projectiles = new ProjectileSystem();
  let hits = 0;

  projectiles.spawn({
    x: 1.5,
    y: 1.5,
    direction: { x: 1, y: 0 },
    speed: 12,
    radius: 0.1,
    damage: 5,
    faction: 'player',
    ttl: 2,
    onHit: (entity) => {
      hits += 1;
      entity.takeDamage(5);
    },
  });

  for (let i = 0; i < 120 && projectiles.projectiles.length > 0; i++) {
    projectiles.update(1 / 60, { grid, entities: [target] });
  }
  assert.equal(hits, 1);
  assert.equal(target.health, 15);
  assert.equal(projectiles.projectiles.length, 0);

  const wallGrid = new Grid(20, 20, 0);
  for (let y = 0; y < 20; y++) wallGrid.set(4, y, 1);
  let reason = null;
  projectiles.spawn({
    x: 1.5,
    y: 1.5,
    direction: { x: 1, y: 0 },
    speed: 12,
    radius: 0.1,
    ttl: 2,
    onExpire: (projectile, cause) => {
      reason = cause;
    },
  });
  for (let i = 0; i < 200 && projectiles.projectiles.length > 0; i++) {
    projectiles.update(1 / 60, { grid: wallGrid, entities: [] });
  }
  assert.equal(reason, 'wall');
});

test('area damage only hits valid targets inside the radius', () => {
  const near = new Entity({ faction: 'enemy', x: 1, y: 0, maxHealth: 50 });
  const far = new Entity({ faction: 'enemy', x: 5, y: 0, maxHealth: 50 });
  const friendly = new Entity({ faction: 'player', x: 0.5, y: 0, maxHealth: 50 });

  const hits = applyDamageInRadius({
    entities: [near, far, friendly],
    x: 0,
    y: 0,
    radius: 2,
    damage: 10,
    faction: 'player',
  });

  assert.equal(hits.length, 1);
  assert.equal(hits[0].entity, near);
  assert.equal(near.health, 40);
  assert.equal(far.health, 50);
  assert.equal(friendly.health, 50);
});

test('timed area effects tick and expire', () => {
  const areas = new AreaEffectSystem();
  let ticks = 0;
  let expired = 0;
  areas.add({
    x: 0,
    y: 0,
    radius: 2,
    duration: 1,
    tickInterval: 0.4,
    onTick: () => (ticks += 1),
    onExpire: () => (expired += 1),
  });

  areas.update(0.4);
  assert.equal(ticks, 1);
  areas.update(0.4);
  assert.equal(ticks, 2);
  areas.update(0.4);
  assert.equal(ticks, 3);
  assert.equal(expired, 1);
  assert.equal(areas.effects.length, 0);
});

test('training dummies spawn on walkable tiles in the spawn room', () => {
  for (const seed of [1, 424242, 987654321]) {
    const floor = generateFloor(seed);
    const dummies = spawnTrainingDummies(floor);
    assert.ok(dummies.length > 0, `seed ${seed} has dummies`);
    const ids = new Set();
    for (const dummy of dummies) {
      assert.equal(dummy.alive, true);
      assert.equal(floor.grid.isWalkable(Math.floor(dummy.x), Math.floor(dummy.y)), true);
      assert.ok(dummy.x > floor.spawnRoom.x && dummy.x < floor.spawnRoom.x + floor.spawnRoom.w);
      assert.ok(dummy.y > floor.spawnRoom.y && dummy.y < floor.spawnRoom.y + floor.spawnRoom.h);
      assert.equal(ids.has(dummy.id), false);
      ids.add(dummy.id);
    }
  }
});

test('experience accumulates below the level threshold', () => {
  const character = new Character('warrior');
  assert.equal(character.awardExperience(12), 12);
  assert.equal(character.awardExperience(3.9), 15);
  assert.equal(character.awardExperience(-5), 15);
  assert.equal(character.level, 1);
});

test('base stats helper returns a fresh zeroed object', () => {
  const a = createBaseStats();
  const b = createBaseStats();
  assert.deepEqual(a, { strength: 0, intelligence: 0, vitality: 0, dexterity: 0 });
  a.strength = 3;
  assert.equal(b.strength, 0);
});
