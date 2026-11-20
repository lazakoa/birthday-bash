import test from 'node:test';
import assert from 'node:assert/strict';

import { LICH } from '../src/config.js';
import { Game } from '../src/core/game.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Character } from '../src/world/character.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { EntityStore } from '../src/world/entity.js';
import { Enemy, spawnLich } from '../src/world/enemies.js';
import { BOSS_FLOOR, generateFloor } from '../src/world/floor.js';
import {
  aliveMinionCount,
  arcanePull,
  arcanePush,
  canSummon,
  clearLichSummons,
  lichMinions,
  resolveLichSlash,
  slashCandidates,
  summonMinions,
  updateLich,
} from '../src/world/lich.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { Rng } from '../src/world/rng.js';

const SEEDS = [1, 4242, 7919];
const LICH_ABILITIES = [
  'lichFireball',
  'lichSummon',
  'lichArcanePush',
  'lichArcanePull',
  'lichSlash',
];

const close = (actual, expected, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);

function bossFloor(seed = 4242) {
  return generateFloor(seed, BOSS_FLOOR);
}

function makeAbilitySystem() {
  return new AbilitySystem({
    projectiles: new ProjectileSystem(),
    areas: new AreaEffectSystem(),
    effects: new TimedEffectSystem(),
    cooldowns: new Cooldowns(),
  });
}

test('the boss floor spawns the Lich with its full ability set', () => {
  for (const seed of SEEDS) {
    const floor = bossFloor(seed);
    const lich = spawnLich(floor);

    assert.equal(lich.typeId, 'lich');
    assert.equal(lich.isLich, true);
    assert.equal(lich.isBoss, true);
    assert.equal(lich.faction, 'enemy');
    assert.equal(lich.alive, true);
    assert.equal(lich.maxHealth, 950);
    assert.ok(lich.maxMana > 0, 'the Lich has mana for its spells');
    assert.deepEqual(lich.unlockedAbilities.sort(), [...LICH_ABILITIES].sort());
    assert.deepEqual(lich.abilities.map((ability) => ability.id).sort(), [...LICH_ABILITIES].sort());
    assert.equal(floor.grid.isWalkable(Math.floor(lich.x), Math.floor(lich.y)), true);
    close(lich.x, floor.bossSpawn.x, 1e-9);
    close(lich.y, floor.bossSpawn.y, 1e-9);
  }
});

test('summon raises eight mixed skeleton and zombie minions around the Lich', () => {
  const floor = bossFloor();
  const lich = spawnLich(floor);
  lich.aggroed = true;
  const entities = [lich];
  const logs = [];
  const rng = new Rng(77);

  assert.equal(canSummon(lich, entities), true);
  const minions = summonMinions(lich, {
    entities,
    grid: floor.grid,
    rng,
    hooks: { log: (message) => logs.push(message) },
  });

  assert.equal(minions.length, LICH.summonCount);
  assert.equal(minions.length, 8);
  assert.equal(entities.length, 1 + minions.length);
  assert.equal(aliveMinionCount(lich, entities), 8);
  assert.equal(lich.summonedOnce, true);
  assert.equal(lich.minionIds.size, 8);

  const types = new Set(minions.map((minion) => minion.typeId));
  for (const typeId of ['skeleton', 'skeletonArcher', 'skeletonMage', 'zombie']) {
    assert.equal(types.has(typeId), true, `${typeId} appears in the host`);
  }

  for (const minion of minions) {
    assert.equal(minion.summonedBy, lich.id);
    assert.equal(minion.faction, 'enemy');
    assert.equal(minion.alive, true);
    assert.equal(minion.aggroed, true);
    assert.ok(Math.hypot(minion.x - lich.x, minion.y - lich.y) < 6);
    assert.equal(floor.grid.isWalkable(Math.floor(minion.x), Math.floor(minion.y)), true);
  }

  assert.equal(canSummon(lich, entities), false, 'summon cannot be spammed');
});

