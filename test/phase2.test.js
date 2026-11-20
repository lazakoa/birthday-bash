import test from 'node:test';
import assert from 'node:assert/strict';

import { generateFloor } from '../src/world/floor.js';
import { ROOM_TARGET, MAP_SIZE } from '../src/world/bsp.js';
import { findPath, floodDistances, nearestWalkableTile, smoothPath } from '../src/world/pathfinding.js';
import { Player } from '../src/world/player.js';
import { Grid } from '../src/world/grid.js';

const SEEDS = [];
for (let i = 1; i <= 40; i++) SEEDS.push(i * 7919 + 13);

test('every generated floor has exactly 50 rooms', () => {
  for (const seed of SEEDS) {
    const floor = generateFloor(seed);
    assert.equal(floor.roomCount, ROOM_TARGET, `seed ${seed}`);
    assert.equal(floor.rooms.length, ROOM_TARGET, `seed ${seed}`);
  }
});

test('the same seed reproduces the same floor', () => {
  for (const seed of [1, 424242, 987654321]) {
    const a = generateFloor(seed);
    const b = generateFloor(seed);
    assert.equal(a.seed, b.seed);
    assert.deepEqual(a.rooms, b.rooms);
    assert.deepEqual(a.spawn, b.spawn);
    assert.deepEqual(a.stairs, b.stairs);
    assert.deepEqual(a.grid.tiles, b.grid.tiles);
  }
});

test('different seeds produce different floors', () => {
  const a = generateFloor(11);
  const b = generateFloor(12);
  assert.notDeepEqual(a.rooms, b.rooms);
});

test('spawn and stairs are walkable and in different rooms', () => {
  for (const seed of SEEDS) {
    const floor = generateFloor(seed);
    const { grid, spawn, stairs } = floor;
    assert.equal(grid.isWalkable(Math.floor(spawn.x), Math.floor(spawn.y)), true, `spawn ${seed}`);
    assert.equal(grid.isWalkable(Math.floor(stairs.x), Math.floor(stairs.y)), true, `stairs ${seed}`);
    assert.notEqual(floor.spawnRoom, floor.stairsRoom, `stairs in another room ${seed}`);
    assert.ok(floor.distances[Math.floor(stairs.y) * grid.width + Math.floor(stairs.x)] > 0, `stairs reachable ${seed}`);
  }
});

test('all room centres and all walkable tiles are reachable from the spawn', () => {
  for (const seed of SEEDS.slice(0, 12)) {
    const floor = generateFloor(seed);
    const { grid, rooms, spawn, distances } = floor;
    const spawnTile = { x: Math.floor(spawn.x), y: Math.floor(spawn.y) };
    const fresh = floodDistances(grid, spawnTile.x, spawnTile.y);

    for (const room of rooms) {
      assert.notEqual(fresh[room.cy * grid.width + room.cx], 0xffffffff, `room ${seed}`);
    }

    let walkable = 0;
    grid.forEachTile((tx, ty, value) => {
      if (value !== 0) return;
      walkable += 1;
      assert.notEqual(fresh[ty * grid.width + tx], 0xffffffff, `tile ${tx},${ty} seed ${seed}`);
    });
    assert.ok(walkable > 500, 'floor has a substantial walkable area');
    assert.equal(distances[Math.floor(floor.stairs.y) * grid.width + Math.floor(floor.stairs.x)] > 0, true);
  }
});

test('generated floors stay inside the map bounds', () => {
  for (const seed of SEEDS) {
    const floor = generateFloor(seed);
    for (const room of floor.rooms) {
      assert.ok(room.x >= 1 && room.y >= 1, `room origin ${seed}`);
      assert.ok(room.x + room.w <= MAP_SIZE - 1, `room width ${seed}`);
      assert.ok(room.y + room.h <= MAP_SIZE - 1, `room height ${seed}`);
    }
    assert.equal(floor.grid.width, MAP_SIZE);
    assert.equal(floor.grid.height, MAP_SIZE);
  }
});

test('A star finds a path from spawn to stairs that only crosses walkable tiles', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const floor = generateFloor(seed);
    const path = findPath(floor.grid, floor.spawn.x, floor.spawn.y, floor.stairs.x, floor.stairs.y);
    assert.ok(path && path.length > 0, `path exists for seed ${seed}`);

    let previous = { x: Math.floor(floor.spawn.x), y: Math.floor(floor.spawn.y) };
    for (const point of path) {
      const tile = { x: Math.floor(point.x), y: Math.floor(point.y) };
      assert.equal(floor.grid.isWalkable(tile.x, tile.y), true, `path tile walkable ${seed}`);
      assert.ok(Math.abs(tile.x - previous.x) <= 1 && Math.abs(tile.y - previous.y) <= 1, `steps adjacent ${seed}`);
      previous = tile;
    }
    assert.deepEqual(previous, {
      x: Math.floor(floor.stairs.x),
      y: Math.floor(floor.stairs.y),
    });
  }
});

test('A star does not cut wall corners diagonally', () => {
  const grid = new Grid(6, 6, 0);
  grid.set(2, 1, 1);
  grid.set(1, 2, 1);
  const path = findPath(grid, 1.5, 1.5, 2.5, 2.5);
  assert.ok(path.length > 1, 'must go around, not squeeze between the walls');
});

test('smoothed path starts from the player and reaches the goal', () => {
  const floor = generateFloor(2024);
  const raw = findPath(floor.grid, floor.spawn.x, floor.spawn.y, floor.stairs.x, floor.stairs.y);
  const smoothed = smoothPath(floor.grid, floor.spawn.x, floor.spawn.y, raw, 0.3);

  assert.ok(smoothed.length > 0);
  assert.ok(smoothed.length <= raw.length);
  const goal = smoothed[smoothed.length - 1];
  assert.deepEqual(
    { x: Math.floor(goal.x), y: Math.floor(goal.y) },
    { x: Math.floor(floor.stairs.x), y: Math.floor(floor.stairs.y) },
  );
});

test('player walks a generated floor to the staircase without getting stuck', () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const floor = generateFloor(seed);
    const player = new Player(floor.spawn.x, floor.spawn.y);
    const raw = findPath(floor.grid, player.x, player.y, floor.stairs.x, floor.stairs.y);
    const smoothed = smoothPath(floor.grid, player.x, player.y, raw, player.radius);
    player.setPath(smoothed);

    let elapsed = 0;
    while (player.hasPath && elapsed < 180) {
      player.update(floor.grid, 1 / 60);
      elapsed += 1 / 60;
    }

    assert.equal(player.hasPath, false, `path completed for seed ${seed}`);
    const distance = Math.hypot(player.x - floor.stairs.x, player.y - floor.stairs.y);
    assert.ok(distance < 1.0, `reached the stairs for seed ${seed} (distance ${distance})`);
  }
});

test('nearest walkable tile finds a target when clicking a wall', () => {
  const floor = generateFloor(777);
  const { grid } = floor;
  let wall = null;
  grid.forEachTile((tx, ty, value) => {
    if (!wall && value !== 0) wall = { x: tx, y: ty };
  });
  assert.ok(wall, 'floor has walls');
  const near = nearestWalkableTile(grid, wall.x, wall.y, 6);
  assert.ok(near, 'found a nearby walkable tile');
  assert.equal(grid.isWalkable(near.x, near.y), true);
});
