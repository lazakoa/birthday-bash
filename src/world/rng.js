export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function randomSeed() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoApi.getRandomValues(buffer);
    return buffer[0] >>> 0;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0);
}

export function nextSeed(seed) {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = hashSeed(seed) || 0x9e3779b9;
  }

  nextUint32() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  float() {
    return this.nextUint32() / 4294967296;
  }

  range(min, max) {
    return min + this.float() * (max - min);
  }

  int(min, max) {
    if (max <= min) return min;
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(probability) {
    return this.float() < probability;
  }

  pick(list) {
    return list[Math.floor(this.float() * list.length)];
  }

  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
}
