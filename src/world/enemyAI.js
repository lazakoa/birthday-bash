import { cooldownKey } from './abilities.js';
import { hitChance, reduceDamage, rollMeleeDamage } from './combat.js';
import { moveCircle } from './grid.js';
import { ENEMY_STATES } from './enemies.js';
import { findPath, hasLineOfSight } from './pathfinding.js';

const ARRIVE_EPSILON = 0.12;
const SIGHT_RADIUS = 0.2;
const AGGRO_TOUCH_RANGE = 1.4;

export function updateEnemy(enemy, dt, context) {
  if (!enemy) return;
  if (!enemy.alive) {
    enemy.state = ENEMY_STATES.DEAD;
    enemy.moving = false;
    return;
  }

  enemy.cooldowns?.update(dt);
  enemy.regenerate(dt);
  enemy.attackTimer = Math.max(0, (enemy.attackTimer ?? 0) - dt);
  enemy.stateTimer = Math.max(0, (enemy.stateTimer ?? 0) - dt);
  enemy.pathTimer = Math.max(0, (enemy.pathTimer ?? 0) - dt);
  enemy.moving = false;

  if (enemy.stationary || enemy.speed <= 0) {
    enemy.state = ENEMY_STATES.IDLE;
    return;
  }

  if ((enemy.stunRemaining ?? 0) > 0) {
    enemy.path.length = 0;
    return;
  }

  const { player, grid } = context;
  if (!player || !player.alive || !grid) return;

  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  const seesPlayer = hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y, SIGHT_RADIUS);

  if (!enemy.aggroed) {
    if (distance <= enemy.aggroRadius && (seesPlayer || distance <= AGGRO_TOUCH_RANGE)) {
      enterAggro(enemy);
    }
  } else if (
    distance > enemy.deaggroRadius ||
    Math.hypot(enemy.x - enemy.homeX, enemy.y - enemy.homeY) > enemy.leashRadius
  ) {
    releaseAggro(enemy);
  }

  if (enemy.aggroed) {
    updateCombat(enemy, dt, context, distance, seesPlayer);
  } else {
    updateIdle(enemy, dt, context);
  }
}

function enterAggro(enemy) {
  enemy.aggroed = true;
  enemy.state = ENEMY_STATES.AGGRO;
  enemy.stateTimer = 0.2;
  enemy.idleTimer = 0;
  enemy.path.length = 0;
  enemy.pathTimer = 0;
}

function releaseAggro(enemy) {
  enemy.aggroed = false;
  enemy.state = ENEMY_STATES.IDLE;
  enemy.idleTimer = 1;
  enemy.path.length = 0;
  enemy.pendingAbility = null;
  enemy.windup = 0;
}

function updateCombat(enemy, dt, context, distance, seesPlayer) {
  if (enemy.state === ENEMY_STATES.AGGRO) {
    if (enemy.stateTimer <= 0) enemy.state = ENEMY_STATES.PURSUIT;
    return;
  }

  if (enemy.state === ENEMY_STATES.ATTACK) {
    enemy.windup -= dt;
    if (enemy.windup > 0) return;
    enemy.windup = 0;
    resolveAttack(enemy, context, distance, seesPlayer);
    enemy.attackTimer = enemy.attackCooldown;
    enemy.state = ENEMY_STATES.PURSUIT;
    return;
  }

  if (enemy.attackTimer <= 0) {
    const plan = planAttack(enemy, context, distance, seesPlayer);
    if (plan) {
      enemy.state = ENEMY_STATES.ATTACK;
      enemy.windup = enemy.windupTime;
      enemy.pendingAbility = plan.ability ?? null;
      enemy.path.length = 0;
      return;
    }
  }

  enemy.state = ENEMY_STATES.PURSUIT;

  if (enemy.behavior === 'ranged' && seesPlayer && distance <= enemy.attackRange + (context.player.radius ?? 0)) {
    enemy.facing = context.player.x >= enemy.x ? 1 : -1;
    return;
  }

  chase(enemy, dt, context, distance);
}

function planAttack(enemy, context, distance, seesPlayer) {
  const { player } = context;
  if (!seesPlayer) return null;

  if (enemy.behavior === 'ranged') {
    const shield = enemy.abilities.find(
      (ability) =>
        ability.category === 'buff' &&
        ability.target === 'self' &&
        !enemy.hasBuff(ability.id) &&
        enemy.cooldowns.ready(cooldownKey(ability)) &&
        (enemy.mana ?? 0) >= (ability.manaCost ?? 0),
    );
    if (shield) return { ability: shield };

    const offensive = enemy.abilities.find(
      (ability) =>
        ability.target === 'enemy' &&
        ability.category !== 'buff' &&
        enemy.cooldowns.ready(cooldownKey(ability)) &&
        (enemy.mana ?? 0) >= (ability.manaCost ?? 0) &&
        distance <= (ability.range ?? 0) + (player.radius ?? 0),
    );
    if (offensive) return { ability: offensive };
  }

  const meleeReach = (enemy.weapon?.range ?? enemy.attackRange) + (player.radius ?? 0);
  if (distance <= meleeReach) return { melee: true };
  return null;
}

function resolveAttack(enemy, context, distance, seesPlayer) {
  const { player } = context;
  if (!player?.alive) return;

  if (enemy.pendingAbility) {
    const ability = enemy.pendingAbility;
    enemy.pendingAbility = null;
    const target = ability.target === 'enemy' ? player : null;
    if (target && !seesPlayer) return;
    if (target && distance > (ability.range ?? 0) + (player.radius ?? 0)) return;
    context.abilitySystem?.cast(enemy, ability, {
      target,
      entities: context.entities,
      grid: context.grid,
      rng: context.rng,
      cooldowns: enemy.cooldowns,
      hooks: context.hooks ?? {},
    });
    return;
  }

  const meleeReach = (enemy.weapon?.range ?? enemy.attackRange) + (player.radius ?? 0);
  if (!seesPlayer || distance > meleeReach) return;

  const result = enemyMeleeStrike(enemy, player, context.rng);
  context.onMeleeHit?.(enemy, player, result);
}

