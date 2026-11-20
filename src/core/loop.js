export class Loop {
  constructor({ update, render, step = 1 / 60, maxFrameTime = 0.25 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxFrameTime = maxFrameTime;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.rafId = 0;
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  resetClock() {
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  frame(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    let elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;
    elapsed = Math.min(elapsed, this.maxFrameTime);
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= this.step && steps < 5) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }
    if (steps === 5) this.accumulator = 0;

    this.render(elapsed);
  }
}
