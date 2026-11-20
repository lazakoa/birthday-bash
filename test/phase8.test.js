import test from 'node:test';
import assert from 'node:assert/strict';

import { DUNGEON, ENEMY_TYPES, SHRINES } from '../src/config.js';
import { Game } from '../src/core/game.js';
import { Character } from '../src/world/character.js';
import { TimedEffectSystem } from '../src/world/effects.js';
import { spawnBossPlaceholder, spawnFloorEnemies } from '../src/world/enemies.js';
import {
  BOSS_FLOOR,
  REGULAR_FLOORS,
  TOTAL_FLOORS,
  generateDungeon,
  generateFloor,
  validateFloor,
} from '../src/world/floor.js';
import { generateFloorShrines } from '../src/world/shrines.js';
import {
  experienceForSkippedFloors,
  experienceToNextLevel,
  grantStartingFloorExperience,
} from '../src/world/progression.js';

const SEEDS = [1, 4242, 7919, 123456789];
const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be close to ${expected}`);

test('a run contains four 50-room BSP floors and one boss floor', () => {
  assert.equal(REGULAR_FLOORS, 4);
  assert.equal(BOSS_FLOOR, 5);
  assert.equal(TOTAL_FLOORS, 5);

  for (const seed of SEEDS) {
    const floors = generateDungeon(seed);
    assert.equal(floors.length, TOTAL_FLOORS);

    for (let index = 0; index < REGULAR_FLOORS; index++) {
      const floor = floors[index];
      assert.equal(floor.floorNumber, index + 1);
      assert.equal(floor.isBoss, false);
      assert.equal(floor.roomCount, 50);
      assert.equal(floor.rooms.length, 50);
      assert.ok(floor.stairs, `floor ${index + 1} has stairs`);
      assert.equal(validateFloor(floor), true);
    }

    const boss = floors[BOSS_FLOOR - 1];
    assert.equal(boss.floorNumber, BOSS_FLOOR);
    assert.equal(boss.isBoss, true);
    assert.equal(boss.roomCount, 1);
    assert.equal(boss.rooms.length, 1);
    assert.equal(boss.stairs, null);
    assert.equal(validateFloor(boss), true);
  }
});

test('the boss floor is one unpartitioned arena with walkable spawn, boss and exit tiles', () => {
  for (const seed of SEEDS) {
    const floor = generateFloor(seed, BOSS_FLOOR);
    assert.equal(floor.isBoss, true);
    assert.equal(floor.rooms[0].w, DUNGEON.bossRoomSize);
    assert.equal(floor.rooms[0].h, DUNGEON.bossRoomSize);
    for (const point of [floor.spawn, floor.bossSpawn, floor.exitSpot]) {
      assert.equal(floor.grid.isWalkable(Math.floor(point.x), Math.floor(point.y)), true);
    }
    assert.ok(
      Math.hypot(floor.bossSpawn.x - floor.spawn.x, floor.bossSpawn.y - floor.spawn.y) > 5,
      'the boss starts away from the player',
    );
    assert.deepEqual(floor.shrines, []);
  }
});

test('regular floors validate with exactly 50 reachable rooms and stairs', () => {
  for (const seed of SEEDS) {
    for (let floorNumber = 1; floorNumber <= REGULAR_FLOORS; floorNumber++) {
      const floor = generateFloor(seed, floorNumber);
      assert.equal(floor.isBoss, false);
      assert.equal(floor.rooms.length, 50);
      assert.notEqual(floor.spawnRoom, floor.stairsRoom);
      assert.equal(validateFloor(floor), true);
      assert.equal(
        floor.distances[Math.floor(floor.stairs.y) * floor.grid.width + Math.floor(floor.stairs.x)] !== 0xffffffff,
        true,
      );
    }
  }
});

test('the same seed and floor reproduce the same layout and shrines', () => {
  for (const seed of SEEDS) {
    for (let floorNumber = 1; floorNumber <= REGULAR_FLOORS; floorNumber++) {
      const a = generateFloor(seed, floorNumber);
      const b = generateFloor(seed, floorNumber);
      assert.deepEqual(a.rooms, b.rooms);
      assert.deepEqual(a.spawn, b.spawn);
      assert.deepEqual(a.stairs, b.stairs);
      assert.deepEqual(a.shrines, b.shrines);
    }
  }
});

test('every regular room gets an independent 2.5 percent shrine roll', () => {
  assert.equal(SHRINES.roomChance, 0.025);
  assert.equal(SHRINES.duration, 60);

  const floor = generateFloor(2024, 1);
  let rolls = 0;
  const rng = {
    chance() {
      rolls += 1;
      return false;
    },
    int: (min) => min,
    pick: (list) => list[0],
  };
  const shrines = generateFloorShrines({
    seed: floor.seed,
    grid: floor.grid,
    rooms: floor.rooms,
    spawn: floor.spawn,
    stairs: floor.stairs,
    floorNumber: 1,
    rng,
  });

  assert.equal(rolls, floor.rooms.length);
  assert.deepEqual(shrines, []);
});

test('placed shrines are walkable, deterministic and clear of the spawn and stairs', () => {
  let total = 0;
  const seen = new Set();

  for (let index = 0; index < 40; index++) {
    const seed = index * 7919 + 13;
    for (let floorNumber = 1; floorNumber <= REGULAR_FLOORS; floorNumber++) {
      const floor = generateFloor(seed, floorNumber);
      for (const shrine of floor.shrines) {
        total += 1;
        seen.add(shrine.type);
        assert.ok(SHRINES.types[shrine.type], 'shrine type is configured');
        assert.equal(floor.grid.isWalkable(Math.floor(shrine.x), Math.floor(shrine.y)), true);
        assert.ok(
          Math.hypot(shrine.x - floor.spawn.x, shrine.y - floor.spawn.y) >= SHRINES.spawnClearance,
          'shrine is clear of the spawn',
        );
        assert.ok(
          Math.hypot(shrine.x - floor.stairs.x, shrine.y - floor.stairs.y) >= SHRINES.stairsClearance,
          'shrine is clear of the stairs',
        );
      }
    }
  }

  assert.ok(total > 0, 'the sample produces shrines');
  assert.deepEqual([...seen].sort(), ['health', 'mana', 'speed']);
});

test('health and mana shrines stack additively with independent timers', () => {
  const character = new Character('wizard');
  const effects = new TimedEffectSystem();
  const baseHealth = character.healthRegen;
  const baseMana = character.manaRegen;

  const apply = (type) => {
    const magnitude = SHRINES.types[type].magnitude;
    character.addShrine(type, magnitude);
    effects.add({
      target: character,
      name: `shrine:${type}`,
      label: SHRINES.types[type].name,
      duration: SHRINES.duration,
      magnitude,
      onExpire: () => character.removeShrine(type, magnitude),
    });
  };

  apply('health');
  apply('mana');
  apply('health');
  close(character.healthRegen, baseHealth * 2);
  close(character.manaRegen, baseMana * 1.5);

  effects.update(20);
  apply('health');
  close(character.healthRegen, baseHealth * 2.5);

  effects.update(40.1);
  close(character.healthRegen, baseHealth * 1.5);
  close(character.manaRegen, baseMana);

  effects.update(20);
  close(character.healthRegen, baseHealth);
  close(character.manaRegen, baseMana);
  assert.equal(effects.items.length, 0);
});

test('speed shrines stack additively and are removed one application at a time', () => {
  const character = new Character('warrior');
  const baseSpeed = character.speed;

  character.addShrine('speed', SHRINES.types.speed.magnitude);
  close(character.speed, baseSpeed * 1.2);

  character.addShrine('speed', SHRINES.types.speed.magnitude);
  close(character.speed, baseSpeed * 1.4);

  character.removeShrine('speed', SHRINES.types.speed.magnitude);
  close(character.speed, baseSpeed * 1.2);

  character.clearShrines();
  close(character.speed, baseSpeed);
});

test('timed effects can be retained across a floor transition', () => {
  const effects = new TimedEffectSystem();
  const character = { id: 'player' };
  const enemy = { id: 'enemy' };
  effects.add({ target: character, name: 'shrine:health', duration: 60, magnitude: 0.5 });
  effects.add({ target: enemy, name: 'stun', duration: 3, magnitude: 3 });

  effects.retainFor(character);

  assert.equal(effects.items.length, 1);
  assert.equal(effects.items[0].target, character);
  assert.equal(effects.items[0].remaining, 60);
});

test('starting above floor one grants one full level of experience per skipped floor', () => {
  assert.equal(experienceForSkippedFloors(1), 0);
  assert.equal(experienceForSkippedFloors(2), experienceToNextLevel(1));
  assert.equal(
    experienceForSkippedFloors(3),
    experienceToNextLevel(1) + experienceToNextLevel(2),
  );
  assert.equal(
    experienceForSkippedFloors(5),
    experienceToNextLevel(1) + experienceToNextLevel(2) + experienceToNextLevel(3) + experienceToNextLevel(4),
  );

  const character = new Character('warrior');
  character.allocateStat('strength', 2);
  const strength = character.stats.strength;
  const awarded = grantStartingFloorExperience(character, 5);

  assert.equal(awarded, experienceForSkippedFloors(5));
  assert.equal(character.level, 5);
  assert.equal(character.experience, 0);
  assert.equal(character.stats.strength, strength);
  assert.equal(character.statPoints, 10 - 2 + 4 * 5);
  assert.equal(character.abilityPoints, 2 + 4);
});

test('the boss floor holds only the placeholder boss and no regular population', () => {
  const floor = generateFloor(987654321, BOSS_FLOOR);
  assert.deepEqual(spawnFloorEnemies(floor, BOSS_FLOOR), []);

  const boss = spawnBossPlaceholder(floor);
  assert.equal(boss.isBoss, true);
  assert.equal(boss.typeId, 'bossPlaceholder');
  assert.equal(boss.faction, 'enemy');
  assert.equal(boss.alive, true);
  assert.ok(boss.maxHealth > ENEMY_TYPES.vampire.maxHealth * 2);
  assert.equal(floor.grid.isWalkable(Math.floor(boss.x), Math.floor(boss.y)), true);
  assert.equal(boss.state, 'idle');
});

test('boss floor requests are clamped into a valid boss layout', () => {
  const floor = generateFloor(55, { floorNumber: BOSS_FLOOR + 3 });
  assert.equal(floor.isBoss, true);
  assert.equal(floor.roomCount, 1);
  assert.equal(validateFloor(floor), true);
});

test('walking over a shrine applies its bonus and consumes it', () => {
  const character = new Character('wizard');
  const effects = new TimedEffectSystem();
  const logs = [];
  const baseHealth = character.healthRegen;
  const near = { type: 'health', magnitude: 0.5, x: 1.5, y: 1.5, id: 1 };
  const far = { type: 'speed', magnitude: 0.2, x: 9.5, y: 9.5, id: 2 };

  const game = Object.assign(Object.create(Game.prototype), {
    character,
    effects,
    player: { x: 1.5, y: 1.5, radius: 0.3 },
    floor: { shrines: [near, far] },
    hud: {
      addLog(message) {
        logs.push(message);
      },
      addFloat() {},
    },
    updateHud() {},
  });

  Game.prototype.updateShrines.call(game);

  assert.equal(game.floor.shrines.length, 1);
  assert.equal(game.floor.shrines[0], far);
  close(character.healthRegen, baseHealth * 1.5);
  assert.equal(effects.items.length, 1);
  assert.equal(effects.items[0].label, 'Health Shrine');
  assert.equal(effects.items[0].duration, 60);
  assert.ok(logs.some((line) => line.includes('Health Shrine')));

  effects.update(60);

  close(character.healthRegen, baseHealth);
  assert.equal(effects.items.length, 0);
});

test('defeating the boss opens the exit and reaching it alive completes the run', () => {
  const calls = { logs: [], floats: 0, overlay: null, abilityBar: true, cleared: false };
  const game = Object.assign(Object.create(Game.prototype), {
    state: 'playing',
    bossDefeated: false,
    exit: null,
    floor: { exitSpot: { x: 10.5, y: 8.5 } },
    character: {
      alive: true,
      className: 'Warrior',
      resetSelection() {
        calls.selectionReset = true;
      },
    },
    player: {
      x: 0,
      y: 0,
      clearPath() {
        calls.cleared = true;
      },
    },
    hud: {
      addLog(message) {
        calls.logs.push(message);
      },
      addFloat() {
        calls.floats += 1;
      },
    },
    clearTarget() {
      calls.targetCleared = true;
    },
    abilityBar: {
      setVisible(visible) {
        calls.abilityBar = visible;
      },
    },
    abilityPanel: {
      hide() {
        calls.panelHidden = true;
      },
    },
    showOverlay(message) {
      calls.overlay = message;
    },
  });

  Game.prototype.onBossDefeated.call(game, { x: 1, y: 1 });
  assert.equal(game.bossDefeated, true);
  assert.deepEqual(game.exit, { x: 10.5, y: 8.5 });
  assert.ok(calls.floats > 0);
  assert.ok(calls.logs.some((line) => line.includes('exit')));

  Game.prototype.onBossDefeated.call(game, { x: 99, y: 99 });
  assert.deepEqual(game.exit, { x: 10.5, y: 8.5 }, 'the exit does not move');

  Game.prototype.checkBossExit.call(game);
  assert.equal(game.state, 'playing', 'the player is still far from the exit');

  game.player.x = 10.5;
  game.player.y = 8.5;
  Game.prototype.checkBossExit.call(game);
  assert.equal(game.state, 'victory');
  assert.equal(calls.cleared, true);
  assert.equal(calls.abilityBar, false);
  assert.equal(calls.panelHidden, true);
  assert.match(calls.overlay, /escaped/i);
});

test('a dead player cannot complete the run through the exit', () => {
  const game = {
    state: 'playing',
    exit: { x: 5, y: 5 },
    character: { alive: false },
    player: { x: 5, y: 5 },
    completeRunCalled: false,
    completeRun() {
      this.completeRunCalled = true;
    },
  };

  Game.prototype.checkBossExit.call(game);

  assert.equal(game.state, 'playing');
  assert.equal(game.completeRunCalled, false);
});
