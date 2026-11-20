import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES, POPULATION } from '../src/config.js';
import { Character } from '../src/world/character.js';
import { Enemy, ENEMY_STATES, spawnFloorEnemies } from '../src/world/enemies.js';
import { updateEnemy } from '../src/world/enemyAI.js';
import { generateFloor } from '../src/world/floor.js';
import { Grid } from '../src/world/grid.js';
import { Rng } from '../src/world/rng.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';

const REGULAR_TYPES = ['skeleton', 'skeletonArcher', 'skeletonMage', 'zombie', 'bat', 'vampire'];

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

function makeArena({ type, distance = 3, health = 500, gridSize = 40, seed = 5, floor = 1 } = {}) {
  const systems = makeSystems();
  const grid = new Grid(gridSize, gridSize, 0);
  const player = new Character('warrior');
  player.x = 10.5;
  player.y = 10.5;
  player.maxHealth = health;
  player.health = health;
  const enemy = new Enemy(type, player.x + distance, player.y, { floor });
  const rng = new Rng(seed);
  const context = {
    player,
    entities: [player, enemy],
    grid,
    rng,
    abilitySystem: systems.abilities,
    hooks: {},
  };
  return { systems, grid, player, enemy, rng, context };
}

function runAi(arena, seconds, { onFrame = null } = {}) {
  const dt = 1 / 30;
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    updateEnemy(arena.enemy, dt, arena.context);
    arena.systems.projectiles.update(dt, { grid: arena.grid, entities: arena.context.entities });
    arena.systems.areas.update(dt, { grid: arena.grid, entities: arena.context.entities });
    arena.systems.effects.update(dt);
    onFrame?.(arena, i);
  }
}

test('the enemy roster defines all six regular types and shared states', () => {
  assert.deepEqual(ENEMY_STATES, {
    IDLE: 'idle',
    WANDER: 'wander',
    AGGRO: 'aggro',
    PURSUIT: 'pursuit',
    ATTACK: 'attack',
    DEAD: 'dead',
  });

  for (const typeId of REGULAR_TYPES) {
    const type = ENEMY_TYPES[typeId];
    assert.ok(type, `${typeId} exists`);
    assert.equal(type.id, typeId);
    assert.equal(typeof type.name, 'string');
    assert.equal(typeof type.sprite, 'string');
    assert.ok(type.maxHealth > 0);
    assert.ok(type.experience > 0);
    assert.ok(type.speed > 0);
    assert.ok(type.aggroRadius > 0);
    assert.ok(type.attackRange > 0);
  }

  assert.equal(ENEMY_TYPES.vampire.roam, true);
  assert.ok(ENEMY_TYPES.vampire.maxHealth > ENEMY_TYPES.zombie.maxHealth);
  assert.ok(ENEMY_TYPES.bat.speed > ENEMY_TYPES.zombie.speed);
  assert.deepEqual(
    [...POPULATION.guaranteed].sort(),
    [...REGULAR_TYPES].sort(),
  );
  assert.equal(POPULATION.table.length, REGULAR_TYPES.length);
});

test('floor population is deterministic, walkable and includes every enemy type', () => {
  for (const seed of [1, 424242, 987654321]) {
    const floor = generateFloor(seed);
    const enemies = spawnFloorEnemies(floor, 1);
    assert.ok(enemies.length >= REGULAR_TYPES.length, `seed ${seed} has a populated floor`);

    const types = new Set(enemies.map((enemy) => enemy.typeId));
    for (const typeId of REGULAR_TYPES) {
      assert.equal(types.has(typeId), true, `seed ${seed} spawns ${typeId}`);
    }

    const ids = new Set();
    for (const enemy of enemies) {
      assert.equal(enemy.alive, true);
      assert.equal(enemy.faction, 'enemy');
      assert.equal(floor.grid.isWalkable(Math.floor(enemy.x), Math.floor(enemy.y)), true);
      assert.equal(ids.has(enemy.id), false);
      ids.add(enemy.id);
    }

    const again = spawnFloorEnemies(floor, 1);
    assert.deepEqual(
      again.map((enemy) => `${enemy.typeId}:${enemy.x.toFixed(3)}:${enemy.y.toFixed(3)}`),
      enemies.map((enemy) => `${enemy.typeId}:${enemy.x.toFixed(3)}:${enemy.y.toFixed(3)}`),
    );
  }
});

test('enemy health, damage and experience scale with the floor', () => {
  const first = new Enemy('skeleton', 1, 1, { floor: 1 });
  const third = new Enemy('skeleton', 1, 1, { floor: 3 });
  assert.ok(third.maxHealth > first.maxHealth);
  assert.ok(third.weapon.damageMax > first.weapon.damageMax);
  assert.ok(third.experience > first.experience);
  assert.equal(first.health, first.maxHealth);
  assert.equal(third.health, third.maxHealth);
});

