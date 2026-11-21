import { ELEMENTAL_INFUSION } from '../config.js';
import { Entity } from './entity.js';
import { moveCircle } from './grid.js';

const SUMMON_NAMES = {
  totem: 'Arcane Totem',
  golem: 'Stone Golem',
};

const FOLLOW_DISTANCE = 1.5;

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
    this.infusions = 0;
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

export function infuseSummon(summon, element) {
  if (!summon || summon.kind !== 'summon' || summon.type !== 'totem') return false;
  if (!ELEMENTAL_INFUSION.includes(element)) return false;
  summon.element = element;
  summon.infusions += 1;
  return true;
}

export function nearestHostile(entities, summon, maxDistance = Infinity) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (!entity || !entity.alive || entity === summon) continue;
    if (entity.faction !== 'enemy') continue;
    const distance = Math.hypot(entity.x - summon.x, entity.y - summon.y);
    const reach = maxDistance + (entity.radius ?? 0);
    if (distance > reach) continue;
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

export function updateSummon(
  summon,
  dt,
  { entities = [], grid = null, owner = null, player = null, onDamage = null, onBeam = null } = {},
) {
  if (!summon || summon.kind !== 'summon') return { removed: false, attacked: null };
  if (!summon.alive) return { removed: true, reason: 'dead', attacked: null };

  summon.remaining -= dt;
  summon.attackTimer -= dt;
  if (summon.remaining <= 0) return { removed: true, reason: 'expired', attacked: null };

  const pursuitTarget = summon.speed > 0 ? nearestHostile(entities, summon, summon.aggroRadius) : null;
  if (pursuitTarget) {
    const distance = Math.hypot(pursuitTarget.x - summon.x, pursuitTarget.y - summon.y);
    if (distance > summon.attackRange) moveSummonToward(summon, pursuitTarget, dt, grid);
    summon.facing = pursuitTarget.x >= summon.x ? 1 : -1;
  }

  const attackTarget = nearestHostile(entities, summon, summon.attackRange);
  if (attackTarget) summon.facing = attackTarget.x >= summon.x ? 1 : -1;

  if (!pursuitTarget && !attackTarget && summon.speed > 0) {
    followOwner(summon, dt, grid, { entities, owner, player });
  }

  if (summon.attackTimer <= 0 && attackTarget) {
    summon.attackTimer = summon.attackCooldown;
    onBeam?.(summon, attackTarget, summon.element);
    onDamage?.(attackTarget, summon.damage, { element: summon.element, source: summon });
    return { removed: false, attacked: attackTarget };
  }

  return { removed: false, attacked: null };
}

export function followOwner(summon, dt, grid, { entities = [], owner = null, player = null } = {}) {
  const followTarget = resolveOwner(summon, entities, owner, player);
  if (!followTarget || followTarget === summon) return;
  const distance = Math.hypot(followTarget.x - summon.x, followTarget.y - summon.y);
  if (distance <= FOLLOW_DISTANCE + (followTarget.radius ?? 0)) return;
  moveSummonToward(summon, followTarget, dt, grid);
}

function resolveOwner(summon, entities, owner, player) {
  const candidates = [owner, player].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.id === summon.ownerId) return candidate.alive ? candidate : null;
  }
  const stored = entities.find((entity) => entity && entity.id === summon.ownerId);
  if (stored) return stored.alive ? stored : null;
  return candidates.find((candidate) => candidate.alive) ?? null;
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
