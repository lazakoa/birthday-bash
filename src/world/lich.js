import { LICH } from '../config.js';
import { abilityDamage, cooldownKey } from './abilities.js';
import { sameSide } from './entity.js';
import { Enemy, ENEMY_STATES } from './enemies.js';
import { moveCircle } from './grid.js';
import { hasLineOfSight } from './pathfinding.js';

const MIN_STEP = 1e-6;
const AGGRO_TOUCH_RANGE = 1.6;
const SUMMON_ABILITY_ID = 'lichSummon';
const FIREBALL_ABILITY_ID = 'lichFireball';
const PUSH_ABILITY_ID = 'lichArcanePush';
const PULL_ABILITY_ID = 'lichArcanePull';
const SLASH_ABILITY_ID = 'lichSlash';

function abilityOf(lich, id) {
  return (lich?.abilities ?? []).find((ability) => ability.id === id) ?? null;
}

function abilityReady(lich, ability) {
  return Boolean(ability) && (lich.cooldowns?.ready(cooldownKey(ability)) ?? true);
}

function startAbilityCooldown(lich, ability) {
  if (!ability) return;
  lich.cooldowns?.start(cooldownKey(ability), ability.cooldown ?? 0);
}

function addEntity(entities, entity, hooks = {}) {
  if (hooks.add) hooks.add(entity);
  else if (Array.isArray(entities)) entities.push(entity);
}

function removeEntity(entities, entity, hooks = {}) {
  if (!entity) return;
  if (hooks.remove) {
    hooks.remove(entity);
    return;
  }
  if (Array.isArray(entities)) {
    const index = entities.indexOf(entity);
    if (index >= 0) entities.splice(index, 1);
  }
}

export function lichMinions(lich, entities = []) {
  if (!lich) return [];
  return entities.filter((entity) => entity && entity.alive && entity.summonedBy === lich.id);
}

export function aliveMinionCount(lich, entities = []) {
  return lichMinions(lich, entities).length;
}

export function canSummon(lich, entities = []) {
  if (!lich?.alive || !lich.aggroed) return false;
  const ability = abilityOf(lich, SUMMON_ABILITY_ID);
  if (!abilityReady(lich, ability)) return false;
  if (!lich.summonedOnce) return true;
  return aliveMinionCount(lich, entities) < LICH.summonRecastThreshold;
}

function separate(spot, entities, spacing) {
  for (const entity of entities) {
    if (!entity || entity === spot) continue;
    if (Math.hypot(entity.x - spot.x, entity.y - spot.y) < spacing) return false;
  }
  return true;
}

function findMinionSpot(lich, { grid = null, entities = [], rng = null, index = 0 } = {}) {
  const attempts = LICH.summonAttempts;
  const count = Math.max(1, LICH.summonCount);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const baseAngle = ((index + attempt * 0.37) / count) * Math.PI * 2;
    const jitter = rng ? rng.range(-0.35, 0.35) : 0;
    const radius = rng
      ? rng.range(LICH.summonRadiusMin, LICH.summonRadiusMax)
      : (LICH.summonRadiusMin + LICH.summonRadiusMax) / 2;
    const angle = baseAngle + jitter;
    const x = lich.x + Math.cos(angle) * radius;
    const y = lich.y + Math.sin(angle) * radius;
    if (grid && !grid.isWalkable(Math.floor(x), Math.floor(y))) continue;
    const spot = { x, y };
    if (!separate(spot, entities, LICH.summonSpacing)) continue;
    return spot;
  }

  for (let radius = 0.8; radius <= 4.5; radius += 0.4) {
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const x = lich.x + Math.cos(angle) * radius;
      const y = lich.y + Math.sin(angle) * radius;
      if (grid && !grid.isWalkable(Math.floor(x), Math.floor(y))) continue;
      const spot = { x, y };
      if (separate(spot, entities, LICH.summonSpacing)) return spot;
    }
  }
  return null;
}

export function clearLichSummons(lich, { entities = [], hooks = {} } = {}) {
  const previous = lichMinions(lich, entities);
  for (const minion of previous) removeEntity(entities, minion, hooks);
  lich.minionIds?.clear();
  return previous;
}

