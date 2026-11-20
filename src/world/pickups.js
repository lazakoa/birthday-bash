import { Entity } from './entity.js';

export function rollBloodDrop(blessing, rng = null) {
  if (!blessing || !rng) return null;
  if (!rng.chance(blessing.chance)) return null;
  return { heal: blessing.heal ?? 5, ttl: blessing.ttl ?? 20 };
}

export class Pickup extends Entity {
  constructor({ x, y, kind = 'blood', name = 'Crystallized Blood', sprite = 'blood', heal = 5, ttl = 20 }) {
    super({
      name,
      kind: 'pickup',
      faction: 'pickup',
      x,
      y,
      radius: 0.18,
      maxHealth: 1,
      sprite,
    });
    this.pickupType = kind;
    this.healAmount = heal;
    this.ttl = ttl;
    this.maxTtl = ttl;
  }
}

export class PickupSystem {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  spawn(config) {
    const pickup = new Pickup(config);
    this.items.push(pickup);
    return pickup;
  }

  update(dt, { player = null, onCollect = null, collectRadius = 0.7 } = {}) {
    const remaining = [];
    for (const pickup of this.items) {
      pickup.ttl -= dt;
      if (pickup.ttl <= 0) continue;
      if (player?.alive) {
        const reach = collectRadius + (player.radius ?? 0);
        if (Math.hypot(pickup.x - player.x, pickup.y - player.y) <= reach) {
          onCollect?.(pickup);
          continue;
        }
      }
      remaining.push(pickup);
    }
    this.items = remaining;
  }

  clear() {
    this.items.length = 0;
  }
}
