export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.modifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
    this.mouse = { x: 0, y: 0, inside: false };
    this.clicks = [];
    this.keyPresses = [];
    this.running = false;
    this.abort = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    this.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event), { signal });
    this.canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event), { signal });
    this.canvas.addEventListener('pointerenter', () => (this.mouse.inside = true), { signal });
    this.canvas.addEventListener('pointerleave', () => (this.mouse.inside = false), { signal });
    window.addEventListener('keydown', (event) => this.handleKeyDown(event), { signal, capture: true });
    window.addEventListener('keyup', (event) => this.handleKeyUp(event), { signal, capture: true });
    window.addEventListener('blur', () => this.clearHeld(), { signal });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    this.clearHeld();
    this.clicks.length = 0;
    this.keyPresses.length = 0;
    this.mouse.inside = false;
  }

  clearHeld() {
    this.keys.clear();
    this.pressed.clear();
    this.modifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
  }

  handlePointerDown(event) {
    this.updateMouse(event);
    this.canvas.focus();
    if (event.button === 2) {
      event.preventDefault();
      this.clicks.push({ button: 'right', x: this.mouse.x, y: this.mouse.y });
    } else if (event.button === 0) {
      this.clicks.push({ button: 'left', x: this.mouse.x, y: this.mouse.y });
    }
  }

  handlePointerMove(event) {
    this.updateMouse(event);
  }

  handleKeyDown(event) {
    this.updateModifiers(event);
    if (event.repeat) {
      return;
    }
    this.keys.add(event.code);
    this.pressed.add(event.code);
    this.lastKey = event.code;
    this.keyPresses.push({
      code: event.code,
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    if (PREVENT_DEFAULT_KEYS.has(event.code) || isUnmodifiedGameKey(event)) event.preventDefault();
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
    this.updateModifiers(event);
  }

  updateModifiers(event) {
    this.modifiers.shiftKey = Boolean(event.shiftKey);
    this.modifiers.ctrlKey = Boolean(event.ctrlKey);
    this.modifiers.altKey = Boolean(event.altKey);
    this.modifiers.metaKey = Boolean(event.metaKey);
  }

  updateMouse(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
    this.mouse.inside =
      this.mouse.x >= 0 && this.mouse.y >= 0 && this.mouse.x < rect.width && this.mouse.y < rect.height;
  }

  consumeClicks() {
    const clicks = this.clicks.slice();
    this.clicks.length = 0;
    return clicks;
  }

  consumeKeys() {
    const presses = this.keyPresses.slice();
    this.keyPresses.length = 0;
    return presses;
  }

  endFrame() {
    this.pressed.clear();
  }
}

const PREVENT_DEFAULT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

const GAME_KEY_CODES = new Set(['KeyK', 'KeyC', 'KeyR', 'KeyS', 'KeyH', 'KeyM', 'KeyT', 'KeyV']);
for (let digit = 0; digit <= 9; digit++) {
  GAME_KEY_CODES.add(`Digit${digit}`);
  GAME_KEY_CODES.add(`Numpad${digit}`);
}

const GAME_KEY_LETTERS = new Set(['k', 'c', 'r', 's', 'h', 'm', 't', 'v']);

function isUnmodifiedGameKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  const isMenu = event.code === 'KeyK' || event.code === 'KeyC' || key === 'k' || key === 'c';
  if (isMenu && event.shiftKey) return false;
  if (GAME_KEY_CODES.has(event.code)) return true;
  return /^[0-9]$/.test(key) || GAME_KEY_LETTERS.has(key);
}
