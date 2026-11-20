import test from 'node:test';
import assert from 'node:assert/strict';

import { ABILITIES, ELEMENTAL_INFUSION } from '../src/config.js';
import { Character } from '../src/world/character.js';
import { Enemy } from '../src/world/enemies.js';
import { updateEnemy } from '../src/world/enemyAI.js';
import { findAbility } from '../src/world/abilities.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Grid } from '../src/world/grid.js';
import { Rng } from '../src/world/rng.js';
import { createSummon, infuseSummon, updateSummon } from '../src/world/summons.js';

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
  return {
    hits,
    explosions,
    hooks: {
      damage: (target, amount) => {
        const applied = target.takeDamage(amount);
        hits.push({ target, amount, applied });
        return { applied, killed: !target.alive };
      },
      beam: () => {},
      explosion: (x, y, radius, element) => explosions.push({ x, y, radius, element }),
      summon: () => null,
    },
  };
}

function unlocked(abilityId) {
  const character = new Character('wizard');
  character.spellFumbleChance = 0;
  assert.equal(character.unlockAbility(abilityId), true, `wizard unlocks ${abilityId}`);
  return character;
}

function advanceProjectiles(systems, entities, grid, frames = 180) {
  for (let i = 0; i < frames && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid, entities });
  }
}

test('every wizard ability unlocks, selects and is described by its kit data', () => {
  const expected = {
    fireball: 'projectile',
    chainLightning: 'chain',
    iceSpear: 'projectile',
    tornado: 'area',
    manaShield: 'buff',
    summonTotem: 'summon',
    summonGolem: 'summon',
  };
  assert.equal(ABILITIES.wizard.length, 7);
  for (const [abilityId, category] of Object.entries(expected)) {
    const ability = findAbility('wizard', abilityId);
    assert.ok(ability, `${abilityId} exists`);
    assert.equal(ability.category, category);
    assert.equal(ability.kind, 'active');

    const character = unlocked(abilityId);
    assert.equal(character.selectAbility(abilityId), true);
    assert.equal(character.selectedAbilityId, abilityId);
    assert.equal(character.hotbar.includes(abilityId), true);
  }
});

test('fireball deals impact damage and explodes in its configured small radius', () => {
  const systems = makeSystems();
  const character = unlocked('fireball');
  const ability = findAbility('wizard', 'fireball');
  const target = new Enemy('trainingDummy', character.x + 2, character.y);
  const neighbor = new Enemy('trainingDummy', character.x + 2.5, character.y + 0.4);
  const distant = new Enemy('trainingDummy', character.x + 6, character.y + 6);
  const { hits, explosions, hooks } = makeHooks();
  const entities = [target, neighbor, distant];

  assert.equal(systems.abilities.cast(character, ability, { target, entities, rng: new Rng(3), hooks }).ok, true);
  advanceProjectiles(systems, entities, new Grid(40, 40, 0));

  const direct = hits.find((hit) => hit.target === target);
  const splash = hits.find((hit) => hit.target === neighbor);
  assert.ok(direct && direct.applied > 0);
  assert.ok(splash && splash.applied > 0);
  assert.ok(direct.applied > splash.applied, 'the impact hits harder than the splash');
  assert.equal(distant.health, distant.maxHealth);
  assert.equal(explosions.length, 1);
  close(explosions[0].radius, ability.projectile.explosionRadius);
  assert.ok(explosions[0].radius <= 2);
  assert.equal(explosions[0].element, 'fire');
  assert.equal(systems.projectiles.projectiles.length, 0);
});

