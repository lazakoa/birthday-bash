import { Entity } from './entity.js';
import { moveCircle } from './grid.js';

const SUMMON_NAMES = {
  totem: 'Arcane Totem',
  golem: 'Stone Golem',
};

export class Summon extends Entity {
  constructor({
    type,
    name,
    sprite,
    x,
    y,
    ownerId,
    maxHealth,
    damage,
    attackRange,
    attackCooldown,
    speed,
    aggroRadius,
    duration,
    element = null,
  }) {
    super({
      name: name ?? SUMMON_NAMES[type] ?? 'Summon',
      kind: 'summon',
      faction: 'ally',
      x,
      y,
      radius: 0.34,
      maxHealth,
      sprite,
    });
    this.type = type;
    this.ownerId = ownerId;
    this.damage = damage;
    this.attackRange = attackRange;
    this.attackCooldown = attackCooldown;
    this.attackTimer = attackCooldown;
    this.speed = speed;
    this.aggroRadius = aggroRadius;
    this.remaining = duration;
    this.maxDuration = duration;
    this.element = element;
    this.moveSpeedMultiplier = 1;
    this.facing = -1;
  }
}

export function createSummon(ability, caster, { x, y, damage }) {
  const def = ability.summon ?? {};
  return new Summon({
    type: def.type,
    sprite: def.sprite,
    x,
    y,
    ownerId: caster.id,
    maxHealth: def.health ?? 40,
    damage: damage ?? def.damage ?? 3,
    attackRange: def.attackRange ?? 1.5,
    attackCooldown: def.attackCooldown ?? 1,
    speed: def.speed ?? 0,
    aggroRadius: def.aggroRadius ?? 0,
    duration: def.duration ?? 10,
    element: def.element ?? null,
  });
}

export function moveSummonToward(summon, target, dt, grid) {
  const speed = (summon.speed ?? 0) * (summon.moveSpeedMultiplier ?? 1);
  if (speed <= 0) return;
  const dx = target.x - summon.x;
  const dy = target.y - summon.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return;
  const step = Math.min(distance, speed * dt);
  const next = moveCircle(grid, summon.x, summon.y, (dx / distance) * step, (dy / distance) * step, summon.radius);
  const moved = Math.hypot(next.x - summon.x, next.y - summon.y);
  if (moved > 0.0001) {
    summon.facing = dx >= 0 ? 1 : -1;
    summon.x = next.x;
    summon.y = next.y;
  }
}
