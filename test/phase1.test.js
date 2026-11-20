import test from 'node:test';
import assert from 'node:assert/strict';

import { Grid, circleHitsWall } from '../src/world/grid.js';
import { Player } from '../src/world/player.js';
import { generateFloor } from '../src/world/floor.js';
import { findPath } from '../src/world/pathfinding.js';
import { createCamera, followCamera } from '../src/gfx/camera.js';
import { screenToTile, tileToWorld, worldToScreen } from '../src/gfx/iso.js';

const STEP = 1 / 60;

function simulate(player, grid, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) player.update(grid, STEP);
}

test('player walks to a walkable destination and stops', () => {
  const floor = generateFloor(1234);
  const player = new Player(floor.spawn.x, floor.spawn.y);

  const target = findNearestWalkable(floor.grid, Math.floor(floor.spawn.x) + 2, Math.floor(floor.spawn.y) + 2);
  player.setDestination(target.x + 0.5, target.y + 0.5);
  simulate(player, floor.grid, 8);

  assert.ok(Math.abs(player.x - (target.x + 0.5)) < 1e-6, 'x reached');
  assert.ok(Math.abs(player.y - (target.y + 0.5)) < 1e-6, 'y reached');
  assert.equal(player.destination, null);
  assert.equal(player.moving, false);
});

test('player cannot walk through walls', () => {
  const grid = new Grid(12, 12, 0);
  for (let y = 0; y < 12; y++) grid.set(5, y, 1);

  const player = new Player(4.4, 6.5);
  player.setDestination(8.5, 6.5);
  simulate(player, grid, 4);

  assert.ok(!circleHitsWall(grid, player.x, player.y, player.radius), 'not inside a wall');
  assert.ok(Math.floor(player.x + player.radius) < 5, `stopped before the wall (x=${player.x})`);
});

test('player follows a multi-waypoint path', () => {
  const grid = new Grid(20, 20, 0);
  for (let y = 0; y < 14; y++) grid.set(8, y, 1);

  const player = new Player(4.5, 3.5);
  const path = findPath(grid, player.x, player.y, 15.5, 15.5);
  assert.ok(path, 'path found');
  player.setPath([...path, { x: 15.5, y: 15.5 }]);
  simulate(player, grid, 20);

  assert.ok(Math.abs(player.x - 15.5) < 0.3, `x arrived (${player.x})`);
  assert.ok(Math.abs(player.y - 15.5) < 0.3, `y arrived (${player.y})`);
});

test('camera follows the player smoothly and settles on the target', () => {
  const camera = createCamera(0, 0);
  const target = { x: 300, y: -120 };

  followCamera(camera, target, STEP, 12);
  assert.ok(camera.x > 0 && camera.x < target.x, 'moves partway on the first step');
  assert.ok(camera.y < 0 && camera.y > target.y, 'moves on both axes');

  for (let i = 0; i < 300; i++) followCamera(camera, target, STEP, 12);
  assert.ok(Math.abs(camera.x - target.x) < 0.5, 'converges on x');
  assert.ok(Math.abs(camera.y - target.y) < 0.5, 'converges on y');
});

test('mouse targeting stays accurate while the camera moves', () => {
  const camera = createCamera(-64, 128);
  const viewWidth = 1440;
  const viewHeight = 900;
  const clicks = [
    [720, 450],
    [40, 60],
    [1400, 860],
  ];

  for (const [sx, sy] of clicks) {
    const tile = screenToTile(sx, sy, camera, viewWidth, viewHeight);
    const world = tileToWorld(tile.x, tile.y);
    const screen = worldToScreen(world.x, world.y, camera, viewWidth, viewHeight);
    assert.ok(Math.abs(screen.x - sx) < 1e-6);
    assert.ok(Math.abs(screen.y - sy) < 1e-6);
  }

  camera.x += 250;
  camera.y -= 75;
  for (const [sx, sy] of clicks) {
    const tile = screenToTile(sx, sy, camera, viewWidth, viewHeight);
    const world = tileToWorld(tile.x, tile.y);
    const screen = worldToScreen(world.x, world.y, camera, viewWidth, viewHeight);
    assert.ok(Math.abs(screen.x - sx) < 1e-6);
    assert.ok(Math.abs(screen.y - sy) < 1e-6);
  }
});

function findNearestWalkable(grid, tx, ty) {
  for (let radius = 0; radius < 8; radius++) {
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (grid.isWalkable(x, y)) return { x, y };
      }
    }
  }
  throw new Error('no walkable tile found');
}
