import { DUNGEON, SHRINES } from '../config.js';
import { Rng } from './rng.js';

export const SHRINE_TYPE_IDS = Object.keys(SHRINES.types);

export function shrineType(typeId) {
  return SHRINES.types[typeId] ?? null;
}

export function shrineRngFor(seed, floorNumber) {
  return new Rng((seed ^ 0x5f3759df ^ Math.imul(floorNumber, 0x9e3779b9)) >>> 0);
}

function pickSpot(grid, room, spawn, stairs, rng) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const tx = rng.int(room.x, room.x + room.w - 1);
    const ty = rng.int(room.y, room.y + room.h - 1);
    if (!grid.isWalkable(tx, ty)) continue;
    const x = tx + 0.5;
    const y = ty + 0.5;
    if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < SHRINES.spawnClearance) continue;
    if (stairs && Math.hypot(x - stairs.x, y - stairs.y) < SHRINES.stairsClearance) continue;
    return { x, y };
  }

  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (!grid.isWalkable(tx, ty)) continue;
      const x = tx + 0.5;
      const y = ty + 0.5;
      if (spawn && Math.hypot(x - spawn.x, y - spawn.y) < SHRINES.spawnClearance) continue;
      if (stairs && Math.hypot(x - stairs.x, y - stairs.y) < SHRINES.stairsClearance) continue;
      return { x, y };
    }
  }
  return null;
}

export function createShrine(typeId, x, y, room = null, id = 1) {
  const type = SHRINES.types[typeId];
  if (!type) throw new Error(`Unknown shrine type: ${typeId}`);
  return {
    id,
    type: typeId,
    name: type.name,
    sprite: type.sprite,
    magnitude: type.magnitude,
    color: type.color,
    hudColor: type.hudColor,
    description: type.description,
    x,
    y,
    room,
  };
}

export function generateFloorShrines({ seed, grid, rooms, spawn = null, stairs = null, floorNumber = 1, rng = null }) {
  if (!grid || !rooms || floorNumber > DUNGEON.regularFloors) return [];
  const random = rng ?? shrineRngFor(seed >>> 0, floorNumber);
  const shrines = [];

  for (const room of rooms) {
    if (!random.chance(SHRINES.roomChance)) continue;
    const typeId = random.pick(SHRINE_TYPE_IDS);
    const spot = pickSpot(grid, room, spawn, stairs, random);
    if (!spot) continue;
    shrines.push(createShrine(typeId, spot.x, spot.y, room, shrines.length + 1));
  }

  return shrines;
}
