import { ENEMY_ABILITIES, ENEMY_TYPES, POPULATION } from '../config.js';
import { Entity } from './entity.js';
import { Cooldowns } from './effects.js';
import { Rng } from './rng.js';

export { ENEMY_TYPES };

export const ENEMY_STATES = {
  IDLE: 'idle',
  WANDER: 'wander',
  AGGRO: 'aggro',
  PURSUIT: 'pursuit',
  ATTACK: 'attack',
  DEAD: 'dead',
};

const REPATH_INTERVAL = 0.55;

export class Enemy extends Entity {
  constructor(typeId, x, y, { floor = 1 } = {}) {
    const type = ENEMY_TYPES[typeId];
    if (!type) throw new Error(`Unknown enemy type: ${typeId}`);

    const scaling = type.scales === false ? null : POPULATION.scaling;
    const level = Math.max(1, Math.floor(floor));
    const healthScale = scaling ? 1 + (level - 1) * scaling.health : 1;
    const damageScale = scaling ? 1 + (level - 1) * scaling.damage : 1;
    const experienceScale = scaling ? 1 + (level - 1) * scaling.experience : 1;

    super({
      name: type.name,
      kind: 'enemy',
      faction: 'enemy',
      x,
      y,
      radius: type.radius,
      maxHealth: Math.round(type.maxHealth * healthScale),
      maxMana: type.maxMana ?? 0,
      sprite: type.sprite,
    });

    this.typeId = typeId;
    this.type = type;
    this.isBoss = type.boss === true;
    this.experience = Math.round((type.experience ?? 0) * experienceScale);
    this.speed = type.speed ?? 0;
    this.stationary = type.stationary ?? false;
    this.behavior = type.behavior ?? 'melee';
    this.attackRange = type.attackRange ?? 1.5;
    this.attackCooldown = type.attackCooldown ?? 1;
    this.aggroRadius = type.aggroRadius ?? 6;
    this.deaggroRadius = type.deaggroRadius ?? this.aggroRadius * 1.6;
    this.leashRadius = type.leashRadius ?? 20;
    this.wanderRadius = type.wanderRadius ?? 3;
    this.windupTime = type.windup ?? 0.3;
    this.accuracy = type.accuracy ?? 0.8;
    this.dodgeChance = type.dodgeChance ?? 0;
    this.damageReduction = type.damageReduction ?? 0;
    this.spellFumbleChance = 0;
    this.spellDamageBonus = type.spellDamageBonus ?? 0;
    this.meleeDamageBonus = type.meleeDamageBonus ?? 0;
    this.healthRegen = type.healthRegen ?? 0;
    this.manaRegen = type.manaRegen ?? 0;

    this.weapon = {
      name: `${type.name} attack`,
      damageMin: Math.max(1, (type.damageMin ?? 2) * damageScale),
      damageMax: Math.max(1, (type.damageMax ?? 3) * damageScale),
      cooldown: this.attackCooldown,
      range: type.meleeRange ?? this.attackRange,
    };

    this.abilities = (type.abilities ?? [])
      .map((abilityId) => ENEMY_ABILITIES[abilityId])
      .filter(Boolean);
    this.unlockedAbilities = this.abilities.map((ability) => ability.id);
    this.cooldowns = new Cooldowns();

    this.homeX = x;
    this.homeY = y;
    this.state = ENEMY_STATES.IDLE;
    this.stateTimer = 0;
    this.idleTimer = 0.4;
    this.attackTimer = 0;
    this.windup = 0;
    this.pendingAbility = null;
    this.aggroed = false;
    this.targetId = null;
    this.path = [];
    this.pathTimer = 0;
    this.repathInterval = REPATH_INTERVAL;
    this.moving = false;
    this.facing = -1;
    this.moveSpeedMultiplier = 1;
    this.attackSpeedMultiplier = 1;
    this.buffs = new Map();
    this.damageFilter = null;
  }

  get hasAbilities() {
    return this.abilities.length > 0;
  }

  takeDamage(amount) {
    const applied = super.takeDamage(amount);
    if (applied > 0 && this.alive) this.alert();
    if (!this.alive) {
      this.state = ENEMY_STATES.DEAD;
      this.path.length = 0;
      this.moving = false;
      this.windup = 0;
    }
    return applied;
  }

  alert() {
    if (this.stationary || this.speed <= 0) return;
    this.aggroed = true;
    if (this.state === ENEMY_STATES.IDLE || this.state === ENEMY_STATES.WANDER) {
      this.state = ENEMY_STATES.AGGRO;
      this.stateTimer = 0.2;
    }
    this.path.length = 0;
    this.pathTimer = 0;
  }

  addBuff(buff) {
    if (!buff?.id) return null;
    this.buffs.set(buff.id, { ...buff });
    this.refreshBuffs();
    return this.buffs.get(buff.id);
  }

  removeBuff(id) {
    const existed = this.buffs.delete(id);
    if (existed) this.refreshBuffs();
    return existed;
  }

  hasBuff(id) {
    return this.buffs.has(id);
  }

  refreshBuffs() {
    const filters = [];
    let speedMultiplier = 1;
    let attackSpeedMultiplier = 1;
    for (const buff of this.buffs.values()) {
      if (buff.damageFilter) filters.push(buff.damageFilter);
      speedMultiplier *= buff.speedMultiplier ?? 1;
      attackSpeedMultiplier *= buff.attackSpeedMultiplier ?? 1;
    }
    this.damageFilter =
      filters.length > 0 ? (amount) => filters.reduce((remaining, filter) => filter(remaining), amount) : null;
    this.moveSpeedMultiplier = speedMultiplier * (this.slowMultiplier ?? 1);
    this.attackSpeedMultiplier = attackSpeedMultiplier;
  }
}

