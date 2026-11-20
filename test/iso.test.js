import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_HEIGHT,
  TILE_WIDTH,
  screenToTile,
  screenToWorld,
  tileToWorld,
  worldToScreen,
  worldToTile,
} from '../src/gfx/iso.js';
import { Grid, moveCircle, circleHitsWall } from '../src/world/grid.js';

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('tile to world and back is identity', () => {
  for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [12.5, 3.25], [-4.5, 8.75], [100, 100]]) {
    const world = tileToWorld(tx, ty);
    const tile = worldToTile(world.x, world.y);
    close(tile.x, tx);
    close(tile.y, ty);
  }
});

test('tile centres are one tile apart on the iso grid', () => {
  const a = tileToWorld(0.5, 0.5);
  const b = tileToWorld(1.5, 0.5);
  const c = tileToWorld(0.5, 1.5);
  close(b.x - a.x, TILE_WIDTH / 2);
  close(b.y - a.y, TILE_HEIGHT / 2);
  close(c.x - a.x, -TILE_WIDTH / 2);
  close(c.y - a.y, TILE_HEIGHT / 2);
});

test('screen to world respects camera and viewport', () => {
  const camera = { x: 400, y: 250 };
  const viewWidth = 1280;
  const viewHeight = 720;
  const world = screenToWorld(640, 360, camera, viewWidth, viewHeight);
  close(world.x, camera.x);
  close(world.y, camera.y);

  const topLeft = screenToWorld(0, 0, camera, viewWidth, viewHeight);
  close(topLeft.x, camera.x - viewWidth / 2);
  close(topLeft.y, camera.y - viewHeight / 2);

  const screen = worldToScreen(world.x, world.y, camera, viewWidth, viewHeight);
  close(screen.x, 640);
  close(screen.y, 360);
});

test('mouse targeting survives viewport resizing', () => {
  const camera = { x: -120, y: 310 };
  const widths = [800, 1280, 1920, 640];

  for (const width of widths) {
    const height = Math.round(width * 0.5625);
    const sx = width * 0.37;
    const sy = height * 0.62;
    const tile = screenToTile(sx, sy, camera, width, height);
    const world = tileToWorld(tile.x, tile.y);
    const screen = worldToScreen(world.x, world.y, camera, width, height);
    close(screen.x, sx, 1e-6);
    close(screen.y, sy, 1e-6);
  }
});

test('grid bounds report blocked for out-of-bounds tiles', () => {
  const grid = new Grid(4, 4, 0);
  assert.equal(grid.isBlocked(-1, 0), true);
  assert.equal(grid.isBlocked(0, -1), true);
  assert.equal(grid.isBlocked(4, 0), true);
  assert.equal(grid.isBlocked(3, 3), false);
});

test('circle collision detects walls and near misses', () => {
  const grid = new Grid(8, 8, 0);
  grid.set(3, 3, 1);
  assert.equal(circleHitsWall(grid, 2.85, 3.5, 0.3), true);
  assert.equal(circleHitsWall(grid, 2.6, 3.5, 0.3), false);
});

test('moveCircle slides along walls instead of passing through', () => {
  const grid = new Grid(10, 10, 0);
  for (let y = 0; y < 10; y++) grid.set(5, y, 1);

  let position = { x: 4.5, y: 5.5 };
  for (let i = 0; i < 60; i++) {
    position = moveCircle(grid, position.x, position.y, 0.1, 0.05, 0.3);
  }

  assert.ok(position.x < 5 - 0.29, 'should not cross the wall');
  assert.ok(position.y > 5.5, 'should still slide along the wall');
});
