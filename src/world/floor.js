import { DUNGEON } from '../config.js';
import { Grid } from './grid.js';
import { MAP_SIZE, generateLayout, ROOM_TARGET } from './bsp.js';
import { Rng, nextSeed } from './rng.js';
import { floodDistances } from './pathfinding.js';
import { generateFloorShrines } from './shrines.js';

const STAIRS_TARGET_DISTANCE = 80;
const STAIRS_MIN_DISTANCE = 24;

export const REGULAR_FLOORS = DUNGEON.regularFloors;
export const BOSS_FLOOR = DUNGEON.bossFloor;
export const TOTAL_FLOORS = DUNGEON.totalFloors;

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

export function isBossFloor(floorNumber) {
  return normalizeFloorNumber(floorNumber) >= BOSS_FLOOR;
}

function normalizeFloorNumber(value, fallback = 1) {
  if (value && typeof value === 'object') {
    if (value.isBoss) return DUNGEON.bossFloor;
    return normalizeFloorNumber(value.floorNumber ?? value.floor ?? value.level ?? fallback, fallback);
  }
  if (typeof value === 'string' && value.toLowerCase() === 'boss') return DUNGEON.bossFloor;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.floor(number));
}

function chooseStairsRoom(rooms, spawnRoom, distances, grid) {
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
  return stairsRoom ?? spawnRoom;
}

function buildRegularFloor(seed, floorNumber) {
  const { rooms, corridors } = generateLayout(seed);
  const grid = new Grid(MAP_SIZE, MAP_SIZE, 1);

  for (const room of rooms) carveRect(grid, room);
  for (const corridor of corridors) carveRect(grid, corridor);

  const rng = new Rng((seed ^ 0x51633e2d) >>> 0);
  const spawnRoom = rng.pick(rooms);
  const spawn = roomCenter(spawnRoom);

  const distances = floodDistances(grid, spawnRoom.cx, spawnRoom.cy);
  const stairsRoom = chooseStairsRoom(rooms, spawnRoom, distances, grid);
  const stairs = roomCenter(stairsRoom);
  const shrines = generateFloorShrines({
    seed,
    grid,
    rooms,
    spawn,
    stairs,
    floorNumber,
    rng: new Rng((seed ^ 0x68e31da4 ^ Math.imul(floorNumber, 0x85ebca6b)) >>> 0),
  });

  return {
    seed,
    grid,
    rooms,
    roomCount: rooms.length,
    spawn,
    stairs,
    spawnRoom,
    stairsRoom,
    distances,
    shrines,
    isBoss: false,
    floorNumber,
  };
}

function buildBossFloor(seed, floorNumber) {
  const grid = new Grid(MAP_SIZE, MAP_SIZE, 1);
  const size = DUNGEON.bossRoomSize;
  const x = Math.floor((MAP_SIZE - size) / 2);
  const y = Math.floor((MAP_SIZE - size) / 2);
  const room = { x, y, w: size, h: size, cx: x + Math.floor(size / 2), cy: y + Math.floor(size / 2) };
  carveRect(grid, room);

  const spawn = {
    x: room.cx + 0.5,
    y: room.y + room.h - DUNGEON.bossRoomSpawnOffset + 0.5,
  };
  const bossSpawn = {
    x: room.cx + 0.5,
    y: room.y + DUNGEON.bossRoomBossOffset + 0.5,
  };
  const exitSpot = roomCenter(room);
  const distances = floodDistances(grid, Math.floor(spawn.x), Math.floor(spawn.y));

  return {
    seed,
    grid,
    rooms: [room],
    roomCount: 1,
    spawn,
    stairs: null,
    spawnRoom: room,
    stairsRoom: null,
    distances,
    shrines: [],
    isBoss: true,
    floorNumber,
    bossRoom: room,
    bossSpawn,
    exitSpot,
  };
}

export function validateFloor(floor) {
  const { grid, rooms, spawn, stairs, distances } = floor;
  if (!grid || !distances) return false;
  if (rooms.length !== (floor.isBoss ? 1 : ROOM_TARGET)) return false;

  const spawnX = Math.floor(spawn.x);
  const spawnY = Math.floor(spawn.y);
  if (!grid.isWalkable(spawnX, spawnY)) return false;
  if (distances[spawnY * grid.width + spawnX] === 0xffffffff) return false;

  if (!floor.isBoss) {
    if (!stairs) return false;
    const stairsX = Math.floor(stairs.x);
    const stairsY = Math.floor(stairs.y);
    if (!grid.isWalkable(stairsX, stairsY)) return false;
    if (distances[stairsY * grid.width + stairsX] === 0xffffffff) return false;
  } else {
    for (const point of [floor.bossSpawn, floor.exitSpot]) {
      if (!point) return false;
      const tx = Math.floor(point.x);
      const ty = Math.floor(point.y);
      if (!grid.isWalkable(tx, ty)) return false;
      if (distances[ty * grid.width + tx] === 0xffffffff) return false;
    }
  }

  for (const room of rooms) {
    if (distances[room.cy * grid.width + room.cx] === 0xffffffff) return false;
  }

  for (const shrine of floor.shrines ?? []) {
    if (!grid.isWalkable(Math.floor(shrine.x), Math.floor(shrine.y))) return false;
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

export function generateFloor(seed, floorNumberOrOptions = 1) {
  const normalizedSeed = (Number(seed) || 0) >>> 0;
  const floorNumber = normalizeFloorNumber(floorNumberOrOptions);

  if (floorNumber >= BOSS_FLOOR) {
    const floor = buildBossFloor(normalizedSeed, floorNumber);
    if (!validateFloor(floor)) throw new Error(`boss floor ${normalizedSeed} failed validation`);
    return floor;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const attemptSeed = attempt === 0 ? normalizedSeed : (normalizedSeed + attempt * 0x9e3779b9) >>> 0;
    try {
      const floor = buildRegularFloor(attemptSeed, floorNumber);
      if (validateFloor(floor)) return floor;
      lastError = new Error(`floor ${attemptSeed} failed connectivity validation`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to generate a valid floor');
}

export function generateDungeon(seed) {
  const floors = [];
  let currentSeed = (Number(seed) || 0) >>> 0;
  for (let floorNumber = 1; floorNumber <= TOTAL_FLOORS; floorNumber++) {
    const floor = generateFloor(currentSeed, floorNumber);
    floors.push(floor);
    currentSeed = nextSeed(floor.seed);
  }
  return floors;
}

export { MAP_SIZE };
