import { CAMERA } from '../config.js';
import { INITIAL_PITCH, INITIAL_YAW, isInitialView } from './camera.js';

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

const IDENTITY_MATRIX = Object.freeze({ m00: 1, m01: 0, m10: 0, m11: 1 });

export function tileToWorldX(tx, ty) {
  return (tx - ty) * HALF_W;
}

export function tileToWorldY(tx, ty) {
  return (tx + ty) * HALF_H;
}

export function tileToWorld(tx, ty) {
  return { x: tileToWorldX(tx, ty), y: tileToWorldY(tx, ty) };
}

export function worldToTileX(wx, wy) {
  return (wx / HALF_W + wy / HALF_H) / 2;
}

export function worldToTileY(wx, wy) {
  return (wy / HALF_H - wx / HALF_W) / 2;
}

export function worldToTile(wx, wy) {
  return { x: worldToTileX(wx, wy), y: worldToTileY(wx, wy) };
}

export function cameraMatrix(camera) {
  if (isInitialView(camera)) return IDENTITY_MATRIX;

  const yaw = Number.isFinite(camera?.yaw) ? camera.yaw : INITIAL_YAW;
  const pitch = Number.isFinite(camera?.pitch) ? camera.pitch : INITIAL_PITCH;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const sinPitch = Math.sin(pitch);
  const scale = CAMERA.scale;

  return {
    m00: (scale * (cosYaw + sinYaw)) / (2 * HALF_W),
    m01: (scale * (cosYaw - sinYaw)) / (2 * HALF_H),
    m10: (scale * sinPitch * (sinYaw - cosYaw)) / (2 * HALF_W),
    m11: (scale * sinPitch * (sinYaw + cosYaw)) / (2 * HALF_H),
  };
}

export function cameraInverseMatrix(camera) {
  const matrix = cameraMatrix(camera);
  if (matrix === IDENTITY_MATRIX) return IDENTITY_MATRIX;

  const determinant = matrix.m00 * matrix.m11 - matrix.m01 * matrix.m10;
  return {
    m00: matrix.m11 / determinant,
    m01: -matrix.m01 / determinant,
    m10: -matrix.m10 / determinant,
    m11: matrix.m00 / determinant,
  };
}

export function cameraDepth(camera, wx, wy) {
  if (!camera) return wy;
  const matrix = cameraMatrix(camera);
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  return matrix.m10 * dx + matrix.m11 * dy;
}

export function screenToWorld(sx, sy, camera, viewWidth, viewHeight) {
  const offsetX = sx - viewWidth / 2;
  const offsetY = sy - viewHeight / 2;
  const matrix = cameraInverseMatrix(camera);
  return {
    x: camera.x + matrix.m00 * offsetX + matrix.m01 * offsetY,
    y: camera.y + matrix.m10 * offsetX + matrix.m11 * offsetY,
  };
}

export function worldToScreen(wx, wy, camera, viewWidth, viewHeight) {
  const offsetX = wx - camera.x;
  const offsetY = wy - camera.y;
  const matrix = cameraMatrix(camera);
  return {
    x: viewWidth / 2 + matrix.m00 * offsetX + matrix.m01 * offsetY,
    y: viewHeight / 2 + matrix.m10 * offsetX + matrix.m11 * offsetY,
  };
}

export function screenToTile(sx, sy, camera, viewWidth, viewHeight) {
  const world = screenToWorld(sx, sy, camera, viewWidth, viewHeight);
  return worldToTile(world.x, world.y);
}

export function visibleWorldBounds(camera, viewWidth, viewHeight, margin = 0) {
  const halfWidth = viewWidth / 2;
  const halfHeight = viewHeight / 2;

  if (isInitialView(camera)) {
    return {
      minX: camera.x - halfWidth - margin,
      maxX: camera.x + halfWidth + margin,
      minY: camera.y - halfHeight - margin,
      maxY: camera.y + halfHeight + margin,
    };
  }

  const matrix = cameraInverseMatrix(camera);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ]) {
    const x = camera.x + matrix.m00 * sx + matrix.m01 * sy;
    const y = camera.y + matrix.m10 * sx + matrix.m11 * sy;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin,
  };
}

export function isWorldPointVisible(x, y, bounds) {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

export const TILE_CORNERS = [
  { x: 0, y: -HALF_H },
  { x: HALF_W, y: 0 },
  { x: 0, y: HALF_H },
  { x: -HALF_W, y: 0 },
];
