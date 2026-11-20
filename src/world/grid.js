export class Grid {
  constructor(width, height, fill = 1) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height).fill(fill);
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  get(tx, ty) {
    if (!this.inBounds(tx, ty)) return 1;
    return this.tiles[ty * this.width + tx];
  }

  set(tx, ty, value) {
    if (!this.inBounds(tx, ty)) return;
    this.tiles[ty * this.width + tx] = value;
  }

  isBlocked(tx, ty) {
    return this.get(tx, ty) !== 0;
  }

  isWalkable(tx, ty) {
    return !this.isBlocked(tx, ty);
  }

  forEachTile(fn) {
    for (let ty = 0; ty < this.height; ty++) {
      for (let tx = 0; tx < this.width; tx++) {
        fn(tx, ty, this.get(tx, ty));
      }
    }
  }
}

export function circleHitsWall(grid, cx, cy, radius) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.floor(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.floor(cy + radius);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (!grid.isBlocked(tx, ty)) continue;
      const nearestX = Math.max(tx, Math.min(cx, tx + 1));
      const nearestY = Math.max(ty, Math.min(cy, ty + 1));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  return false;
}

export function moveCircle(grid, x, y, dx, dy, radius) {
  let nx = x;
  let ny = y;
  if (dx !== 0 && !circleHitsWall(grid, nx + dx, ny, radius)) nx += dx;
  if (dy !== 0 && !circleHitsWall(grid, nx, ny + dy, radius)) ny += dy;
  return { x: nx, y: ny };
}

export function isWalkableWorld(grid, wx, wy) {
  return grid.isWalkable(Math.floor(wx), Math.floor(wy));
}
