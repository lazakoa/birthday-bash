import { COMBAT, FORMULAS } from '../config.js';

export function attackRange(attacker) {
  return attacker?.weapon?.range ?? 1.5;
}

export function inAttackRange(attacker, target, padding = 0) {
  if (!attacker || !target || !attacker.alive || !target.alive) return false;
  const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
  return distance <= attackRange(attacker) + (target.radius ?? 0) + padding;
}

export function hitChance(attacker, target) {
  const accuracy = attacker?.accuracy ?? FORMULAS.baseAccuracy;
  const dodge = target?.dodgeChance ?? 0;
  return Math.min(COMBAT.maxHitChance, Math.max(COMBAT.minHitChance, accuracy - dodge));
}

export function rollMeleeDamage(attacker, rng = null) {
  const weapon = attacker?.weapon;
  if (!weapon) return 0;
  const spread = (weapon.damageMax - weapon.damageMin) * COMBAT.damageVariance;
  const min = weapon.damageMin - spread;
  const max = weapon.damageMax + spread;
  const roll = rng ? rng.range(min, max) : (min + max) / 2;
  return Math.max(COMBAT.minimumDamage, roll + (attacker.meleeDamageBonus ?? 0));
}

export function reduceDamage(amount, target) {
  const reduction = Math.min(FORMULAS.maxDamageReduction, target?.damageReduction ?? 0);
  return Math.max(COMBAT.minimumDamage, amount * (1 - reduction));
}

export function resolveMeleeAttack(attacker, target, rng = null) {
  if (!attacker?.alive || !target?.alive) {
    return { ok: false, reason: 'dead', hit: false, dodged: false, damage: 0, killed: false };
  }
  if (!inAttackRange(attacker, target)) {
    return { ok: false, reason: 'out-of-range', hit: false, dodged: false, damage: 0, killed: false };
  }

  const chance = hitChance(attacker, target);
  if (rng && rng.float() >= chance) {
    return { ok: true, reason: null, hit: false, dodged: true, parried: false, damage: 0, killed: false, chance };
  }

  const parryChance = Math.max(0, target.parryChance ?? 0);
  if (parryChance > 0 && rng && rng.float() < parryChance) {
    return { ok: true, reason: null, hit: false, dodged: false, parried: true, damage: 0, killed: false, chance };
  }

  const rawDamage = rollMeleeDamage(attacker, rng);
  const damage = reduceDamage(rawDamage, target);
  const applied = target.takeDamage(damage);

  return {
    ok: true,
    reason: null,
    hit: true,
    dodged: false,
    parried: false,
    rawDamage,
    damage: applied,
    killed: !target.alive,
    chance,
  };
}

export function rollSpellFumble(caster, rng) {
  const chance = Math.max(0, caster?.spellFumbleChance ?? 0);
  return chance > 0 && rng.float() < chance;
}
