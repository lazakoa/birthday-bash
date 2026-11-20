import { rollSpellFumble } from './combat.js';
import { abilityDamage, cooldownKey, validateAbilityCast } from './abilities.js';
import { entitiesInRadius } from './area.js';
import { moveCircle } from './grid.js';

const MIN_STEP = 1e-6;

export class AbilitySystem {
  constructor({ projectiles, areas, effects, cooldowns }) {
    this.projectiles = projectiles;
    this.areas = areas;
    this.effects = effects;
    this.cooldowns = cooldowns;
  }

  canCast(caster, ability, { target = null, point = null } = {}) {
    return validateAbilityCast({ caster, ability, target, point, cooldowns: this.cooldowns });
  }

  cast(caster, ability, options = {}) {
    const { target = null, point = null, entities = [], grid = null, rng = null, hooks = {} } = options;
    const check = this.canCast(caster, ability, { target, point });
    if (!check.ok) return check;

    const events = [];
    const damageTarget =
      hooks.damage ?? ((entity, amount) => ({ applied: entity.takeDamage(amount), killed: !entity.alive }));
    const beam = hooks.beam ?? (() => {});
    const key = cooldownKey(ability);
    const manaCost = ability.manaCost ?? 0;
    const cooldown = ability.cooldown ?? 0;

    if (ability.damageStat === 'spell' && rng && rollSpellFumble(caster, rng)) {
      caster.spendMana(manaCost);
      this.cooldowns.start(key, cooldown);
      return { ok: true, fumbled: true, damage: 0, events };
    }

    if (!caster.spendMana(manaCost)) return { ok: false, reason: 'mana' };
    this.cooldowns.start(key, cooldown);

    const damage = abilityDamage(caster, ability, rng);
    if (target && ability.target === 'enemy') caster.facing = target.x >= caster.x ? 1 : -1;

    const enemiesNear = (x, y, radius, extraFilter = null) =>
      entitiesInRadius(entities, x, y, radius, (entity) => {
        if (!entity.alive) return false;
        if (entity.faction === caster.faction) return false;
        if (entity.id === caster.id) return false;
        return extraFilter ? extraFilter(entity) : true;
      });

    switch (ability.category) {
      case 'projectile': {
        const projectile = ability.projectile ?? {};
        const explosionRadius = projectile.explosionRadius ?? 0;
        const splashMultiplier = projectile.splashMultiplier ?? 0.6;
        const slow = ability.status ?? null;

        this.projectiles.spawn({
          x: caster.x,
          y: caster.y,
          target,
          speed: projectile.speed ?? 9,
          radius: projectile.radius ?? 0.12,
          faction: caster.faction,
          ownerId: caster.id,
          ttl: 4,
          element: ability.element,
          sprite: 'spark',
          onHit: (entity) => {
            const result = damageTarget(entity, damage, {
              ability,
              element: ability.element,
              source: caster,
            });
            events.push({ type: 'hit', target: entity, result });

            if (explosionRadius > 0) {
              for (const other of enemiesNear(entity.x, entity.y, explosionRadius, (e) => e.id !== entity.id)) {
                const splash = damageTarget(other, damage * splashMultiplier, {
                  ability,
                  element: ability.element,
                  source: caster,
                  splash: true,
                });
                events.push({ type: 'hit', target: other, result: splash, splash: true });
              }
            }

            if (slow?.slowPercent) {
              this.applySlow(entity, slow.slowPercent, slow.slowDuration ?? 0);
            }
          },
        });
        break;
      }

      case 'chain': {
        const chain = ability.chain ?? {};
        const maxTargets = chain.maxTargets ?? 5;
        const chainRadius = chain.radius ?? 3;
        const visited = new Set();
        let current = target;
        let previous = { x: caster.x, y: caster.y };

        for (let i = 0; i < maxTargets && current; i++) {
          if (!current.alive || visited.has(current.id)) break;
          visited.add(current.id);
          beam(previous, current, ability.element);
          const result = damageTarget(current, damage, {
            ability,
            element: ability.element,
            source: caster,
          });
          events.push({ type: 'hit', target: current, result, chainIndex: i });
          previous = { x: current.x, y: current.y };

          const next = enemiesNear(current.x, current.y, chainRadius, (entity) => !visited.has(entity.id)).sort(
            (a, b) => Math.hypot(a.x - current.x, a.y - current.y) - Math.hypot(b.x - current.x, b.y - current.y),
          )[0];
          current = next && next.alive ? next : null;
        }
        break;
      }

      case 'area': {
        const area = ability.area ?? {};

        if (area.instant) {
          for (const other of enemiesNear(caster.x, caster.y, area.radius ?? 2.5)) {
            const result = damageTarget(other, damage, {
              ability,
              element: ability.element,
              source: caster,
            });
            events.push({ type: 'hit', target: other, result });
            if ((area.knockback ?? 0) > 0) {
              this.knockback(other, caster.x, caster.y, area.knockback, grid);
            }
          }
          break;
        }

        const tickInterval = area.tickInterval ?? 0.4;
        const tickDamage =
          (area.damagePerTick ?? 2) + (caster.spellDamageBonus ?? 0) * (area.bonusScaling ?? 0);
        this.areas.add({
          x: point.x,
          y: point.y,
          radius: area.radius ?? 2.5,
          duration: area.duration ?? 2,
          tickInterval,
          faction: caster.faction,
          ownerId: caster.id,
          data: { ability },
          onTick: (effect) => {
            for (const other of enemiesNear(effect.x, effect.y, effect.radius)) {
              if ((area.pullSpeed ?? 0) > 0) {
                this.pull(other, effect.x, effect.y, area.pullSpeed * tickInterval, grid);
              }
              const result = damageTarget(other, tickDamage, {
                ability,
                element: ability.element,
                source: caster,
                areaTick: true,
              });
              events.push({ type: 'hit', target: other, result, areaTick: true });
            }
          },
        });
        events.push({ type: 'area', x: point.x, y: point.y, radius: area.radius ?? 2.5 });
        break;
      }

      case 'buff': {
        const buff = ability.buff ?? {};
        this.effects.remove(caster, ability.id);
        caster.removeBuff?.(ability.id);

        const entry = {
          id: ability.id,
          name: ability.name,
          stats: { ...(buff.stats ?? {}) },
          speedMultiplier: buff.speedMultiplier,
          attackSpeedMultiplier: buff.attackSpeedMultiplier,
          zeroDefense: buff.zeroDefense,
        };
        if (buff.absorbMana) {
          entry.damageFilter = (amount) => {
            if (!caster.alive) return amount;
            const absorbed = Math.min(caster.mana, amount);
            caster.mana -= absorbed;
            return amount - absorbed;
          };
        }

        caster.addBuff?.(entry);
        this.effects.add({
          target: caster,
          name: ability.id,
          duration: buff.duration ?? 5,
          onExpire: () => caster.removeBuff?.(ability.id),
        });
        events.push({ type: 'buff', target: caster, id: ability.id });
        break;
      }

      case 'summon': {
        const summon = hooks.summon ? hooks.summon(ability, caster, point) : null;
        events.push({ type: 'summon', summon, point });
        break;
      }

      case 'dash': {
        const dash = ability.dash ?? {};
        const stopDistance = dash.stopDistance ?? 1.2;
        const stepLength = Math.max(0.02, dash.step ?? 0.12);
        const distance = Math.hypot(target.x - caster.x, target.y - caster.y);
        let travel = Math.min(Math.max(0, distance - stopDistance), ability.range);

        caster.clearPath?.();
        while (travel > MIN_STEP) {
          const dx = target.x - caster.x;
          const dy = target.y - caster.y;
          const length = Math.hypot(dx, dy);
          if (length < MIN_STEP) break;
          const step = Math.min(stepLength, travel);
          const moveX = (dx / length) * step;
          const moveY = (dy / length) * step;
          if (grid) {
            const next = moveCircle(grid, caster.x, caster.y, moveX, moveY, caster.radius ?? 0.3);
            const moved = Math.hypot(next.x - caster.x, next.y - caster.y);
            caster.x = next.x;
            caster.y = next.y;
            if (moved < step * 0.2) break;
            travel -= moved;
          } else {
            caster.x += moveX;
            caster.y += moveY;
            travel -= step;
          }
        }

        const reach = stopDistance + (target.radius ?? 0) + 0.5;
        if (target.alive && Math.hypot(target.x - caster.x, target.y - caster.y) <= reach) {
          const result = damageTarget(target, damage, {
            ability,
            element: ability.element,
            source: caster,
          });
          events.push({ type: 'hit', target, result });
          if (ability.stun) this.applyStun(target, ability.stun.min ?? 0, ability.stun.max ?? 0, rng);
        }
        events.push({ type: 'dash', x: caster.x, y: caster.y });
        break;
      }

      case 'singleTarget': {
        const result = damageTarget(target, damage, {
          ability,
          element: ability.element,
          source: caster,
        });
        events.push({ type: 'hit', target, result });
        if (ability.stun) this.applyStun(target, ability.stun.min ?? 2, ability.stun.max ?? 4, rng);
        break;
      }

      default:
        break;
    }

    return { ok: true, fumbled: false, damage, events };
  }

