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

export function experienceForSkippedFloors(floorNumber) {
  const levels = Math.max(0, Math.floor(Number(floorNumber) || 1) - 1);
  let total = 0;
  for (let level = 1; level <= levels; level++) {
    total += experienceToNextLevel(level);
  }
  return total;
}

export function grantStartingFloorExperience(character, floorNumber) {
  const experience = experienceForSkippedFloors(floorNumber);
  if (experience > 0 && character) character.awardExperience(experience);
  return experience;
}