export function enemyMeleeStrike(enemy, target, rng = null) {
  if (!enemy?.alive || !target?.alive) return { ok: false, hit: false, damage: 0 };
  const chance = hitChance(enemy, target);
  if (rng && rng.float() >= chance) {
    return { ok: true, hit: false, dodged: true, parried: false, damage: 0 };
  }

  const parryChance = Math.max(0, target.parryChance ?? 0);
  if (parryChance > 0 && rng && rng.float() < parryChance) {
    return { ok: true, hit: false, dodged: false, parried: true, damage: 0 };
  }

  const rawDamage = rollMeleeDamage(enemy, rng);
  const damage = reduceDamage(rawDamage, target);
  const applied = target.takeDamage(damage);
  return { ok: true, hit: true, dodged: false, parried: false, rawDamage, damage: applied, killed: !target.alive };
}

function chase(enemy, dt, context, distance) {
  const { player, grid } = context;
  if (distance > 0.05) enemy.facing = player.x >= enemy.x ? 1 : -1;

  if (enemy.pathTimer <= 0) {
    enemy.pathTimer = enemy.repathInterval;
    const path = findPath(grid, enemy.x, enemy.y, player.x, player.y);
    if (path) enemy.path = path;
  }

  advanceAlongPath(enemy, dt, grid);

  if (enemy.path.length === 0 && hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y, SIGHT_RADIUS)) {
    const meleeReach = (enemy.weapon?.range ?? enemy.attackRange) + (player.radius ?? 0);
    if (distance > meleeReach) directStep(enemy, player, dt, grid);
  }
}

function updateIdle(enemy, dt, context) {
  if (enemy.state === ENEMY_STATES.WANDER) {
    advanceAlongPath(enemy, dt, context.grid);
    if (enemy.path.length === 0) {
      enemy.state = ENEMY_STATES.IDLE;
      enemy.idleTimer = randomIdle(enemy, context.rng);
    }
    return;
  }

  if (enemy.state !== ENEMY_STATES.IDLE) enemy.state = ENEMY_STATES.IDLE;
  enemy.idleTimer -= dt;
  if (enemy.idleTimer > 0) return;

  const point = pickWanderPoint(enemy, context);
  if (!point) {
    enemy.idleTimer = 1;
    return;
  }

  const path = findPath(context.grid, enemy.x, enemy.y, point.x, point.y);
  if (!path || path.length === 0) {
    enemy.idleTimer = 1;
    return;
  }
  enemy.path = path;
  enemy.state = ENEMY_STATES.WANDER;
}

function randomIdle(enemy, rng) {
  const scale = enemy.type?.roam ? 1 : enemy.type?.erratic ? 0.8 : 2.2;
  if (!rng) return scale;
  return rng.range(0.4, scale + 0.8);
}

function pickWanderPoint(enemy, context) {
  const { grid, rng } = context;
  const origin = enemy.type?.roam ? { x: enemy.x, y: enemy.y } : { x: enemy.homeX, y: enemy.homeY };
  const radius = enemy.wanderRadius;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = rng ? rng.range(0, Math.PI * 2) : (attempt / 8) * Math.PI * 2;
    const distance = rng ? rng.range(1, radius) : radius;
    const x = origin.x + Math.cos(angle) * distance;
    const y = origin.y + Math.sin(angle) * distance;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!grid.inBounds(tx, ty) || !grid.isWalkable(tx, ty)) continue;
    if (Math.hypot(tx + 0.5 - enemy.x, ty + 0.5 - enemy.y) < 0.8) continue;
    return { x: tx + 0.5, y: ty + 0.5 };
  }
  return null;
}

function advanceAlongPath(enemy, dt, grid) {
  if (enemy.path.length === 0) return false;
  const waypoint = enemy.path[0];
  const dx = waypoint.x - enemy.x;
  const dy = waypoint.y - enemy.y;
  const distance = Math.hypot(dx, dy);

  if (distance < ARRIVE_EPSILON) {
    enemy.path.shift();
    return enemy.path.length > 0;
  }

  const speed = enemy.speed * (enemy.moveSpeedMultiplier ?? 1);
  const step = Math.min(distance, speed * dt);
  const next = moveCircle(grid, enemy.x, enemy.y, (dx / distance) * step, (dy / distance) * step, enemy.radius);
  const moved = Math.hypot(next.x - enemy.x, next.y - enemy.y);
  if (dx !== 0) enemy.facing = dx > 0 ? 1 : -1;
  enemy.x = next.x;
  enemy.y = next.y;
  enemy.moving = moved > 0.0001;
  if (moved < step * 0.05) {
    enemy.path.length = 0;
  }
  return enemy.path.length > 0;
}

function directStep(enemy, target, dt, grid) {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) return;
  const speed = enemy.speed * (enemy.moveSpeedMultiplier ?? 1);
  const step = Math.min(distance, speed * dt);
  const next = moveCircle(grid, enemy.x, enemy.y, (dx / distance) * step, (dy / distance) * step, enemy.radius);
  const moved = Math.hypot(next.x - enemy.x, next.y - enemy.y);
  enemy.x = next.x;
  enemy.y = next.y;
  enemy.moving = moved > 0.0001;
}