  applyStun(target, minDuration, maxDuration, rng = null) {
    const lower = Math.max(0, Number(minDuration) || 0);
    const upper = Math.max(lower, Number(maxDuration) || lower);
    const duration = rng ? Math.min(upper, Math.max(lower, rng.range(lower, upper))) : lower;
    if (duration <= 0) return 0;
    target.stunRemaining = Math.max(target.stunRemaining ?? 0, duration);
    this.effects.add({
      target,
      name: 'stun',
      duration,
      magnitude: duration,
      onExpire: () => {
        const active = this.effects.activeFor(target, 'stun');
        target.stunRemaining = active.length > 0 ? Math.max(...active.map((effect) => effect.remaining)) : 0;
      },
    });
    return duration;
  }

  applySlow(target, percent, duration) {
    const slowed = Math.max(0, Math.min(1, Number(percent) || 0));
    const seconds = Math.max(0, Number(duration) || 0);
    if (slowed === 0 || seconds === 0) return null;
    target.moveSpeedMultiplier = Math.min(target.moveSpeedMultiplier ?? 1, 1 - slowed);
    return this.effects.add({
      target,
      name: 'slow',
      duration: seconds,
      magnitude: slowed,
      onExpire: () => {
        const active = this.effects.activeFor(target, 'slow');
        target.moveSpeedMultiplier = active.length > 0 ? 1 - Math.max(...active.map((effect) => effect.magnitude)) : 1;
      },
    });
  }

  knockback(target, fromX, fromY, distance, grid = null) {
    this.moveBySteps(target, target.x - fromX, target.y - fromY, distance, grid);
  }

  pull(target, x, y, distance, grid = null) {
    this.moveBySteps(target, x - target.x, y - target.y, distance, grid);
  }

  moveBySteps(target, dx, dy, distance, grid = null) {
    const length = Math.hypot(dx, dy);
    if (length < MIN_STEP) return;
    const ux = dx / length;
    const uy = dy / length;
    let remaining = Math.max(0, distance);

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
  }
}
