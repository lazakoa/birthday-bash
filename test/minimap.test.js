import test from 'node:test';
import assert from 'node:assert/strict';

import { MINIMAP } from '../src/config.js';
import { Game } from '../src/core/game.js';
import {
  fitRect,
  isMapCloseKey,
  isMapToggleKey,
  localMapWindow,
} from '../src/ui/minimap.js';

test('local map window centers on the player and clamps to floor edges', () => {
  const centered = localMapWindow(144, 144, 50.5, 80.5, MINIMAP.tilesAcross);
  assert.deepEqual(centered, { minX: 38.5, minY: 68.5, width: 24, height: 24 });

  assert.deepEqual(localMapWindow(144, 144, 1.2, 2.2, 24), { minX: 0, minY: 0, width: 24, height: 24 });
  assert.deepEqual(localMapWindow(144, 144, 142.9, 143.9, 24), {
    minX: 120,
    minY: 120,
    width: 24,
    height: 24,
  });
});

test('local map crop follows fractional player movement without tile jumps', () => {
  const first = localMapWindow(144, 144, 50.1, 80.1, 24);
  const second = localMapWindow(144, 144, 50.9, 80.9, 24);

  assert.ok(Math.abs(first.minX - 38.1) < 1e-9);
  assert.ok(Math.abs(second.minX - 38.9) < 1e-9);
  assert.ok(Math.abs(50.1 - first.minX - 12) < 1e-9);
  assert.ok(Math.abs(50.9 - second.minX - 12) < 1e-9);
  assert.ok(second.minX - first.minX > 0.79);
});

test('local map window shows the whole floor when the floor is smaller than the crop', () => {
  assert.deepEqual(localMapWindow(10, 8, 4.5, 3.5, 24), { minX: 0, minY: 0, width: 10, height: 8 });
});

test('map fit preserves aspect ratio and centers the whole floor', () => {
  const wide = fitRect(144, 144, 500, 300);
  assert.ok(Math.abs(wide.scale - 300 / 144) < 1e-9);
  assert.ok(Math.abs(wide.width - 300) < 1e-9);
  assert.ok(Math.abs(wide.height - 300) < 1e-9);
  assert.ok(Math.abs(wide.offsetX - 100) < 1e-9);
  assert.equal(wide.offsetY, 0);

  const tall = fitRect(144, 144, 300, 500);
  assert.ok(Math.abs(tall.offsetY - 100) < 1e-9);
  assert.equal(tall.offsetX, 0);

  assert.deepEqual(fitRect(144, 144, 0, 0), { scale: 0, width: 0, height: 0, offsetX: 0, offsetY: 0 });
});

test('map keys distinguish M, Shift+M and Escape', () => {
  assert.equal(isMapToggleKey({ code: 'KeyM', key: 'm' }), true);
  assert.equal(isMapToggleKey({ code: 'KeyM', key: 'M', shiftKey: true }), false);
  assert.equal(isMapToggleKey({ code: 'KeyM', key: 'm', ctrlKey: true }), false);
  assert.equal(isMapToggleKey({ code: 'Escape', key: 'Escape' }), false);

  assert.equal(isMapCloseKey({ code: 'Escape', key: 'Escape' }), true);
  assert.equal(isMapCloseKey({ code: 'KeyM', key: 'm' }), true);
  assert.equal(isMapCloseKey({ code: 'KeyM', key: 'M', shiftKey: true }), false);
});

function makeMapHarness({ state = 'playing', panelOpen = false, mapOpen = false, contextLost = false } = {}) {
  const calls = { open: 0, close: 0, clicks: 0 };
  const map = {
    openFlag: mapOpen,
    isOpen() {
      return this.openFlag;
    },
    open() {
      this.openFlag = true;
      calls.open += 1;
      return true;
    },
    close() {
      this.openFlag = false;
      calls.close += 1;
      return true;
    },
  };
  const game = Object.assign(Object.create(Game.prototype), {
    map,
    state,
    contextLost,
    abilityPanel: { isOpen: () => panelOpen },
    input: {
      consumeClicks() {
        calls.clicks += 1;
      },
    },
  });
  return { game, calls, map };
}

test('the map toggle only opens during active play and closes an open map', () => {
  const active = makeMapHarness();
  assert.equal(active.game.toggleMap(), true);
  assert.equal(active.map.isOpen(), true);
  assert.equal(active.calls.open, 1);
  assert.equal(active.calls.clicks, 1);

  assert.equal(active.game.toggleMap(), true);
  assert.equal(active.map.isOpen(), false);
  assert.equal(active.calls.close, 1);

  const dead = makeMapHarness({ state: 'dead' });
  assert.equal(dead.game.toggleMap(), false);
  assert.equal(dead.calls.open, 0);

  const panel = makeMapHarness({ panelOpen: true });
  assert.equal(panel.game.toggleMap(), false);
  assert.equal(panel.calls.open, 0);

  const lost = makeMapHarness({ contextLost: true });
  assert.equal(lost.game.toggleMap(), false);
  assert.equal(lost.calls.open, 0);
});

test('an open map skips simulation and consumes pending input', () => {
  let keyReads = 0;
  let clickReads = 0;
  let framesEnded = 0;
  let hudUpdates = 0;

  const game = Object.assign(Object.create(Game.prototype), {
    paused: false,
    contextLost: false,
    state: 'playing',
    map: { isOpen: () => true },
    input: {
      consumeKeys() {
        keyReads += 1;
        return [];
      },
      consumeClicks() {
        clickReads += 1;
      },
      endFrame() {
        framesEnded += 1;
      },
    },
    hud: {
      update() {
        hudUpdates += 1;
      },
    },
  });

  game.update(1 / 60);

  assert.equal(keyReads, 1);
  assert.equal(clickReads, 1);
  assert.equal(framesEnded, 1);
  assert.equal(hudUpdates, 0);
});