export function summonMinions(
  lich,
  { entities = [], grid = null, rng = null, hooks = {}, count = LICH.summonCount } = {},
) {
  if (!lich?.alive) return [];
  clearLichSummons(lich, { entities, hooks });

  const composition = LICH.summonComposition.length > 0 ? LICH.summonComposition : ['skeleton'];
  const created = [];
  const working = [...entities];

  for (let index = 0; index < count; index++) {
    const typeId = composition[index % composition.length];
    const spot = findMinionSpot(lich, { grid, entities: working, rng, index });
    if (!spot) continue;
    const minion = new Enemy(typeId, spot.x, spot.y, { floor: lich.floorNumber ?? 5 });
    minion.summonedBy = lich.id;
    minion.isLichMinion = true;
    minion.aggroed = true;
    minion.state = ENEMY_STATES.AGGRO;
    minion.stateTimer = 0.2;
    minion.homeX = lich.x;
    minion.homeY = lich.y;
    addEntity(entities, minion, hooks);
    working.push(minion);
    lich.minionIds?.add(minion.id);
    created.push(minion);
  }

  lich.summonedOnce = true;
  lich.lastAbility = SUMMON_ABILITY_ID;
  startAbilityCooldown(lich, abilityOf(lich, SUMMON_ABILITY_ID));
  hooks.summon?.(lich, created);
  return created;
}

function forcedMove(target, ux, uy, distance, grid = null) {
  let remaining = Math.max(0, distance);
  const from = { x: target.x, y: target.y };
  while (remaining > MIN_STEP) {
    const step = Math.min(0.1, remaining);
    if (grid) {
      const next = moveCircle(grid, target.x, target.y, ux * step, uy * step, target.radius ?? 0.3);
      const moved = Math.hypot(next.x - target.x, next.y - target.y);
      if (moved < step * 0.2) break;
      target.x = next.x;
      target.y = next.y;
      remaining -= moved;
    } else {
      target.x += ux * step;
      target.y += uy * step;
      remaining -= step;
    }
  }
  return { from, to: { x: target.x, y: target.y }, moved: Math.hypot(target.x - from.x, target.y - from.y) };
}

export function arcanePush(lich, target, { grid = null } = {}) {
  if (!lich || !target) return { moved: 0 };
  const dx = target.x - lich.x;
  const dy = target.y - lich.y;
  const distance = Math.hypot(dx, dy);
  if (distance < MIN_STEP) return { moved: 0, from: { x: target.x, y: target.y }, to: { x: target.x, y: target.y } };
  lich.facing = dx >= 0 ? 1 : -1;
  return forcedMove(target, dx / distance, dy / distance, LICH.pushDistance, grid);
}

export function arcanePull(lich, target, { grid = null } = {}) {
  if (!lich || !target) return { moved: 0 };
  const dx = target.x - lich.x;
  const dy = target.y - lich.y;
  const distance = Math.hypot(dx, dy);
  if (distance < MIN_STEP) return { moved: 0, from: { x: target.x, y: target.y }, to: { x: target.x, y: target.y } };
  const travel = Math.min(LICH.pullDistance, Math.max(0, distance - LICH.pullStopDistance));
  lich.facing = dx >= 0 ? 1 : -1;
  return forcedMove(target, -dx / distance, -dy / distance, travel, grid);
}

export function slashCandidates(lich, entities = [], { grid = null, facing = null } = {}) {
  if (!lich) return [];
  const direction = facing ?? lich.facing ?? 1;
  const cosHalfAngle = Math.cos(LICH.slashHalfAngle);
  const hits = [];

  for (const entity of entities) {
    if (!entity || entity === lich || !entity.alive) continue;
    if (sameSide(entity.faction, lich.faction)) continue;
    const dx = entity.x - lich.x;
    const dy = entity.y - lich.y;
    const distance = Math.hypot(dx, dy);
    if (distance > LICH.slashRange + (entity.radius ?? 0)) continue;
    if (distance < MIN_STEP) continue;
    const forward = (dx * direction) / distance;
    if (forward < cosHalfAngle) continue;
    if (grid && !hasLineOfSight(grid, lich.x, lich.y, entity.x, entity.y, 0.15)) continue;
    hits.push(entity);
  }

  return hits;
}

