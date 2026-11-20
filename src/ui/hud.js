import { COMBAT } from '../config.js';
import { worldToScreen } from '../gfx/iso.js';

const MAX_FLOATS = 64;

export class Hud {
  constructor(elements) {
    this.elements = elements;
    this.floats = [];
    this.logs = [];
  }

  setVisible(visible) {
    if (this.elements.root) this.elements.root.hidden = !visible;
  }

  showStatus() {
    this.elements.status.hidden = false;
  }

  hideStatus() {
    this.elements.status.hidden = true;
  }

  setStatus(character, { floorNumber = 1, totalFloors = 1, seed = 0, buffs = [], isBossFloor = false } = {}) {
    if (!character) {
      this.hideStatus();
      return;
    }
    const elements = this.elements;
    elements.status.hidden = false;
    elements.name.textContent = `${character.className} · Lv ${character.level}`;
    elements.healthFill.style.width = `${Math.round(character.healthRatio * 100)}%`;
    elements.healthLabel.textContent = `${Math.ceil(character.health)} / ${character.maxHealth}`;
    elements.manaFill.style.width = `${Math.round(character.manaRatio * 100)}%`;
    elements.manaLabel.textContent = `${Math.ceil(character.mana)} / ${character.maxMana}`;
    elements.xpFill.style.width = `${Math.round(character.experienceRatio * 100)}%`;
    elements.xpLabel.textContent = `XP ${character.experience} / ${character.experienceToNextLevel}`;

    const buffLines = buffs.map((buff) => `${buff.name} ${buff.remaining.toFixed(1)}s`);
    const selected = character.selectedAbility?.();
    elements.extra.textContent =
      `Stat points ${character.statPoints}   Ability points ${character.abilityPoints}\n` +
      `Defense ${character.defense}   Dodge ${(character.dodgeChance * 100).toFixed(1)}%   ` +
      `Accuracy ${(character.accuracy * 100).toFixed(0)}%\n` +
      `Left-click: ${selected ? selected.name : 'basic attack'}   (k/c: abilities)\n` +
      (buffLines.length > 0 ? `Effects: ${buffLines.join(', ')}\n` : '') +
      `Floor ${floorNumber} / ${totalFloors}${isBossFloor ? ' — boss floor' : ''}   Seed ${seed}`;
  }

  setTarget(entity) {
    const elements = this.elements;
    if (!entity || !entity.alive) {
      elements.target.hidden = true;
      return;
    }
    elements.target.hidden = false;
    elements.targetName.textContent = entity.name;
    elements.targetFill.style.width = `${Math.round(entity.healthRatio * 100)}%`;
    elements.targetLabel.textContent = `${Math.ceil(entity.health)} / ${entity.maxHealth}`;
  }

  addFloat(x, y, text, color = '#ffffff') {
    const element = document.createElement('div');
    element.className = 'combat-float';
    element.textContent = text;
    element.style.color = color;
    this.elements.combatLayer.appendChild(element);
    this.floats.push({ x, y, ttl: COMBAT.floatingTextDuration, maxTtl: COMBAT.floatingTextDuration, element });
    while (this.floats.length > MAX_FLOATS) {
      const oldest = this.floats.shift();
      oldest.element.remove();
    }
  }

  addLog(message, color = '#dfe6ff') {
    const element = document.createElement('div');
    element.className = 'log-line';
    element.textContent = message;
    element.style.color = color;
    this.elements.log.appendChild(element);
    this.logs.push({ ttl: 5, element });
    while (this.logs.length > 5) {
      const oldest = this.logs.shift();
      oldest.element.remove();
    }
  }

  update(dt) {
    for (const item of this.floats) {
      item.ttl -= dt;
      item.element.style.opacity = String(Math.max(0, item.ttl / item.maxTtl));
    }
    this.floats = this.floats.filter((item) => {
      if (item.ttl > 0) return true;
      item.element.remove();
      return false;
    });

    for (const item of this.logs) {
      item.ttl -= dt;
      item.element.style.opacity = String(Math.max(0, Math.min(1, item.ttl)));
    }
    this.logs = this.logs.filter((item) => {
      if (item.ttl > 0) return true;
      item.element.remove();
      return false;
    });
  }

  renderOverlays(camera, viewWidth, viewHeight) {
    for (const item of this.floats) {
      const screen = worldToScreen(item.x, item.y, camera, viewWidth, viewHeight);
      item.element.style.left = `${screen.x}px`;
      item.element.style.top = `${screen.y}px`;
    }
  }

  clear() {
    for (const item of this.floats) item.element.remove();
    for (const item of this.logs) item.element.remove();
    this.floats.length = 0;
    this.logs.length = 0;
    this.setTarget(null);
  }
}