test('chain lightning stops at five enemies, ignores dead targets and never repeats', () => {
  const systems = makeSystems();
  const character = unlocked('chainLightning');
  const ability = findAbility('wizard', 'chainLightning');
  character.x = 1;
  character.y = 1;
  const { hits, hooks } = makeHooks();

  const enemies = [];
  for (let i = 0; i < 8; i++) enemies.push(new Enemy('trainingDummy', 3 + i * 0.9, 1));
  const dead = new Enemy('trainingDummy', 3.4, 1.6);
  dead.takeDamage(9999);
  enemies.push(dead);

  const result = systems.abilities.cast(character, ability, {
    target: enemies[0],
    entities: enemies,
    rng: new Rng(5),
    hooks,
  });

  assert.equal(result.ok, true);
  assert.equal(hits.length, ability.chain.maxTargets);
  assert.equal(ability.chain.maxTargets, 5);
  assert.equal(new Set(hits.map((hit) => hit.target.id)).size, hits.length);
  assert.equal(hits.some((hit) => hit.target === dead), false);
  assert.equal(hits.some((hit) => !hit.target.alive), false);
});

test('ice spear slows by exactly 35 percent and the slow expires', () => {
  const systems = makeSystems();
  const character = unlocked('iceSpear');
  const ability = findAbility('wizard', 'iceSpear');
  const target = new Enemy('trainingDummy', character.x + 1.6, character.y);
  const { hooks } = makeHooks();

  assert.equal(ability.status.slowPercent, 0.35);
  systems.abilities.cast(character, ability, { target, entities: [target], rng: new Rng(6), hooks });
  advanceProjectiles(systems, [target], new Grid(30, 30, 0));

  close(target.moveSpeedMultiplier, 0.65);
  systems.effects.update(ability.status.slowDuration - 0.1);
  close(target.moveSpeedMultiplier, 0.65);
  systems.effects.update(0.2);
  close(target.moveSpeedMultiplier, 1);
  assert.equal(systems.effects.activeFor(target, 'slow').length, 0);
});

test('tornado pulls and damages only enemies inside its radius until it expires', () => {
  const systems = makeSystems();
  const character = unlocked('tornado');
  const ability = findAbility('wizard', 'tornado');
  character.x = 5;
  character.y = 5;
  const grid = new Grid(30, 30, 0);
  const point = { x: 8, y: 5 };
  const inside = new Enemy('trainingDummy', 9.2, 5);
  const outside = new Enemy('trainingDummy', point.x + ability.area.radius + 2, 5);
  const entities = [inside, outside];
  const { hooks } = makeHooks();

  assert.equal(systems.abilities.cast(character, ability, { point, entities, grid, rng: new Rng(2), hooks }).ok, true);
  assert.equal(systems.areas.effects.length, 1);
  const before = Math.hypot(inside.x - point.x, inside.y - point.y);

  systems.areas.update(ability.area.tickInterval, { grid, entities });

  assert.ok(Math.hypot(inside.x - point.x, inside.y - point.y) < before);
  assert.ok(inside.health < inside.maxHealth);
  assert.equal(outside.health, outside.maxHealth);
  assert.equal(outside.x, point.x + ability.area.radius + 2);

  systems.areas.update(ability.area.duration + 0.1, { grid, entities });
  assert.equal(systems.areas.effects.length, 0);
});

test('mana shield absorbs with mana, then clamps health and mana at zero', () => {
  const systems = makeSystems();
  const character = unlocked('manaShield');
  const ability = findAbility('wizard', 'manaShield');
  const { hooks } = makeHooks();

  assert.equal(systems.abilities.cast(character, ability, { entities: [], hooks }).ok, true);
  const manaAfterCast = character.maxMana - ability.manaCost;
  close(character.mana, manaAfterCast);
  assert.equal(character.hasBuff('manaShield'), true);

  character.takeDamage(5);
  assert.equal(character.health, character.maxHealth);
  close(character.mana, manaAfterCast - 5);

  character.mana = 2;
  character.takeDamage(10);
  assert.equal(character.mana, 0);
  close(character.health, character.maxHealth - 8);

  character.takeDamage(10);
  assert.ok(character.health >= 0);
  assert.ok(character.mana >= 0);
  close(character.health, character.maxHealth - 18);

  systems.effects.update(ability.buff.duration + 0.1);
  assert.equal(character.hasBuff('manaShield'), false);
  assert.equal(character.damageFilter, null);

  const before = character.health;
  character.takeDamage(3);
  close(character.health, Math.max(0, before - 3));
});

