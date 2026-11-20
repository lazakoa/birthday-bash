let nextEntityId = 1;

export function resetEntityIds() {
  nextEntityId = 1;
}

const PLAYER_SIDE = new Set(['player', 'ally']);

export function sideOf(faction) {
  return PLAYER_SIDE.has(faction) ? 'player' : faction;
}

export function sameSide(a, b) {
  return sideOf(a) === sideOf(b);
}

export function isHostile(a, b) {
  return !sameSide(a, b);
}

export class Entity {
  constructor({
    name = 'Entity',
    kind = 'entity',
    faction = 'neutral',
    x = 0,
    y = 0,
    radius = 0.3,
    maxHealth = 1,
    maxMana = 0,
    sprite = null,
  } = {}) {
    this.id = nextEntityId++;
    this.name = name;
    this.kind = kind;
    this.faction = faction;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.maxMana = maxMana;
    this.mana = maxMana;
    this.healthRegen = 0;
    this.manaRegen = 0;
    this.slowMultiplier = 1;
    this.alive = true;
    this.deathCount = 0;
    this.sprite = sprite;
  }

  get dead() {
    return !this.alive;
  }

  get healthRatio() {
    return this.maxHealth > 0 ? Math.max(0, Math.min(1, this.health / this.maxHealth)) : 0;
  }

  get manaRatio() {
    return this.maxMana > 0 ? Math.max(0, Math.min(1, this.mana / this.maxMana)) : 0;
  }

  distanceTo(other) {
    return Math.hypot(other.x - this.x, other.y - this.y);
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
    let damage = Math.max(0, Number(amount) || 0);
    if (damage === 0) return 0;
    if (this.damageFilter) {
      damage = Math.max(0, Number(this.damageFilter(damage)) || 0);
      if (damage === 0) return 0;
    }
    const applied = Math.min(this.health, damage);
    this.health -= applied;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathCount += 1;
    }
    return applied;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const healing = Math.max(0, Number(amount) || 0);
    if (healing === 0) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + healing);
    return this.health - before;
  }

  spendMana(amount) {
    if (!this.alive) return false;
    const cost = Math.max(0, Number(amount) || 0);
    if (cost > this.mana) return false;
    this.mana -= cost;
    return true;
  }

  restoreMana(amount) {
    if (!this.alive) return 0;
    const restored = Math.max(0, Number(amount) || 0);
    if (restored === 0) return 0;
    const before = this.mana;
    this.mana = Math.min(this.maxMana, this.mana + restored);
    return this.mana - before;
  }

  regenerate(dt) {
    if (!this.alive) return;
    if (this.healthRegen > 0) {
      this.health = Math.min(this.maxHealth, this.health + this.healthRegen * dt);
    }
    if (this.manaRegen > 0) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);
    }
  }

  update() {}
}

export class EntityStore {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  get all() {
    return this.items;
  }

  add(entity) {
    this.items.push(entity);
    return entity;
  }

  remove(entity) {
    const index = this.items.indexOf(entity);
    if (index >= 0) this.items.splice(index, 1);
  }

  find(id) {
    if (id == null) return null;
    return this.items.find((entity) => entity.id === id) ?? null;
  }

  byFaction(faction) {
    return this.items.filter((entity) => entity.faction === faction);
  }

  alive() {
    return this.items.filter((entity) => entity.alive);
  }

  enemiesOf(entity) {
    if (!entity) return [];
    return this.items.filter((other) => other.alive && isHostile(other.faction, entity.faction));
  }

  nearest(x, y, { faction = null, maxDistance = Infinity } = {}) {
    let best = null;
    let bestDistance = maxDistance;
    for (const entity of this.items) {
      if (!entity.alive) continue;
      if (faction && entity.faction !== faction) continue;
      const distance = Math.hypot(entity.x - x, entity.y - y);
      if (distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  update(dt) {
    for (const entity of this.items) entity.update(dt);
  }

  clear() {
    this.items.length = 0;
  }
}
