import { circleHitsWall } from './grid.js';

const DIAGONAL = Math.SQRT2;

class MinHeap {
  constructor() {
    this.indices = [];
    this.priorities = [];
  }

  get size() {
    return this.indices.length;
  }

  push(index, priority) {
    this.indices.push(index);
    this.priorities.push(priority);
    let i = this.indices.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop() {
    const top = this.indices[0];
    const lastIndex = this.indices.pop();
    const lastPriority = this.priorities.pop();
    if (this.indices.length > 0) {
      this.indices[0] = lastIndex;
      this.priorities[0] = lastPriority;
      let i = 0;
      const length = this.indices.length;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < length && this.priorities[left] < this.priorities[smallest]) smallest = left;
        if (right < length && this.priorities[right] < this.priorities[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  swap(a, b) {
    const index = this.indices[a];
    this.indices[a] = this.indices[b];
    this.indices[b] = index;
    const priority = this.priorities[a];
    this.priorities[a] = this.priorities[b];
    this.priorities[b] = priority;
  }
}

export function floodDistances(grid, sx, sy) {
  const size = grid.width * grid.height;
  const distances = new Uint32Array(size).fill(0xffffffff);
  if (!grid.isWalkable(sx, sy)) return distances;

  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  const start = sy * grid.width + sx;
  distances[start] = 0;
  queue[tail++] = start;

  const width = grid.width;
  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = (current / width) | 0;
    const nextDistance = distances[current] + 1;
    if (y > 0) relax(x, y - 1);
    if (y < grid.height - 1) relax(x, y + 1);
    if (x > 0) relax(x - 1, y);
    if (x < width - 1) relax(x + 1, y);

    function relax(nx, ny) {
      const index = ny * width + nx;
      if (distances[index] !== 0xffffffff) return;
      if (grid.isBlocked(nx, ny)) return;
      distances[index] = nextDistance;
      queue[tail++] = index;
    }
  }

  return distances;
}

export function findPath(grid, startX, startY, goalX, goalY) {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  const gx = Math.floor(goalX);
  const gy = Math.floor(goalY);

  if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) return null;
  if (!grid.isWalkable(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];

  const width = grid.width;
  const height = grid.height;
  const size = width * height;

  const gScore = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new MinHeap();

  const startIndex = sy * width + sx;
  const goalIndex = gy * width + gx;
  gScore[startIndex] = 0;
  open.push(startIndex, heuristic(sx, sy, gx, gy));

  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, DIAGONAL],
    [1, -1, DIAGONAL],
    [-1, 1, DIAGONAL],
    [-1, -1, DIAGONAL],
  ];

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    if (current === goalIndex) {
      return reconstruct(cameFrom, current, width);
    }
    closed[current] = 1;

    const cx = current % width;
    const cy = (current / width) | 0;

    for (const [dx, dy, cost] of neighbors) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (grid.isBlocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (grid.isBlocked(cx + dx, cy) || grid.isBlocked(cx, cy + dy)) continue;
      }
      const index = ny * width + nx;
      if (closed[index]) continue;
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[index]) continue;
      gScore[index] = tentative;
      cameFrom[index] = current;
      open.push(index, tentative + heuristic(nx, ny, gx, gy));
    }
  }

  return null;
}

function heuristic(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (DIAGONAL - 1) * Math.min(dx, dy);
}

function reconstruct(cameFrom, current, width) {
  const tiles = [];
  let index = current;
  while (index !== -1) {
    const x = index % width;
    const y = (index / width) | 0;
    tiles.push({ x: x + 0.5, y: y + 0.5 });
    index = cameFrom[index];
  }
  tiles.reverse();
  tiles.shift();
  return tiles;
}

export function hasLineOfSight(grid, ax, ay, bx, by, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return true;
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (circleHitsWall(grid, x, y, radius)) return false;
  }
  return true;
}

export function smoothPath(grid, startX, startY, points, radius) {
  if (points.length === 0) return [];
  const smoothed = [];
  let anchorX = startX;
  let anchorY = startY;
  let i = 0;

  while (i < points.length) {
    let best = i;
    let probe = i + 1;
    while (probe < points.length && probe - i <= 32) {
      if (!hasLineOfSight(grid, anchorX, anchorY, points[probe].x, points[probe].y, radius)) break;
      best = probe;
      probe += 1;
    }
    const point = points[best];
    smoothed.push(point);
    anchorX = point.x;
    anchorY = point.y;
    i = best + 1;
  }

  return smoothed;
}

export function nearestWalkableTile(grid, tx, ty, maxRadius = 6) {
  if (grid.isWalkable(tx, ty)) return { x: tx, y: ty };
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best = null;
    let bestDistance = Infinity;
    for (let y = ty - radius; y <= ty + radius; y++) {
      for (let x = tx - radius; x <= tx + radius; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== radius) continue;
        if (!grid.inBounds(x, y) || !grid.isWalkable(x, y)) continue;
        const distance = Math.hypot(x - tx, y - ty);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
