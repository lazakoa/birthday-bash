import { CHARACTER, CLASSES, PLAYER } from '../config.js';
import { Player } from './player.js';
import { createBaseStats, deriveStats } from './stats.js';
import { findAbility, BASIC_ATTACK_ID, passiveBonuses } from './abilities.js';
import { experienceToNextLevel, levelUpRewards } from './progression.js';

const HOTBAR_SLOTS = 10;

export class Character extends Player {
  constructor(classId) {
    super(0.5, 0.5);
    const classDef = CLASSES[classId];
    if (!classDef) throw new Error(`Unknown class: ${classId}`);

    this.classId = classId;
    this.className = classDef.name;
    this.name = classDef.name;
    this.sprite = classDef.sprite;
    this.stats = createBaseStats();
    this.statPoints = CHARACTER.startingStatPoints;
    this.abilityPoints = CHARACTER.startingAbilityPoints;
    this.level = 1;
    this.experience = 0;
    this.levelUps = 0;
    this.unlockedAbilities = [];
    this.hotbar = new Array(HOTBAR_SLOTS).fill(null);
    this.hotbar[0] = BASIC_ATTACK_ID;
    this.selectedAbilityId = null;
    this.buffs = new Map();
    this.shrineBonuses = { health: 0, mana: 0, speed: 0 };
    this.parryChance = 0;
    this.vampiricBlessing = null;
    this.baseSpeed = PLAYER.speedTilesPerSecond;
    this.buffSpeedMultiplier = 1;
    this.attackSpeedMultiplier = 1;
    this.damageFilter = null;
    this.weapon = { ...classDef.weapon };
    this.recalculate({ fill: true });
  }

  get experienceToNextLevel() {
    return experienceToNextLevel(this.level);
  }

  get experienceRatio() {
    const required = this.experienceToNextLevel;
    return required > 0 ? Math.max(0, Math.min(1, this.experience / required)) : 0;
  }

  allocateStat(stat, amount = 1) {
    if (!CHARACTER.statOrder.includes(stat)) return false;
    if (!Number.isInteger(amount) || amount <= 0 || amount > this.statPoints) return false;
    this.stats[stat] += amount;
    this.statPoints -= amount;
    this.recalculate();
    return true;
  }

  getBuffBonuses() {
    const stats = createBaseStats();
    let speedMultiplier = 1;
    let attackSpeedMultiplier = 1;
    let zeroDefense = false;
    for (const buff of this.buffs.values()) {
      for (const [stat, value] of Object.entries(buff.stats ?? {})) {
        stats[stat] = (stats[stat] ?? 0) + value;
      }
      speedMultiplier *= buff.speedMultiplier ?? 1;
      attackSpeedMultiplier *= buff.attackSpeedMultiplier ?? 1;
      if (buff.zeroDefense) zeroDefense = true;
    }
    return { stats, speedMultiplier, attackSpeedMultiplier, zeroDefense };
  }

  recalculate({ fill = false } = {}) {
    const bonuses = this.getBuffBonuses();
    const effectiveStats = {};
    for (const stat of CHARACTER.statOrder) {
      effectiveStats[stat] = (this.stats[stat] ?? 0) + (bonuses.stats[stat] ?? 0);
    }

    const derived = deriveStats(this.classId, effectiveStats, this.weapon);
    const shrineHealth = this.shrineBonuses?.health ?? 0;
    const shrineMana = this.shrineBonuses?.mana ?? 0;
    const shrineSpeed = this.shrineBonuses?.speed ?? 0;
    this.effectiveStats = effectiveStats;
    this.maxHealth = derived.maxHealth;
    this.maxMana = derived.maxMana;
    this.healthRegen = derived.healthRegen * (1 + shrineHealth);
    this.manaRegen = derived.manaRegen * (1 + shrineMana);
    this.meleeDamageBonus = derived.meleeDamageBonus;
    this.spellDamageBonus = derived.spellDamageBonus;
    this.defense = bonuses.zeroDefense ? 0 : derived.defense;
    this.damageReduction = bonuses.zeroDefense ? 0 : derived.damageReduction;
    this.dodgeChance = derived.dodgeChance;
    this.accuracy = derived.accuracy;
    this.spellFumbleChance = derived.spellFumbleChance;
    this.weapon = derived.weapon;

    this.buffSpeedMultiplier = bonuses.speedMultiplier;
    this.attackSpeedMultiplier = bonuses.attackSpeedMultiplier;
    this.speed =
      (this.baseSpeed ?? PLAYER.speedTilesPerSecond) *
      bonuses.speedMultiplier *
      (1 + shrineSpeed) *
      (this.slowMultiplier ?? 1);

    const filters = [];
    for (const buff of this.buffs.values()) {
      if (buff.damageFilter) filters.push(buff.damageFilter);
    }
    this.damageFilter =
      filters.length > 0 ? (amount) => filters.reduce((remaining, filter) => filter(remaining), amount) : null;

    if (fill) {
      this.health = this.maxHealth;
      this.mana = this.maxMana;
    } else {
      this.health = Math.min(this.health, this.maxHealth);
      this.mana = Math.min(this.mana, this.maxMana);
    }
    return derived;
  }