test('summon can be recast only below three survivors and replaces the old host', () => {
  const floor = bossFloor(991);
  const lich = spawnLich(floor);
  lich.aggroed = true;
  const entities = [lich];
  const rng = new Rng(5);

  const first = summonMinions(lich, { entities, grid: floor.grid, rng });
  assert.equal(first.length, 8);

  lich.cooldowns.clear();
  assert.equal(canSummon(lich, entities), false, 'eight survivors block a recast');

  for (const minion of first.slice(2)) minion.takeDamage(minion.health);
  assert.equal(aliveMinionCount(lich, entities), 2);
  assert.equal(canSummon(lich, entities), true, 'fewer than three survivors allow a recast');

  const survivors = lichMinions(lich, entities);
  const second = summonMinions(lich, { entities, grid: floor.grid, rng });

  assert.equal(second.length, 8);
  assert.equal(aliveMinionCount(lich, entities), 8);
  for (const survivor of survivors) {
    assert.equal(entities.includes(survivor), false, 'the previous summons crumble');
  }
  for (const replacement of second) assert.equal(entities.includes(replacement), true);
});

test('arcane push moves a nearby enemy away and stops at walls', () => {
  const floor = bossFloor(1234);
  const lich = spawnLich(floor);
  const target = { x: lich.x + 1.4, y: lich.y, radius: 0.3, alive: true, faction: 'player' };
  const before = Math.hypot(target.x - lich.x, target.y - lich.y);

  const pushed = arcanePush(lich, target, { grid: floor.grid });
  const after = Math.hypot(target.x - lich.x, target.y - lich.y);

  assert.ok(pushed.moved > 0, 'the enemy is pushed');
  assert.ok(after > before, 'the enemy moves away from the Lich');
  assert.ok(after <= before + LICH.pushDistance + 1e-6);
  assert.equal(floor.grid.isWalkable(Math.floor(target.x), Math.floor(target.y)), true);

  const room = floor.rooms[0];
  const wallTarget = {
    x: room.x + room.w - 1 + 0.5,
    y: room.y + 4.5,
    radius: 0.3,
    alive: true,
    faction: 'player',
  };
  lich.x = wallTarget.x - 1;
  lich.y = wallTarget.y;
  arcanePush(lich, wallTarget, { grid: floor.grid });
  assert.equal(floor.grid.isWalkable(Math.floor(wallTarget.x), Math.floor(wallTarget.y)), true);
  assert.ok(wallTarget.x <= room.x + room.w - 1 + 0.99, 'push stops before the wall');
});

test('arcane pull drags an enemy closer without overlapping the Lich', () => {
  const floor = bossFloor(808);
  const lich = spawnLich(floor);
  const target = { x: lich.x + 5.2, y: lich.y, radius: 0.3, alive: true, faction: 'player' };
  const before = Math.hypot(target.x - lich.x, target.y - lich.y);

  const pulled = arcanePull(lich, target, { grid: floor.grid });
  const after = Math.hypot(target.x - lich.x, target.y - lich.y);

  assert.ok(pulled.moved > 0, 'the enemy is pulled');
  assert.ok(after < before, 'the enemy moves toward the Lich');
  assert.ok(after >= LICH.pullStopDistance - 0.4, 'the enemy stops short of the Lich');
  assert.equal(floor.grid.isWalkable(Math.floor(target.x), Math.floor(target.y)), true);
});