test('the totem automatically attacks the nearest valid enemy in range', () => {
  const character = unlocked('summonTotem');
  const ability = findAbility('wizard', 'summonTotem');
  const totem = createSummon(ability, character, { x: 5.5, y: 5.5, damage: ability.summon.damage });
  const near = new Enemy('trainingDummy', 8.4, 5.5);
  const far = new Enemy('trainingDummy', 20, 5.5);
  const beams = [];
  const hits = [];

  const result = updateSummon(totem, 1.05, {
    entities: [totem, near, far],
    grid: new Grid(30, 30, 0),
    onBeam: (from, to, element) => beams.push({ from, to, element }),
    onDamage: (target, amount) => {
      target.takeDamage(amount);
      hits.push(target);
    },
  });

  assert.equal(result.attacked, near);
  assert.deepEqual(hits, [near]);
  assert.ok(near.health < near.maxHealth);
  assert.equal(far.health, far.maxHealth);
  assert.deepEqual(beams.map((beam) => beam.element), ['arcane']);

  near.takeDamage(9999);
  const second = new Enemy('trainingDummy', 6.5, 5.5);
  const next = updateSummon(totem, 1.05, {
    entities: [totem, near, second],
    grid: new Grid(30, 30, 0),
    onDamage: (target, amount) => target.takeDamage(amount),
  });
  assert.equal(next.attacked, second);
});

test('an elemental spell infuses the totem and changes its attack element', () => {
  const systems = makeSystems();
  const player = new Character('wizard');
  player.x = 5.5;
  player.y = 5.5;
  const mage = new Enemy('skeletonMage', 5.5, 12.5);
  const totem = createSummon(findAbility('wizard', 'summonTotem'), player, {
    x: 5.5,
    y: 8.5,
    damage: 4,
  });
  const fireball = mage.abilities.find((ability) => ability.id === 'skeletonFireball');
  const entities = [mage, totem];

  assert.equal(totem.element, 'arcane');
  const result = systems.abilities.cast(mage, fireball, {
    target: totem,
    entities,
    grid: new Grid(30, 30, 0),
    rng: new Rng(11),
    cooldowns: mage.cooldowns,
  });
  assert.equal(result.ok, true);
  advanceProjectiles(systems, entities, new Grid(30, 30, 0));

  assert.ok(totem.health < totem.maxHealth);
  assert.equal(totem.element, 'fire');
  assert.equal(totem.infusions, 1);

  const enemy = new Enemy('trainingDummy', 6.2, 8.5);
  const elements = [];
  updateSummon(totem, 1.05, {
    entities: [totem, enemy],
    grid: new Grid(30, 30, 0),
    onBeam: (from, to, element) => elements.push(element),
    onDamage: (target, amount) => target.takeDamage(amount),
  });
  assert.deepEqual(elements, ['fire']);

  assert.equal(infuseSummon(totem, 'bone'), false);
  assert.equal(totem.element, 'fire');
  assert.equal(infuseSummon(totem, 'ice'), true);
  assert.equal(totem.element, 'ice');
  assert.equal(ELEMENTAL_INFUSION.includes('bone'), false);
});

test('a non-elemental projectile does not infuse the totem', () => {
  const systems = makeSystems();
  const player = new Character('wizard');
  player.x = 5.5;
  player.y = 5.5;
  const archer = new Enemy('skeletonArcher', 5.5, 12.5);
  const totem = createSummon(findAbility('wizard', 'summonTotem'), player, {
    x: 5.5,
    y: 8.5,
    damage: 4,
  });
  const arrow = archer.abilities.find((ability) => ability.id === 'boneArrow');
  const entities = [archer, totem];

  systems.abilities.cast(archer, arrow, {
    target: totem,
    entities,
    grid: new Grid(30, 30, 0),
    rng: new Rng(12),
    cooldowns: archer.cooldowns,
  });
  advanceProjectiles(systems, entities, new Grid(30, 30, 0));

  assert.ok(totem.health < totem.maxHealth);
  assert.equal(totem.element, 'arcane');
  assert.equal(totem.infusions, 0);
  assert.equal(infuseSummon(createSummon(findAbility('wizard', 'summonGolem'), player, { x: 6, y: 6, damage: 5 }), 'fire'), false);
});

