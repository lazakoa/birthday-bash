export class TimedEffectSystem {
  constructor() {
    this.items = [];
    this.nextId = 1;
  }

  add({ target = null, name, duration, magnitude = 0, data = null, onExpire = null } = {}) {
    if (!name || !(duration > 0)) return null;
    const effect = {
      id: this.nextId++,
      target,
      name,
      duration,
      remaining: duration,
      magnitude,
      data,
      onExpire,
    };
    this.items.push(effect);
    return effect;
  }

  update(dt) {
    const expired = [];
    for (const effect of this.items) {
      effect.remaining -= dt;
      if (effect.remaining <= 0) expired.push(effect);
    }
    if (expired.length === 0) return expired;
    this.items = this.items.filter((effect) => !expired.includes(effect));
    for (const effect of expired) effect.onExpire?.(effect);
    return expired;
  }

  activeFor(target, name = null) {
    return this.items.filter((effect) => effect.target === target && (name == null || effect.name === name));
  }

  countFor(target, name) {
    return this.activeFor(target, name).length;
  }

  totalMagnitude(target, name) {
    return this.activeFor(target, name).reduce((total, effect) => total + effect.magnitude, 0);
  }

  remove(target, name = null) {
    const removed = this.items.filter(
      (effect) => effect.target === target && (name == null || effect.name === name),
    );
    if (removed.length === 0) return removed;
    this.items = this.items.filter((effect) => !removed.includes(effect));
    return removed;
  }

  removeFor(target) {
    const removed = this.activeFor(target);
    this.items = this.items.filter((effect) => effect.target !== target);
    return removed;
  }

  clear() {
    this.items.length = 0;
  }
}

export class Cooldowns {
  constructor() {
    this.timers = new Map();
  }

  update(dt) {
    for (const [id, remaining] of this.timers) {
      const next = remaining - dt;
      if (next <= 0) this.timers.delete(id);
      else this.timers.set(id, next);
    }
  }

  ready(id) {
    return (this.timers.get(id) ?? 0) <= 0;
  }

  remaining(id) {
    return Math.max(0, this.timers.get(id) ?? 0);
  }

  start(id, seconds) {
    if (seconds > 0) this.timers.set(id, seconds);
    else this.timers.delete(id);
  }

  reduce(id, seconds) {
    const remaining = this.remaining(id) - seconds;
    if (remaining > 0) this.timers.set(id, remaining);
    else this.timers.delete(id);
  }

  clear() {
    this.timers.clear();
  }
}
