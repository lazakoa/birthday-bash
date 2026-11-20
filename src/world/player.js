import { PLAYER } from '../config.js';
import { moveCircle } from './grid.js';
import { Entity } from './entity.js';

const ARRIVE_EPSILON = 0.04;

export class Player extends Entity {
  constructor(x, y) {
    super({
      name: 'Player',
      kind: 'player',
      faction: 'player',
      x,
      y,
      radius: PLAYER.radiusTiles,
      maxHealth: 1,
      maxMana: 0,
      sprite: 'wizard',
    });
    this.speed = PLAYER.speedTilesPerSecond;
    this.path = [];
    this.destination = null;
    this.moving = false;
    this.facing = 1;
  }

  setDestination(x, y) {
    this.setPath([{ x, y }]);
  }

  setPath(points) {
    this.path = points.map((point) => ({ x: point.x, y: point.y }));
    this.destination = this.path.length > 0 ? this.path[this.path.length - 1] : null;
  }

  clearPath() {
    this.path.length = 0;
    this.destination = null;
    this.moving = false;
  }

  get hasPath() {
    return this.path.length > 0;
  }

  update(grid, dt) {
    this.regenerate(dt);

    if (this.path.length === 0) {
      this.moving = false;
      return;
    }

    const target = this.path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance < ARRIVE_EPSILON) {
      this.path.shift();
      this.x = target.x;
      this.y = target.y;
      if (this.path.length === 0) {
        this.destination = null;
        this.moving = false;
      }
      return;
    }

    const step = Math.min(distance, this.speed * dt);
    const moveX = (dx / distance) * step;
    const moveY = (dy / distance) * step;
    const next = moveCircle(grid, this.x, this.y, moveX, moveY, this.radius);
    const moved = Math.hypot(next.x - this.x, next.y - this.y);
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
    this.x = next.x;
    this.y = next.y;
    this.moving = moved > 0.0001;

    if (moved < step * 0.05) {
      this.clearPath();
    }
  }
}
