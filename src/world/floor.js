import { Grid } from './grid.js';
import { MAP_SIZE, generateLayout, ROOM_TARGET } from './bsp.js';
import { Rng } from './rng.js';
import { floodDistances } from './pathfinding.js';

const STAIRS_TARGET_DISTANCE = 80;
const STAIRS_MIN_DISTANCE = 24;

function carveRect(grid, rect) {
  const { x, y, w, h } = rect;
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (grid.inBounds(tx, ty)) grid.set(tx, ty, 0);
    }
  }
}

function roomCenter(room) {
  return { x: room.cx + 0.5, y: room.cy + 0.5 };
}

function buildFloor(seed) {
  const { rooms, corridors } = generateLayout(seed);
  const grid = new Grid(MAP_SIZE, MAP_SIZE, 1);

  for (const room of rooms) carveRect(grid, room);
  for (const corridor of corridors) carveRect(grid, corridor);

  const rng = new Rng((seed ^ 0x51633e2d) >>> 0);
  const spawnRoom = rng.pick(rooms);
  const spawn = roomCenter(spawnRoom);

  const distances = floodDistances(grid, spawnRoom.cx, spawnRoom.cy);

  let stairsRoom = null;
  let bestScore = Infinity;
  for (const room of rooms) {
    if (room === spawnRoom) continue;
    const index = room.cy * grid.width + room.cx;
    const distance = distances[index];
    if (distance === 0xffffffff) continue;
    const score = Math.abs(distance - STAIRS_TARGET_DISTANCE) + (distance < STAIRS_MIN_DISTANCE ? 1000 : 0);
    if (score < bestScore) {
      bestScore = score;
      stairsRoom = room;
    }
  }
  if (!stairsRoom) stairsRoom = spawnRoom;

  return {
    seed,
    grid,
    rooms,
    roomCount: rooms.length,
    spawn,
    stairs: roomCenter(stairsRoom),
    spawnRoom,
    stairsRoom,
    distances,
  };
}

export function validateFloor(floor) {
  const { grid, rooms, spawn, stairs, distances } = floor;
  if (rooms.length !== ROOM_TARGET) return false;

  const spawnX = Math.floor(spawn.x);
  const spawnY = Math.floor(spawn.y);
  const stairsX = Math.floor(stairs.x);
  const stairsY = Math.floor(stairs.y);

  if (!grid.isWalkable(spawnX, spawnY)) return false;
  if (!grid.isWalkable(stairsX, stairsY)) return false;
  if (distances[stairsY * grid.width + stairsX] === 0xffffffff) return false;

  for (const room of rooms) {
    if (distances[room.cy * grid.width + room.cx] === 0xffffffff) return false;
  }

  let walkable = 0;
  let reachable = 0;
  grid.forEachTile((tx, ty, value) => {
    if (value !== 0) return;
    walkable += 1;
    if (distances[ty * grid.width + tx] !== 0xffffffff) reachable += 1;
  });

  return walkable === reachable;
}

export function generateFloor(seed) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = attempt === 0 ? seed >>> 0 : (seed + attempt * 0x9e3779b9) >>> 0;
    try {
      const floor = buildFloor(attemptSeed);
      if (validateFloor(floor)) return floor;
      lastError = new Error(`floor ${attemptSeed} failed connectivity validation`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to generate a valid floor');
}

export { MAP_SIZE };
