import { CHARACTER, CLASSES, FORMULAS } from '../config.js';

export function createBaseStats() {
  const stats = {};
  for (const key of CHARACTER.statOrder) stats[key] = 0;
  return stats;
}

export function damageReductionFromDefense(defense) {
  if (defense <= 0) return 0;
  return Math.min(FORMULAS.maxDamageReduction, defense / (defense + FORMULAS.defenseReductionScale));
}

export function deriveStats(classId, stats, weaponOverride = null) {
  const classDef = CLASSES[classId];
  if (!classDef) throw new Error(`Unknown class: ${classId}`);

  const strength = Math.max(0, stats.strength ?? 0);
  const intelligence = Math.max(0, stats.intelligence ?? 0);
  const vitality = Math.max(0, stats.vitality ?? 0);
  const dexterity = Math.max(0, stats.dexterity ?? 0);
  const weapon = weaponOverride ?? classDef.weapon;

  const defense = Math.floor(dexterity * FORMULAS.defensePerDexterity);

  return {
    maxHealth: Math.round(CHARACTER.baseHealth + vitality * FORMULAS.healthPerVitality),
    maxMana: Math.round(CHARACTER.baseMana + intelligence * FORMULAS.manaPerIntelligence),
    healthRegen: FORMULAS.healthRegenBase + vitality * FORMULAS.healthRegenPerVitality,
    manaRegen: FORMULAS.manaRegenBase + intelligence * FORMULAS.manaRegenPerIntelligence,
    meleeDamageBonus: strength * FORMULAS.meleeDamagePerStrength,
    spellDamageBonus: intelligence * FORMULAS.spellDamagePerIntelligence,
    defense,
    damageReduction: damageReductionFromDefense(defense),
    dodgeChance: Math.min(FORMULAS.maxDodge, dexterity * FORMULAS.dodgePerDexterity),
    accuracy: Math.min(FORMULAS.maxAccuracy, FORMULAS.baseAccuracy + dexterity * FORMULAS.accuracyPerDexterity),
    spellFumbleChance: Math.max(0, FORMULAS.baseSpellFumble - dexterity * FORMULAS.spellFumblePerDexterity),
    weapon,
  };
}