export function resolveLichSlash(
  lich,
  { entities = [], grid = null, rng = null, hooks = {}, facing = null } = {},
) {
  const ability = abilityOf(lich, SLASH_ABILITY_ID);
  const direction = facing ?? lich.slashFacing ?? lich.facing ?? 1;
  const damage = abilityDamage(lich, ability, rng);
  const targets = slashCandidates(lich, entities, { grid, facing: direction });
  const hits = [];

  for (const target of targets) {
    const result = hooks.damage
      ? hooks.damage(target, damage, { element: ability?.element ?? 'melee', source: lich, ability })
      : { applied: target.takeDamage(damage), killed: !target.alive };
    hits.push({ target, result, damage });
  }

  hooks.slash?.(lich, direction, LICH.slashRange);
  hooks.log?.('The Lich carves a wide slash.', '#ffb0b0');
  return { hits, damage, facing: direction, targets };
}

function selectTarget(lich, player, entities) {
  if (player?.alive) return player;
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (!entity?.alive || entity === lich) continue;
    if (entity.faction === lich.faction) continue;
    const distance = Math.hypot(entity.x - lich.x, entity.y - lich.y);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

function maintainRange(lich, target, distance, dt, grid) {
  if (distance < MIN_STEP) return;
  let direction = 0;
  if (distance < LICH.retreatRange) direction = -1;
  else if (distance > LICH.preferredRange + LICH.approachPadding) direction = 1;
  if (direction === 0) return;

  const dx = (target.x - lich.x) / distance;
  const dy = (target.y - lich.y) / distance;
  const step = Math.max(0, lich.speed ?? 0) * (lich.moveSpeedMultiplier ?? 1) * dt;
  if (step <= 0) return;
  if (grid) {
    const next = moveCircle(grid, lich.x, lich.y, dx * step * direction, dy * step * direction, lich.radius);
    const moved = Math.hypot(next.x - lich.x, next.y - lich.y);
    lich.x = next.x;
    lich.y = next.y;
    lich.moving = moved > 0.0001;
  } else {
    lich.x += dx * step * direction;
    lich.y += dy * step * direction;
    lich.moving = true;
  }
  if (direction > 0) lich.facing = target.x >= lich.x ? 1 : -1;
}

function castFireball(lich, ability, context, target) {
  const { entities = [], grid = null, rng = null, abilitySystem = null, hooks = {} } = context;
  if (!abilitySystem) return false;
  const result = abilitySystem.cast(lich, ability, {
    target,
    entities,
    grid,
    rng,
    cooldowns: lich.cooldowns,
    hooks,
  });
  if (!result?.ok) return false;
  hooks.log?.('The Lich hurls a fireball.', '#ffb36a');
  return true;
}

function castPush(lich, target, context) {
  const { grid = null, hooks = {} } = context;
  const ability = abilityOf(lich, PUSH_ABILITY_ID);
  const result = arcanePush(lich, target, { grid });
  startAbilityCooldown(lich, ability);
  lich.lastAbility = PUSH_ABILITY_ID;
  hooks.log?.('The Lich thrusts an enemy away with arcane force.', '#c8b6ff');
  hooks.push?.(lich, target, result);
  return result;
}

function castPull(lich, target, context) {
  const { grid = null, hooks = {} } = context;
  const ability = abilityOf(lich, PULL_ABILITY_ID);
  const result = arcanePull(lich, target, { grid });
  startAbilityCooldown(lich, ability);
  lich.lastAbility = PULL_ABILITY_ID;
  hooks.log?.('The Lich drags an enemy closer.', '#c8b6ff');
  hooks.pull?.(lich, target, result);
  return result;
}

export function updateLich(lich, dt, context = {}) {
  if (!lich) return;
  if (!lich.alive) {
    lich.state = ENEMY_STATES.DEAD;
    lich.moving = false;
    return;
  }

  lich.cooldowns?.update(dt);
  lich.regenerate(dt);
  lich.attackTimer = Math.max(0, (lich.attackTimer ?? 0) - dt);
  lich.stateTimer = Math.max(0, (lich.stateTimer ?? 0) - dt);
  lich.moving = false;

  if ((lich.stunRemaining ?? 0) > 0) {
    lich.slashTimer = 0;
    lich.windup = 0;
    return;
  }

  const { player = null, entities = [], grid = null } = context;
  const target = selectTarget(lich, player, entities);
  if (!target) {
    lich.aggroed = false;
    lich.state = ENEMY_STATES.IDLE;
    return;
  }

  const distance = Math.hypot(target.x - lich.x, target.y - lich.y);
  const seesTarget = grid ? hasLineOfSight(grid, lich.x, lich.y, target.x, target.y, 0.2) : true;

  if (!lich.aggroed) {
    if (distance <= lich.aggroRadius && (seesTarget || distance <= AGGRO_TOUCH_RANGE)) {
      lich.aggroed = true;
      lich.state = ENEMY_STATES.AGGRO;
      lich.stateTimer = 0.2;
      context.hooks?.log?.('The Lich awakens. Its summons rise from the floor.', '#c8b6ff');
    } else {
      lich.state = ENEMY_STATES.IDLE;
      return;
    }
  }

  if (!target.alive) return;

  if (lich.slashTimer > 0) {
    lich.slashTimer = Math.max(0, lich.slashTimer - dt);
    lich.windup = lich.slashTimer;
    lich.windupTime = LICH.slashWindup;
    if (lich.slashTimer > 0) return;
    lich.windup = 0;
    resolveLichSlash(lich, {
      entities,
      grid,
      rng: context.rng ?? null,
      hooks: context.hooks ?? {},
      facing: lich.slashFacing,
    });
    startAbilityCooldown(lich, abilityOf(lich, SLASH_ABILITY_ID));
    lich.lastAbility = SLASH_ABILITY_ID;
    lich.state = ENEMY_STATES.PURSUIT;
    return;
  }

  lich.facing = target.x >= lich.x ? 1 : -1;

  if (canSummon(lich, entities)) {
    summonMinions(lich, {
      entities,
      grid,
      rng: context.rng ?? null,
      hooks: context.hooks ?? {},
    });
    lich.state = ENEMY_STATES.ATTACK;
    context.hooks?.log?.('The Lich summons its undead host.', '#c8b6ff');
    return;
  }

  const slashAbility = abilityOf(lich, SLASH_ABILITY_ID);
  if (
    distance <= LICH.slashRange + (target.radius ?? 0) &&
    abilityReady(lich, slashAbility) &&
    seesTarget
  ) {
    lich.slashFacing = lich.facing;
    lich.slashTimer = LICH.slashWindup;
    lich.windup = LICH.slashWindup;
    lich.windupTime = LICH.slashWindup;
    lich.state = ENEMY_STATES.ATTACK;
    context.hooks?.log?.('The Lich raises a blade of shadow.', '#ffb0b0');
    return;
  }

  const pushAbility = abilityOf(lich, PUSH_ABILITY_ID);
  if (
    distance <= LICH.pushRange + (target.radius ?? 0) &&
    abilityReady(lich, pushAbility) &&
    seesTarget
  ) {
    castPush(lich, target, context);
    lich.state = ENEMY_STATES.ATTACK;
    return;
  }

  const pullAbility = abilityOf(lich, PULL_ABILITY_ID);
  if (
    distance > LICH.pullMinRange &&
    distance <= LICH.pullRange + (target.radius ?? 0) &&
    abilityReady(lich, pullAbility) &&
    seesTarget
  ) {
    castPull(lich, target, context);
    lich.state = ENEMY_STATES.ATTACK;
    return;
  }

  const fireballAbility = abilityOf(lich, FIREBALL_ABILITY_ID);
  if (
    distance <= (fireballAbility?.range ?? 0) + (target.radius ?? 0) &&
    abilityReady(lich, fireballAbility) &&
    seesTarget &&
    castFireball(lich, fireballAbility, context, target)
  ) {
    lich.lastAbility = FIREBALL_ABILITY_ID;
    lich.state = ENEMY_STATES.ATTACK;
    return;
  }

  maintainRange(lich, target, distance, dt, grid);
  lich.state = lich.moving ? ENEMY_STATES.PURSUIT : ENEMY_STATES.IDLE;
}
