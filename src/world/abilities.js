import { ABILITIES, ABILITY_HOTKEYS, BASIC_ATTACK, COMBAT } from '../config.js';

export const BASIC_ATTACK_ID = BASIC_ATTACK.id;

const ABILITY_BY_ID = new Map();
for (const list of Object.values(ABILITIES)) {
  for (const ability of list) ABILITY_BY_ID.set(ability.id, ability);
}

const HOTKEY_SLOTS = new Map();
for (let slot = 0; slot < ABILITY_HOTKEYS.length; slot++) {
  const label = ABILITY_HOTKEYS[slot];
  HOTKEY_SLOTS.set(`Digit${label}`, slot);
  HOTKEY_SLOTS.set(`Numpad${label}`, slot);
}

export function abilitiesForClass(classId) {
  return ABILITIES[classId] ?? [];
}

export function assignmentAbilities(classId) {
  return [BASIC_ATTACK, ...abilitiesForClass(classId)];
}

export function findAbilityById(abilityId) {
  if (abilityId === BASIC_ATTACK_ID) return BASIC_ATTACK;
  return ABILITY_BY_ID.get(abilityId) ?? null;
}

export function findAbility(classId, abilityId) {
  if (abilityId === BASIC_ATTACK_ID) return BASIC_ATTACK;
  const ability = ABILITY_BY_ID.get(abilityId);
  if (!ability) return null;
  return abilitiesForClass(classId).includes(ability) ? ability : null;
}

export function hotkeySlotForCode(code) {
  return HOTKEY_SLOTS.get(code) ?? null;
}

export function hotkeySlotForKey(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  const slot = ABILITY_HOTKEYS.indexOf(key);
  return slot >= 0 ? slot : null;
}

export function cooldownKey(ability) {
  return `ability:${ability.id}`;
}

export function abilityRange(ability) {
  return ability?.range ?? 0;
}

export function abilityInRange(caster, target, ability) {
  if (!caster || !target || !ability) return false;
  const distance = Math.hypot(target.x - caster.x, target.y - caster.y);
  return distance <= abilityRange(ability) + (target.radius ?? 0);
}

export function abilityDamage(caster, ability, rng = null) {
  if (!ability) return 0;
  const statBonus = ability.damageStat === 'spell' ? caster.spellDamageBonus ?? 0 : caster.meleeDamageBonus ?? 0;
  const base = (ability.flatDamage ?? 0) + statBonus;
  const scaled = base * (ability.damageMultiplier ?? 1);
  const roll = rng ? rng.range(0.92, 1.08) : 1;
  return Math.max(COMBAT.minimumDamage, scaled * roll);
}

export function validateAbilityCast({ caster, ability, target = null, point = null, cooldowns = null } = {}) {
  if (!caster || !ability) return { ok: false, reason: 'unknown' };
  if (!caster.alive) return { ok: false, reason: 'dead' };
  if (ability.kind !== 'active') return { ok: false, reason: 'passive' };
  if (!(caster.unlockedAbilities ?? []).includes(ability.id)) return { ok: false, reason: 'locked' };

  const key = cooldownKey(ability);
  if (cooldowns && !cooldowns.ready(key)) {
    return { ok: false, reason: 'cooldown', remaining: cooldowns.remaining(key) };
  }
  if ((caster.mana ?? 0) < (ability.manaCost ?? 0)) {
    return { ok: false, reason: 'mana', required: ability.manaCost ?? 0, mana: caster.mana ?? 0 };
  }

  if (ability.target === 'enemy') {
    if (!target || !target.alive || target.faction === caster.faction) {
      return { ok: false, reason: 'target' };
    }
    if (!abilityInRange(caster, target, ability)) return { ok: false, reason: 'range' };
  } else if (ability.target === 'point') {
    if (!point) return { ok: false, reason: 'target' };
    const distance = Math.hypot(point.x - caster.x, point.y - caster.y);
    if (distance > abilityRange(ability)) return { ok: false, reason: 'range' };
  }

  return { ok: true };
}

export function passiveBonuses(ability) {
  const passive = ability?.passive ?? {};
  const bonuses = {};
  if (passive.parryChance != null) bonuses.parryChance = passive.parryChance;
  if (passive.bloodDropChance != null) {
    bonuses.vampiricBlessing = {
      chance: passive.bloodDropChance,
      heal: passive.bloodHeal ?? 5,
      ttl: passive.bloodTtl ?? 20,
    };
  }
  return bonuses;
}

export function isStunned(entity) {
  return (entity?.stunRemaining ?? 0) > 0;
}
