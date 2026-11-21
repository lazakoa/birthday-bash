import test from 'node:test';
import assert from 'node:assert/strict';

import { CAMERA, WALL } from '../src/config.js';
import {
  INITIAL_PITCH,
  INITIAL_YAW,
  createCamera,
  isInitialView,
  resetCameraView,
  updateCameraView,
} from '../src/gfx/camera.js';
import {
  cameraDepth,
  cameraInverseMatrix,
  cameraMatrix,
  isWorldPointVisible,
  screenToTile,
  screenToWorld,
  tileToWorld,
  visibleWorldBounds,
  worldToScreen,
} from '../src/gfx/iso.js';

const DEG = Math.PI / 180;
const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};
const closeAngle = (actual, expected, epsilon = 1e-9) => {
  const difference = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
  assert.ok(Math.abs(difference) <= epsilon, `${actual} != ${expected}`);
};

test('a new camera starts on the exact initial isometric view', () => {
  const camera = createCamera(120, -40);
  assert.equal(camera.x, 120);
  assert.equal(camera.y, -40);
  assert.equal(camera.yaw, INITIAL_YAW);
  assert.equal(camera.pitch, INITIAL_PITCH);
  assert.equal(isInitialView(camera), true);
  assert.deepEqual(cameraMatrix(camera), { m00: 1, m01: 0, m10: 0, m11: 1 });
});

test('arrow axes turn and pitch the camera continuously with limits and cancellation', () => {
  const camera = createCamera(0, 0);

  updateCameraView(camera, 1, { left: true });
  closeAngle(camera.yaw, INITIAL_YAW + CAMERA.yawDegreesPerSecond * DEG);

  updateCameraView(camera, 0.5, { right: true });
  closeAngle(camera.yaw, INITIAL_YAW + CAMERA.yawDegreesPerSecond * DEG * 0.5);

  updateCameraView(camera, 10, { up: true });
  close(camera.pitch, CAMERA.maxPitchDegrees * DEG);
  updateCameraView(camera, 10, { up: true });
  close(camera.pitch, CAMERA.maxPitchDegrees * DEG);
  updateCameraView(camera, 10, { down: true });
  close(camera.pitch, CAMERA.minPitchDegrees * DEG);

  const before = { yaw: camera.yaw, pitch: camera.pitch };
  updateCameraView(camera, 1, { left: true, right: true, up: true, down: true });
  closeAngle(camera.yaw, before.yaw);
  close(camera.pitch, before.pitch);

  resetCameraView(camera);
  assert.equal(camera.yaw, INITIAL_YAW);
  assert.equal(camera.pitch, INITIAL_PITCH);
});

test('yaw wraps through 360 degrees without changing direction', () => {
  const camera = createCamera(0, 0);
  camera.yaw = 359 * DEG;
  updateCameraView(camera, 0.1, { left: true });
  closeAngle(camera.yaw, 368 * DEG);
  resetCameraView(camera);
  updateCameraView(camera, 0.5, { right: true });
  closeAngle(camera.yaw, INITIAL_YAW - CAMERA.yawDegreesPerSecond * DEG * 0.5);
});

test('screen and world conversion round-trip at every camera orientation', () => {
  const viewports = [
    [800, 600],
    [1280, 720],
    [1920, 1080],
    [640, 360],
  ];
  const angles = [
    [0, 15],
    [17, 60],
    [45, 30],
    [90, 75],
    [225, 37],
    [359, 22],
  ];

  for (const [yawDegrees, pitchDegrees] of angles) {
    for (const [width, height] of viewports) {
      const camera = createCamera(-123, 456);
      camera.yaw = yawDegrees * DEG;
      camera.pitch = pitchDegrees * DEG;

      for (const [sxRatio, syRatio] of [
        [0, 0],
        [1, 1],
        [0.37, 0.62],
        [0.8, 0.15],
      ]) {
        const sx = width * sxRatio;
        const sy = height * syRatio;
        const tile = screenToTile(sx, sy, camera, width, height);
        const world = tileToWorld(tile.x, tile.y);
        const screen = worldToScreen(world.x, world.y, camera, width, height);
        close(screen.x, sx, 1e-6);
        close(screen.y, sy, 1e-6);
      }
    }
  }
});

test('rotated view bounds contain every viewport corner', () => {
  const camera = createCamera(50, -25);
  camera.yaw = 17 * DEG;
  camera.pitch = 60 * DEG;
  const width = 800;
  const height = 600;
  const bounds = visibleWorldBounds(camera, width, height);

  for (const [sx, sy] of [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
    [width / 2, height / 2],
  ]) {
    const world = screenToWorld(sx, sy, camera, width, height);
    assert.equal(isWorldPointVisible(world.x, world.y, bounds), true, `${sx},${sy} was culled`);
  }
});

test('camera depth follows the rotated view axis', () => {
  const camera = createCamera(0, 0);
  const xAhead = tileToWorld(6.5, 5.5);
  const yAhead = tileToWorld(5.5, 6.5);
  close(cameraDepth(camera, xAhead.x, xAhead.y), cameraDepth(camera, yAhead.x, yAhead.y), 1e-6);

  camera.yaw = 90 * DEG;
  camera.pitch = 60 * DEG;
  assert.ok(cameraDepth(camera, xAhead.x, xAhead.y) > cameraDepth(camera, yAhead.x, yAhead.y));
});

test('wall tops keep a constant screen height while their footprint follows the camera', () => {
  for (const yawDegrees of [0, 17, 45, 90, 225]) {
    for (const pitchDegrees of [15, 30, 60]) {
      const camera = createCamera(40, -20);
      camera.yaw = yawDegrees * DEG;
      camera.pitch = pitchDegrees * DEG;
      const inverse = cameraInverseMatrix(camera);
      const offsetX = -WALL.height * inverse.m01;
      const offsetY = -WALL.height * inverse.m11;
      const matrix = cameraMatrix(camera);
      close(matrix.m00 * offsetX + matrix.m01 * offsetY, 0, 1e-6);
      close(matrix.m10 * offsetX + matrix.m11 * offsetY, -WALL.height, 1e-6);
    }
  }
});
