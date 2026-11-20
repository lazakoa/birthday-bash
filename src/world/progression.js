import { PROGRESSION } from '../config.js';

export function experienceToNextLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(PROGRESSION.baseExperience * Math.pow(PROGRESSION.experienceGrowth, safeLevel - 1));
}

export function levelUpRewards() {
  return {
    statPoints: PROGRESSION.statPointsPerLevel,
    abilityPoints: PROGRESSION.abilityPointsPerLevel,
  };
}
