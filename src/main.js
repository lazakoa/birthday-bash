import { Game } from './core/game.js';

const canvas = document.getElementById('game');
const debugElement = document.getElementById('hud-debug');
const overlayElement = document.getElementById('overlay');

function fail(message) {
  console.error(message);
  if (!overlayElement) return;
  overlayElement.textContent = message;
  overlayElement.hidden = false;
}

if (!(canvas instanceof HTMLCanvasElement)) {
  fail('Game canvas is missing from the page.');
} else {
  try {
    const game = new Game(canvas, { debugElement, overlayElement });
    game.start();
    window.__birthdayBash = game;
  } catch (error) {
    fail(`Failed to start Birthday Bash.\n\n${error instanceof Error ? error.message : String(error)}`);
  }
}
