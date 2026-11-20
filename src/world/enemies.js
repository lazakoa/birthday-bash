import { Entity } from './entity.js';
import { Rng } from './rng.js';

export const ENEMY_TYPES = {
  trainingDummy: {
    id: 'trainingDummy',
    name: 'Training Dummy',
    sprite: 'dummy',
    maxHealth: 60,
    maxMana: 0,
    radius: 0.34,
    experience: 12,
    speed: 0,
    stationary: true,
  },
};

export class Enemy extends Entity {
  constructor(typeId, x, y) {
    const type = ENEMY_TYPES[typeId];
    if (!type) throw new Error(`Unknown enemy type: ${typeId}`);

    super({
      name: type.name,
      kind: 'enemy',
      faction: 'enemy',
      x,
      y,
      radius: type.radius,
      maxHealth: type.maxHealth,
      maxMana: type.maxMana,
      sprite: type.sprite,
    });
    this.typeId = typeId;
    this.experience = type.experience;
    this.speed = type.speed;
    this.stationary = type.stationary;
    this.moving = false;
    this.facing = -1;
  }
}

export function spawnTrainingDummies(floor, count = 3) {
  const room = floor.spawnRoom;
  const rng = new Rng((floor.seed ^ 0x2f6e2b1d) >>> 0);
  const spots = [];

  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (!floor.grid.isWalkable(tx, ty)) continue;
      const x = tx + 0.5;
      const y = ty + 0.5;
      const fromSpawn = Math.hypot(x - floor.spawn.x, y - floor.spawn.y);
      if (fromSpawn < 1.6) continue;
      spots.push({ x, y });
    }
  }

  rng.shuffle(spots);
  const dummies = [];
  for (const spot of spots) {
    if (dummies.length >= count) break;
    if (dummies.some((dummy) => Math.hypot(dummy.x - spot.x, dummy.y - spot.y) < 1.4)) continue;
    dummies.push(new Enemy('trainingDummy', spot.x, spot.y));
  }
  return dummies;
}