export class Lich extends Enemy {
  constructor(x, y, { floor = 5 } = {}) {
    super('lich', x, y, { floor });
    this.isLich = true;
    this.isBoss = true;
    this.floorNumber = Math.max(1, Math.floor(floor));
    this.minionIds = new Set();
    this.summonedOnce = false;
    this.slashTimer = 0;
    this.slashFacing = 1;
    this.lastAbility = null;
    this.facing = 1;
  }

  get livingMinionIds() {
    return [...this.minionIds];
  }
}

function weightedType(rng, floorNumber) {
  const options = POPULATION.table.filter((entry) => (entry.minFloor ?? 1) <= floorNumber);
  if (options.length === 0) return POPULATION.table[0]?.id ?? 'skeleton';
  const total = options.reduce((sum, entry) => sum + Math.max(0, entry.weight ?? 0), 0);
  if (total <= 0) return options[0].id;
  let roll = rng.float() * total;
  for (const entry of options) {
    roll -= Math.max(0, entry.weight ?? 0);
    if (roll <= 0) return entry.id;
  }
  return options[options.length - 1].id;
}

function spotIsFree(floor, x, y, occupied) {
  if (!floor.grid.isWalkable(Math.floor(x), Math.floor(y))) return false;
  if (Math.hypot(x - floor.spawn.x, y - floor.spawn.y) < POPULATION.spawnClearance) return false;
  if (Math.hypot(x - floor.stairs.x, y - floor.stairs.y) < POPULATION.stairsClearance) return false;
  return !occupied.some((other) => Math.hypot(other.x - x, other.y - y) < POPULATION.minSpacing);
}

function pickSpot(floor, room, rng, occupied) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const tx = rng.int(room.x, room.x + room.w - 1);
    const ty = rng.int(room.y, room.y + room.h - 1);
    const x = tx + 0.5;
    const y = ty + 0.5;
    if (spotIsFree(floor, x, y, occupied)) return { x, y };
  }

  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      const x = tx + 0.5;
      const y = ty + 0.5;
      if (spotIsFree(floor, x, y, occupied)) return { x, y };
    }
  }
  return null;
}

export function spawnFloorEnemies(floor, floorNumber = 1) {
  if (floor.isBoss) return [];
  const level = Math.max(1, Math.floor(floorNumber));
  const rng = new Rng((floor.seed ^ 0x3c6ef372 ^ Math.imul(level, 0x9e3779b9)) >>> 0);
  const rooms = floor.rooms.filter((room) => room !== floor.spawnRoom);
  if (rooms.length === 0) return [];

  rng.shuffle(rooms);
  const occupied = [];
  const enemies = [];

  const spawnOne = (typeId, room) => {
    const spot = pickSpot(floor, room, rng, occupied);
    if (!spot) return false;
    const enemy = new Enemy(typeId, spot.x, spot.y, { floor: level });
    occupied.push(enemy);
    enemies.push(enemy);
    return true;
  };

  let roomIndex = 0;
  for (const typeId of POPULATION.guaranteed) {
    if (!ENEMY_TYPES[typeId]) continue;
    const room = rooms[roomIndex % rooms.length];
    if (spawnOne(typeId, room)) roomIndex += 1;
  }

  for (const room of rooms) {
    if (!rng.chance(POPULATION.roomChance)) continue;
    const count = rng.int(POPULATION.minPerRoom, POPULATION.maxPerRoom);
    for (let i = 0; i < count; i++) {
      spawnOne(weightedType(rng, level), room);
    }
  }

  return enemies;
}

export function spawnBossPlaceholder(floor) {
  const spot =
    floor.bossSpawn ??
    (floor.rooms?.[0]
      ? { x: floor.rooms[0].cx + 0.5, y: floor.rooms[0].cy + 0.5 }
      : { x: floor.spawn.x, y: floor.spawn.y - 2 });
  return new Enemy('bossPlaceholder', spot.x, spot.y, {
    floor: floor.floorNumber ?? 1,
  });
}

export function spawnLich(floor) {
  const spot =
    floor?.bossSpawn ??
    (floor?.rooms?.[0]
      ? { x: floor.rooms[0].cx + 0.5, y: floor.rooms[0].cy + 0.5 }
      : { x: 0.5, y: 0.5 });
  return new Lich(spot.x, spot.y, { floor: floor?.floorNumber ?? 5 });
}

export function spawnTrainingDummies(floor, count = 3) {
  const room = floor.spawnRoom;
  const rng = new Rng((floor.seed ^ 0x2f6e2b1d) >>> 0);
  const spots = [];

  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (!floor.grid.isWalkable(tx, ty)) continue;
      const x = tx + 0.5;
      const y = ty + 0.5;
      const fromSpawn = Math.hypot(x - floor.spawn.x, y - floor.spawn.y);
      if (fromSpawn < 1.6) continue;
      spots.push({ x, y });
    }
  }

  rng.shuffle(spots);
  const dummies = [];
  for (const spot of spots) {
    if (dummies.length >= count) break;
    if (dummies.some((dummy) => Math.hypot(dummy.x - spot.x, dummy.y - spot.y) < 1.4)) continue;
    dummies.push(new Enemy('trainingDummy', spot.x, spot.y));
  }
  return dummies;
}
