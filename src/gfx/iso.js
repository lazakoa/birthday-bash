export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

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

export function screenToWorld(sx, sy, camera, viewWidth, viewHeight) {
  return {
    x: sx - viewWidth / 2 + camera.x,
    y: sy - viewHeight / 2 + camera.y,
  };
}

export function worldToScreen(wx, wy, camera, viewWidth, viewHeight) {
  return {
    x: wx - camera.x + viewWidth / 2,
    y: wy - camera.y + viewHeight / 2,
  };
}

export function screenToTile(sx, sy, camera, viewWidth, viewHeight) {
  const world = screenToWorld(sx, sy, camera, viewWidth, viewHeight);
  return worldToTile(world.x, world.y);
}

export const TILE_CORNERS = [
  { x: 0, y: -HALF_H },
  { x: HALF_W, y: 0 },
  { x: 0, y: HALF_H },
  { x: -HALF_W, y: 0 },
];
