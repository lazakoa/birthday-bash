export function entitiesInRadius(entities, x, y, radius, predicate = null) {
  const matches = [];
  for (const entity of entities) {
    if (!entity?.alive) continue;
    if (predicate && !predicate(entity)) continue;
    const reach = radius + (entity.radius ?? 0);
    if (Math.hypot(entity.x - x, entity.y - y) <= reach) matches.push(entity);
  }
  return matches;
}

export function applyDamageInRadius({
  entities,
  x,
  y,
  radius,
  damage,
  faction = null,
  ownerId = null,
  predicate = null,
}) {
  const hits = [];
  const targets = entitiesInRadius(entities, x, y, radius, (entity) => {
    if (ownerId != null && entity.id === ownerId) return false;
    if (faction != null && entity.faction === faction) return false;
    return predicate ? predicate(entity) : true;
  });

  for (const entity of targets) {
    const applied = entity.takeDamage(damage);
    hits.push({ entity, damage: applied, killed: !entity.alive });
  }
  return hits;
}

export class AreaEffectSystem {
  constructor() {
    this.effects = [];
    this.nextId = 1;
  }

  add({
    x,
    y,
    radius,
    duration = 2,
    tickInterval = 0.5,
    onTick = null,
    onExpire = null,
    faction = null,
    ownerId = null,
    data = null,
  }) {
    const effect = {
      id: this.nextId++,
      x,
      y,
      radius,
      faction,
      ownerId,
      data,
      duration,
      remaining: duration,
      tickInterval,
      tickTimer: tickInterval,
      onTick,
      onExpire,
      alive: true,
    };
    this.effects.push(effect);
    return effect;
  }

  update(dt, world = {}) {
    const expired = [];
    for (const effect of this.effects) {
      if (!effect.alive) continue;
      effect.remaining -= dt;
      effect.tickTimer -= dt;
      if (effect.tickTimer <= 0 && effect.tickInterval > 0) {
        effect.tickTimer += effect.tickInterval;
        effect.onTick?.(effect, world);
      }
      if (effect.remaining <= 0) {
        effect.alive = false;
        effect.onExpire?.(effect, world);
        expired.push(effect);
      }
    }
    this.effects = this.effects.filter((effect) => effect.alive);
    return expired;
  }

  clear() {
    this.effects.length = 0;
  }
}
