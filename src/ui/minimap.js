import { DUNGEON, MINIMAP } from '../config.js';

export function localMapWindow(gridWidth, gridHeight, playerX, playerY, tilesAcross = MINIMAP.tilesAcross) {
  const sourceWidth = Math.max(1, Math.floor(Number(gridWidth) || 0));
  const sourceHeight = Math.max(1, Math.floor(Number(gridHeight) || 0));
  const span = Math.max(1, Math.floor(Number(tilesAcross) || 0));
  const width = Math.min(span, sourceWidth);
  const height = Math.min(span, sourceHeight);
  const centerX = Number.isFinite(playerX) ? playerX : 0;
  const centerY = Number.isFinite(playerY) ? playerY : 0;

  const minX = Math.max(0, Math.min(sourceWidth - width, centerX - width / 2));
  const minY = Math.max(0, Math.min(sourceHeight - height, centerY - height / 2));

  return { minX, minY, width, height };
}

export function fitRect(sourceWidth, sourceHeight, destinationWidth, destinationHeight) {
  const sourceW = Math.max(0, Number(sourceWidth) || 0);
  const sourceH = Math.max(0, Number(sourceHeight) || 0);
  const destinationW = Math.max(0, Number(destinationWidth) || 0);
  const destinationH = Math.max(0, Number(destinationHeight) || 0);
  if (sourceW <= 0 || sourceH <= 0 || destinationW <= 0 || destinationH <= 0) {
    return { scale: 0, width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(destinationW / sourceW, destinationH / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  return {
    scale,
    width,
    height,
    offsetX: (destinationW - width) / 2,
    offsetY: (destinationH - height) / 2,
  };
}

export function isMapToggleKey(key) {
  return (
    key?.code === 'KeyM' &&
    !key.shiftKey &&
    !key.ctrlKey &&
    !key.altKey &&
    !key.metaKey
  );
}

export function isMapCloseKey(key) {
  return key?.code === 'Escape' || isMapToggleKey(key);
}

function buildFloorCache(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = MINIMAP.wallColor;
  ctx.fillRect(0, 0, grid.width, grid.height);
  ctx.fillStyle = MINIMAP.floorColor;
  grid.forEachTile((tx, ty, value) => {
    if (value === 0) ctx.fillRect(tx, ty, 1, 1);
  });
  return canvas;
}

function prepareCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const deviceWidth = Math.max(1, Math.round(cssWidth * dpr));
  const deviceHeight = Math.max(1, Math.round(cssHeight * dpr));

  if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
  if (canvas.height !== deviceHeight) canvas.height = deviceHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.imageSmoothingEnabled = false;
  return { ctx, width: cssWidth, height: cssHeight };
}

function drawPlayerDot(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
  ctx.fillStyle = MINIMAP.playerDotOutline;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = MINIMAP.playerDotColor;
  ctx.fill();
}

export class MiniMap {
  constructor({ root, canvas, overlay, overlayCanvas, title, closeButton, onClose }) {
    this.root = root;
    this.canvas = canvas;
    this.overlay = overlay;
    this.overlayCanvas = overlayCanvas;
    this.title = title;
    this.closeButton = closeButton;
    this.onClose = onClose;
    this.floor = null;
    this.grid = null;
    this.cache = null;
    this.player = null;
    this.totalFloors = DUNGEON.totalFloors;
    this.openFlag = false;
    this.abort = new AbortController();

    if (root) {
      const style = document.documentElement.style;
      style.setProperty('--minimap-inset', `${MINIMAP.inset}px`);
      style.setProperty('--minimap-size', `${MINIMAP.size}px`);
      style.setProperty('--minimap-debug-offset', `${MINIMAP.inset + MINIMAP.size + MINIMAP.debugGap}px`);
      style.setProperty('--minimap-background', MINIMAP.background);
      style.setProperty('--minimap-border-color', MINIMAP.borderColor);
      style.setProperty(
        '--map-panel-width',
        `min(${MINIMAP.largePanelWidthPx}px, ${MINIMAP.largePanelWidthVw}vw)`,
      );
      style.setProperty('--map-panel-max-height', `${MINIMAP.largePanelHeightVh}vh`);
      style.setProperty(
        '--map-canvas-size',
        `min(${MINIMAP.largeMapWidthVw}vw, ${MINIMAP.largeMapHeightVh}vh)`,
      );
    }

    const signal = this.abort.signal;
    this.closeButton?.addEventListener('click', () => this.close(true), { signal });
    this.overlay?.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target === this.overlay) this.close(true);
      },
      { signal },
    );

    this.hide();
  }

  isOpen() {
    return this.openFlag;
  }

  setFloor(floor, { totalFloors = DUNGEON.totalFloors } = {}) {
    this.floor = floor ?? null;
    this.grid = floor?.grid ?? null;
    this.totalFloors = totalFloors;
    this.cache = this.grid ? buildFloorCache(this.grid) : null;
    this.updateTitle();
    if (this.player) this.render(this.player);
  }

  setVisible(visible) {
    if (!this.root) return;
    const show = Boolean(visible && this.grid);
    this.root.hidden = !show;
    if (!show) this.close(false);
    else if (this.player) this.render(this.player);
  }

  hide() {
    this.close(false);
    if (this.root) this.root.hidden = true;
  }

  open() {
    if (!this.overlay || !this.grid || this.openFlag) return false;
    this.openFlag = true;
    this.overlay.hidden = false;
    this.updateTitle();
    this.drawLarge();
    this.closeButton?.focus();
    return true;
  }

  close(restoreFocus = false) {
    if (!this.openFlag) {
      if (this.overlay) this.overlay.hidden = true;
      return false;
    }
    this.openFlag = false;
    if (this.overlay) this.overlay.hidden = true;
    if (restoreFocus) this.onClose?.();
    return true;
  }

  toggle() {
    return this.openFlag ? this.close(true) : this.open();
  }

  updateTitle() {
    if (!this.title) return;
    if (!this.floor) {
      this.title.textContent = "The Lich's Den";
      return;
    }
    const floorNumber = this.floor.floorNumber ?? 1;
    const suffix = this.floor.isBoss ? ' — boss floor' : '';
    this.title.textContent = `The Lich's Den — Floor ${floorNumber} of ${this.totalFloors}${suffix}`;
  }

  render(player) {
    if (player) this.player = player;
    if (!this.grid || !this.player) return;
    if (this.root && !this.root.hidden) this.drawMini();
    if (this.openFlag) this.drawLarge();
  }

  drawMini() {
    if (!this.canvas || !this.cache) return;
    const prepared = prepareCanvas(this.canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const window = localMapWindow(
      this.grid.width,
      this.grid.height,
      this.player.x,
      this.player.y,
      MINIMAP.tilesAcross,
    );
    const fit = fitRect(window.width, window.height, width, height);

    ctx.fillStyle = MINIMAP.wallColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(
      this.cache,
      window.minX,
      window.minY,
      window.width,
      window.height,
      fit.offsetX,
      fit.offsetY,
      fit.width,
      fit.height,
    );
    drawPlayerDot(
      ctx,
      fit.offsetX + (this.player.x - window.minX) * fit.scale,
      fit.offsetY + (this.player.y - window.minY) * fit.scale,
      MINIMAP.miniDotRadius,
    );
  }

  drawLarge() {
    if (!this.overlayCanvas || !this.cache || !this.grid || !this.player) return;
    const prepared = prepareCanvas(this.overlayCanvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const fit = fitRect(this.grid.width, this.grid.height, width, height);

    ctx.fillStyle = MINIMAP.wallColor;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(
      this.cache,
      0,
      0,
      this.grid.width,
      this.grid.height,
      fit.offsetX,
      fit.offsetY,
      fit.width,
      fit.height,
    );
    drawPlayerDot(
      ctx,
      fit.offsetX + this.player.x * fit.scale,
      fit.offsetY + this.player.y * fit.scale,
      MINIMAP.largeDotRadius,
    );
  }

  destroy() {
    this.abort.abort();
    this.close(false);
    if (this.root) this.root.hidden = true;
    this.floor = null;
    this.grid = null;
    this.cache = null;
    this.player = null;
  }
}