test('melee enemies aggro, pursue and damage the player', () => {
  const arena = makeArena({ type: 'skeleton', distance: 5 });
  let sawWindup = false;
  const states = new Set();

  runAi(arena, 5, {
    onFrame: (world) => {
      states.add(world.enemy.state);
      if (world.enemy.state === ENEMY_STATES.ATTACK && world.enemy.windup > 0) sawWindup = true;
    },
  });

  assert.equal(arena.enemy.aggroed, true);
  assert.equal(states.has(ENEMY_STATES.AGGRO), true);
  assert.equal(states.has(ENEMY_STATES.PURSUIT), true);
  assert.equal(sawWindup, true);
  assert.ok(arena.player.health < arena.player.maxHealth);
  assert.ok(Math.hypot(arena.enemy.x - arena.player.x, arena.enemy.y - arena.player.y) < 5);
});

test('enemies cannot attack through walls', () => {
  const arena = makeArena({ type: 'skeleton', distance: 3, gridSize: 30 });
  for (let y = 0; y < 30; y++) arena.grid.set(12, y, 1);
  arena.enemy.aggroed = true;
  arena.enemy.state = ENEMY_STATES.PURSUIT;

  runAi(arena, 4);
  assert.equal(arena.player.health, arena.player.maxHealth);
  assert.ok(arena.enemy.x > 12, 'the wall is not crossed');
});

test('skeleton archers fire projectiles from range instead of closing to melee', () => {
  const arena = makeArena({ type: 'skeletonArcher', distance: 6 });
  let projectilesSeen = 0;
  let sawWindup = false;

  runAi(arena, 5, {
    onFrame: (world) => {
      projectilesSeen = Math.max(projectilesSeen, world.systems.projectiles.projectiles.length);
      if (world.enemy.state === ENEMY_STATES.ATTACK && world.enemy.windup > 0) sawWindup = true;
    },
  });

  assert.ok(projectilesSeen > 0, 'an arrow was fired');
  assert.equal(sawWindup, true);
  assert.ok(arena.player.health < arena.player.maxHealth);
  assert.ok(arena.enemy.x - arena.player.x > 2, 'the archer held its distance');
});

test('skeleton mages use Mana Shield and Fireball through the shared ability system', () => {
  const arena = makeArena({ type: 'skeletonMage', distance: 4 });
  let shieldSeen = false;
  let projectilesSeen = 0;

  runAi(arena, 8, {
    onFrame: (world) => {
      if (world.enemy.hasBuff('skeletonManaShield')) shieldSeen = true;
      projectilesSeen = Math.max(projectilesSeen, world.systems.projectiles.projectiles.length);
    },
  });

  assert.equal(shieldSeen, true);
  assert.ok(projectilesSeen > 0, 'a fireball was fired');
  assert.ok(arena.player.health < arena.player.maxHealth);
});

test('vampires wander through the dungeon while the player is far away', () => {
  const arena = makeArena({ type: 'vampire', distance: 40, gridSize: 60 });
  arena.player.x = 50.5;
  arena.player.y = 50.5;
  arena.enemy.x = 5.5;
  arena.enemy.y = 5.5;
  arena.enemy.homeX = 5.5;
  arena.enemy.homeY = 5.5;
  arena.enemy.idleTimer = 0;

  const start = { x: arena.enemy.x, y: arena.enemy.y };
  const states = new Set();
  runAi(arena, 4, {
    onFrame: (world) => states.add(world.enemy.state),
  });

  assert.equal(arena.enemy.aggroed, false);
  assert.equal(states.has(ENEMY_STATES.WANDER), true);
  assert.ok(Math.hypot(arena.enemy.x - start.x, arena.enemy.y - start.y) > 1, 'the vampire moved');
});

test('dead enemies stop acting and cannot damage the player', () => {
  const arena = makeArena({ type: 'zombie', distance: 2 });
  arena.enemy.takeDamage(9999);
  assert.equal(arena.enemy.alive, false);
  assert.equal(arena.enemy.state, ENEMY_STATES.DEAD);

  const position = { x: arena.enemy.x, y: arena.enemy.y };
  runAi(arena, 2);

  assert.equal(arena.enemy.x, position.x);
  assert.equal(arena.enemy.y, position.y);
  assert.equal(arena.enemy.state, ENEMY_STATES.DEAD);
  assert.equal(arena.player.health, arena.player.maxHealth);
});