test('slash hits only living enemies inside the forward cone', () => {
  const lich = spawnLich(bossFloor(31));
  lich.x = 20.5;
  lich.y = 20.5;
  const front = new Enemy('skeleton', 22.5, 20.5, { floor: 5 });
  const behind = new Enemy('skeleton', 18.5, 20.5, { floor: 5 });
  const beside = new Enemy('skeleton', 20.5, 22.5, { floor: 5 });
  const far = new Enemy('skeleton', 30.5, 20.5, { floor: 5 });
  const dead = new Enemy('skeleton', 22.0, 20.6, { floor: 5 });
  dead.takeDamage(dead.health);
  for (const entity of [front, behind, beside, far, dead]) entity.faction = 'player';
  const ally = new Enemy('skeleton', 21.5, 20.5, { floor: 5 });
  ally.faction = 'enemy';
  const otherPlayer = new Enemy('skeleton', 21.0, 20.0, { floor: 5 });
  otherPlayer.faction = 'player';

  const entities = [lich, front, behind, beside, far, dead, ally, otherPlayer];
  const candidates = slashCandidates(lich, entities, { facing: 1 });

  assert.equal(candidates.includes(front), true);
  assert.equal(candidates.includes(behind), false);
  assert.equal(candidates.includes(beside), false);
  assert.equal(candidates.includes(far), false);
  assert.equal(candidates.includes(dead), false);
  assert.equal(candidates.includes(ally), false);

  lich.facing = 1;
  lich.slashFacing = 1;
  const result = resolveLichSlash(lich, { entities, hooks: { log() {} } });
  assert.ok(result.damage > 0);
  assert.equal(result.hits.length, 2);
  assert.ok(front.health < front.maxHealth);
  assert.ok(otherPlayer.health < otherPlayer.maxHealth);
  assert.equal(behind.health, behind.maxHealth);
});

test('the Lich cycles through every listed ability during combat', () => {
  const floor = bossFloor(2024);
  const lich = spawnLich(floor);
  const player = new Character('warrior');
  player.x = lich.x;
  player.y = lich.y + 3;
  player.recalculate({ fill: true });
  player.takeDamage = () => 0;
  player.alive = true;

  const entities = [lich, player];
  const seen = new Set();
  const system = makeAbilitySystem();
  const context = {
    player,
    entities,
    grid: floor.grid,
    rng: new Rng(13),
    abilitySystem: system,
    hooks: {
      log() {},
      damage: () => ({ applied: 0, killed: false }),
      slash() {},
      summon() {},
      push() {},
      pull() {},
    },
  };

  for (let step = 0; step < 800; step++) {
    updateLich(lich, 0.05, context);
    if (lich.lastAbility) seen.add(lich.lastAbility);
    system.projectiles.update(0.05, { grid: floor.grid, entities });
  }

  for (const abilityId of LICH_ABILITIES) {
    assert.equal(seen.has(abilityId), true, `${abilityId} is used`);
  }
  assert.equal(lich.alive, true);
  assert.ok(aliveMinionCount(lich, entities) >= 1);
});

test('killing the Lich opens the exit but leaves its summons alive', () => {
  const floor = bossFloor(6161);
  const lich = spawnLich(floor);
  lich.aggroed = true;
  const entities = new EntityStore();
  entities.add(lich);
  const [minion] = summonMinions(lich, { entities: entities.all, grid: floor.grid, rng: new Rng(2) });
  const minionCount = lichMinions(lich, entities.all).length;

  const logs = [];
  const game = Object.assign(Object.create(Game.prototype), {
    bossDefeated: false,
    lichDefeated: false,
    exit: null,
    floor,
    character: { level: 1, awardExperience() {} },
    playerWorld: { x: 0, y: 0 },
    attackTargetId: lich.id,
    entities,
    combatRng: new Rng(1),
    hud: {
      addLog(message) {
        logs.push(message);
      },
      addFloat() {},
    },
    maybeDropBlood() {},
    clearTarget() {
      this.attackTargetId = null;
    },
  });

  Game.prototype.onEnemyKilled.call(game, lich);

  assert.equal(entities.find(lich.id), null, 'the Lich is removed');
  assert.equal(game.bossDefeated, true);
  assert.equal(game.lichDefeated, true);
  assert.deepEqual(game.exit, floor.exitSpot);
  assert.equal(entities.find(minion.id)?.alive, true, 'a surviving summon stays active');
  assert.equal(lichMinions(lich, entities.all).length, minionCount);
  assert.ok(logs.some((line) => /exit/i.test(line)));
  assert.ok(logs.some((line) => /summons/i.test(line)));

  const result = clearLichSummons(lich, { entities: entities.all });
  assert.equal(result.length, minionCount);
  assert.equal(entities.byFaction('enemy').length, 0);
});
