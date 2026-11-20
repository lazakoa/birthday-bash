import { circleHitsWall } from './grid.js';
import { sameSide } from './entity.js';

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length < 1e-9) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

export class ProjectileSystem {
  constructor() {
    this.projectiles = [];
    this.nextId = 1;
  }

  spawn({
    x,
    y,
    target = null,
    direction = null,
    speed = 8,
    radius = 0.12,
    damage = 0,
    faction = 'neutral',
    ownerId = null,
    ttl = 3,
    pierce = false,
    element = null,
    sprite = null,
    onHit = null,
    onExpire = null,
  }) {
    const heading = direction ? normalize(direction.x, direction.y) : null;
    const projectile = {
      id: this.nextId++,
      x,
      y,
      target,
      direction: heading,
      speed,
      radius,
      damage,
      faction,
      ownerId,
      ttl,
      pierce,
      element,
      sprite,
      onHit,
      onExpire,
      alive: true,
      hitIds: new Set(),
    };
    this.projectiles.push(projectile);
    return projectile;
  }

  update(dt, { grid = null, entities = [] } = {}) {
    const events = [];
    for (const projectile of this.projectiles) {
      if (!projectile.alive) continue;

      projectile.ttl -= dt;
      if (projectile.ttl <= 0) {
        projectile.alive = false;
        projectile.onExpire?.(projectile, 'ttl');
        continue;
      }

      let dx;
      let dy;
      if (projectile.target?.alive) {
        dx = projectile.target.x - projectile.x;
        dy = projectile.target.y - projectile.y;
      } else if (projectile.direction) {
        dx = projectile.direction.x;
        dy = projectile.direction.y;
      } else {
        projectile.alive = false;
        continue;
      }

      const distance = Math.hypot(dx, dy);
      if (distance < 1e-9) {
        projectile.alive = false;
        continue;
      }

      const step = Math.min(distance, projectile.speed * dt);
      const nextX = projectile.x + (dx / distance) * step;
      const nextY = projectile.y + (dy / distance) * step;

      if (grid && circleHitsWall(grid, nextX, nextY, projectile.radius)) {
        projectile.alive = false;
        projectile.onExpire?.(projectile, 'wall');
        continue;
      }

      projectile.x = nextX;
      projectile.y = nextY;

      for (const entity of entities) {
        if (!entity.alive) continue;
        if (sameSide(entity.faction, projectile.faction)) continue;
        if (entity.id === projectile.ownerId) continue;
        if (projectile.hitIds.has(entity.id)) continue;
        const reach = projectile.radius + (entity.radius ?? 0);
        if (Math.hypot(entity.x - projectile.x, entity.y - projectile.y) > reach) continue;

        projectile.hitIds.add(entity.id);
        projectile.onHit?.(entity, projectile);
        events.push({ projectile, entity });
        if (!projectile.pierce) {
          projectile.alive = false;
          break;
        }
      }
    }

    this.projectiles = this.projectiles.filter((projectile) => projectile.alive);
    return events;
  }

  clear() {
    this.projectiles.length = 0;
  }
}