test('the golem is durable, fights, draws enemy aggro and is cleaned up when killed', () => {
  const systems = makeSystems();
  const grid = new Grid(40, 40, 0);
  const player = new Character('wizard');
  player.x = 10.5;
  player.y = 10.5;
  player.maxHealth = 500;
  player.health = 500;
  const golemAbility = findAbility('wizard', 'summonGolem');
  const totemAbility = findAbility('wizard', 'summonTotem');
  assert.ok(golemAbility.summon.health > totemAbility.summon.health * 2);
  assert.ok(golemAbility.summon.damage <= 10);

  const golem = createSummon(golemAbility, player, { x: 12.5, y: 10.5, damage: golemAbility.summon.damage });
  const enemy = new Enemy('skeleton', 14.5, 10.5);
  const rng = new Rng(7);
  const context = {
    player,
    entities: [player, golem, enemy],
    grid,
    rng,
    abilitySystem: systems.abilities,
    hooks: {},
  };

  let taunted = false;
  for (let i = 0; i < 120; i++) {
    updateEnemy(enemy, 1 / 30, context);
    if (enemy.targetId === golem.id) taunted = true;
    updateSummon(golem, 1 / 30, {
      entities: context.entities,
      grid,
      onDamage: (target, amount) => target.takeDamage(amount),
    });
  }

  assert.equal(taunted, true);
  assert.equal(enemy.aggroed, true);
  assert.equal(enemy.targetId, golem.id);
  assert.ok(golem.health < golem.maxHealth, 'enemies attack the golem');
  assert.ok(enemy.health < enemy.maxHealth, 'the golem fights back');
  assert.equal(player.health, player.maxHealth);

  golem.takeDamage(9999);
  assert.equal(golem.alive, false);
  const dead = updateSummon(golem, 1 / 30, { entities: context.entities, grid });
  assert.equal(dead.removed, true);
  assert.equal(dead.reason, 'dead');

  updateEnemy(enemy, 1 / 30, context);
  assert.equal(enemy.targetId, player.id, 'the enemy retargets the player');
});

test('expired summons and cleared combat systems leave no orphans', () => {
  const systems = makeSystems();
  const character = unlocked('fireball');
  const target = new Enemy('trainingDummy', character.x + 2, character.y);
  const { hooks } = makeHooks();

  for (let i = 0; i < 3; i++) {
    character.mana = character.maxMana;
    systems.cooldowns.clear();
    assert.equal(systems.abilities.cast(character, findAbility('wizard', 'fireball'), {
      target,
      entities: [target],
      rng: new Rng(20 + i),
      hooks,
    }).ok, true);
  }
  assert.equal(systems.projectiles.projectiles.length, 3);
  systems.projectiles.clear();
  assert.equal(systems.projectiles.projectiles.length, 0);

  const tornado = unlocked('tornado');
  for (let i = 0; i < 2; i++) {
    tornado.mana = tornado.maxMana;
    systems.cooldowns.clear();
    systems.abilities.cast(tornado, findAbility('wizard', 'tornado'), {
      point: { x: tornado.x + 2, y: tornado.y },
      entities: [],
      grid: new Grid(30, 30, 0),
      rng: new Rng(30 + i),
      hooks,
    });
  }
  assert.equal(systems.areas.effects.length, 2);
  systems.areas.clear();
  assert.equal(systems.areas.effects.length, 0);

  const golem = createSummon(findAbility('wizard', 'summonGolem'), character, { x: 2, y: 2, damage: 5 });
  const expired = updateSummon(golem, golem.maxDuration + 0.1, { entities: [] });
  assert.equal(expired.removed, true);
  assert.equal(expired.reason, 'expired');

  const shield = unlocked('manaShield');
  systems.abilities.cast(shield, findAbility('wizard', 'manaShield'), { entities: [], hooks });
  assert.equal(shield.hasBuff('manaShield'), true);
  systems.effects.update(findAbility('wizard', 'manaShield').buff.duration + 0.1);
  assert.equal(shield.hasBuff('manaShield'), false);
});