  addBuff(buff) {
    if (!buff?.id) return null;
    this.buffs.set(buff.id, { ...buff });
    this.recalculate();
    return this.buffs.get(buff.id);
  }

  removeBuff(id) {
    const existed = this.buffs.delete(id);
    if (existed) this.recalculate();
    return existed;
  }

  hasBuff(id) {
    return this.buffs.has(id);
  }

  addShrine(type, magnitude) {
    if (!(type in this.shrineBonuses)) return false;
    const amount = Math.max(0, Number(magnitude) || 0);
    if (amount <= 0) return false;
    this.shrineBonuses[type] += amount;
    this.recalculate();
    return true;
  }

  removeShrine(type, magnitude) {
    if (!(type in this.shrineBonuses)) return false;
    const amount = Math.max(0, Number(magnitude) || 0);
    if (amount <= 0 || this.shrineBonuses[type] <= 0) return false;
    this.shrineBonuses[type] = Math.max(0, this.shrineBonuses[type] - amount);
    this.recalculate();
    return true;
  }

  clearShrines() {
    this.shrineBonuses = { health: 0, mana: 0, speed: 0 };
    this.recalculate();
  }

  levelUp() {
    const rewards = levelUpRewards();
    const previousMaxHealth = this.maxHealth;
    const previousMaxMana = this.maxMana;
    const previousHealth = this.health;
    const previousMana = this.mana;

    this.level += 1;
    this.statPoints += rewards.statPoints;
    this.abilityPoints += rewards.abilityPoints;
    this.levelUps += 1;

    this.recalculate();
    this.health = Math.min(this.maxHealth, previousHealth + Math.max(0, this.maxHealth - previousMaxHealth));
    this.mana = Math.min(this.maxMana, previousMana + Math.max(0, this.maxMana - previousMaxMana));
    return this.level;
  }

  awardExperience(amount) {
    if (!this.alive) return this.experience;
    const reward = Math.max(0, Math.floor(Number(amount) || 0));
    if (reward === 0) return this.experience;

    this.experience += reward;
    while (this.experience >= this.experienceToNextLevel) {
      this.experience -= this.experienceToNextLevel;
      this.levelUp();
    }
    return this.experience;
  }

  hasAbility(abilityId) {
    return this.unlockedAbilities.includes(abilityId);
  }

  unlockAbility(abilityId) {
    if (abilityId === BASIC_ATTACK_ID) return false;
    const ability = findAbility(this.classId, abilityId);
    if (!ability || this.hasAbility(abilityId) || this.abilityPoints <= 0) return false;

    this.abilityPoints -= 1;
    this.unlockedAbilities.push(ability.id);

    if (ability.kind === 'passive') {
      Object.assign(this, passiveBonuses(ability));
    } else {
      this.assignAbilityToFirstFreeSlot(ability.id);
    }
    return true;
  }

  assignAbilityToFirstFreeSlot(abilityId) {
    const slot = this.hotbar.indexOf(null);
    if (slot < 0) return -1;
    return this.assignAbility(slot, abilityId) ? slot : -1;
  }

  assignAbility(slot, abilityId) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SLOTS) return false;
    const ability = findAbility(this.classId, abilityId);
    if (!ability || ability.kind !== 'active') return false;
    if (ability.id !== BASIC_ATTACK_ID && !this.hasAbility(ability.id)) return false;

    const existing = this.hotbar.indexOf(ability.id);
    if (existing >= 0) this.hotbar[existing] = null;
    this.hotbar[slot] = ability.id;
    return true;
  }

  unassignSlot(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SLOTS) return false;
    if (this.hotbar[slot] == null) return false;
    this.hotbar[slot] = null;
    return true;
  }

  hotbarAbility(slot) {
    const abilityId = this.hotbar[slot];
    return abilityId ? findAbility(this.classId, abilityId) : null;
  }

  selectAbility(abilityId) {
    if (abilityId === BASIC_ATTACK_ID) {
      this.selectedAbilityId = null;
      return true;
    }
    const ability = findAbility(this.classId, abilityId);
    if (!ability || ability.kind !== 'active' || !this.hasAbility(ability.id)) return false;
    this.selectedAbilityId = ability.id;
    return true;
  }

  selectHotkey(slot) {
    const ability = this.hotbarAbility(slot);
    if (!ability) return false;
    return this.selectAbility(ability.id);
  }

  selectedAbility() {
    if (!this.selectedAbilityId) return null;
    return findAbility(this.classId, this.selectedAbilityId);
  }

  resetSelection() {
    this.selectedAbilityId = null;
  }
}
