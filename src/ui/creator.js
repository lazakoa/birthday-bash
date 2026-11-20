import { CHARACTER, CLASSES, DUNGEON } from '../config.js';
import { createBaseStats, deriveStats } from '../world/stats.js';

export class CharacterCreator {
  constructor({
    root,
    classesElement,
    statsElement,
    statRowsElement,
    pointsElement,
    abilityElement,
    previewElement,
    floorElement,
    startButton,
    onStart,
  }) {
    this.root = root;
    this.classesElement = classesElement;
    this.statsElement = statsElement;
    this.statRowsElement = statRowsElement;
    this.pointsElement = pointsElement;
    this.abilityElement = abilityElement;
    this.previewElement = previewElement;
    this.floorElement = floorElement;
    this.startButton = startButton;
    this.onStart = onStart;
    this.selectedClass = null;
    this.selectedFloor = 1;
    this.stats = createBaseStats();
    this.statPoints = CHARACTER.startingStatPoints;
    this.valueElements = new Map();
    this.abort = new AbortController();

    this.buildClassCards();
    this.buildStatRows();
    this.buildFloorOptions();
    this.bindEvents();
    this.reset();
  }

  buildClassCards() {
    const cards = new Map();
    for (const classDef of Object.values(CLASSES)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'class-card';
      card.dataset.class = classDef.id;

      const title = document.createElement('h2');
      title.textContent = classDef.name;
      const tagline = document.createElement('p');
      tagline.textContent = classDef.tagline;
      const weapon = document.createElement('p');
      weapon.className = 'class-weapon';
      weapon.textContent =
        `${classDef.weapon.name} · ${classDef.weapon.damageMin}-${classDef.weapon.damageMax} damage · ` +
        `${classDef.weapon.range.toFixed(1)} tile reach`;
      const hint = document.createElement('p');
      hint.className = 'class-hint';
      hint.textContent = 'Select';

      card.append(title, tagline, weapon, hint);
      this.classesElement.appendChild(card);
      cards.set(classDef.id, card);
    }
    this.cards = cards;
  }

  buildStatRows() {
    for (const stat of CHARACTER.statOrder) {
      const row = document.createElement('div');
      row.className = 'stat-row';

      const name = document.createElement('div');
      name.className = 'stat-name';
      const label = document.createElement('span');
      label.textContent = CHARACTER.statNames[stat];
      const description = document.createElement('small');
      description.textContent = CHARACTER.statDescriptions[stat];
      name.append(label, description);

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '-';
      minus.dataset.stat = stat;
      minus.dataset.delta = '-1';

      const value = document.createElement('span');
      value.className = 'stat-value';
      value.textContent = '0';
      value.dataset.value = stat;

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.dataset.stat = stat;
      plus.dataset.delta = '1';

      row.append(name, minus, value, plus);
      this.statRowsElement.appendChild(row);
      this.valueElements.set(stat, { value, minus, plus });
    }
  }

  buildFloorOptions() {
    if (!this.floorElement) return;
    this.floorElement.replaceChildren();
    for (let floorNumber = 1; floorNumber <= DUNGEON.totalFloors; floorNumber++) {
      const option = document.createElement('option');
      option.value = String(floorNumber);
      const levels = floorNumber - 1;
      const levelText = levels > 0 ? ` — +${levels} level${levels === 1 ? '' : 's'} of XP` : '';
      const bossText = floorNumber === DUNGEON.bossFloor ? ' (boss)' : '';
      option.textContent = `Floor ${floorNumber}${bossText}${levelText}`;
      this.floorElement.appendChild(option);
    }
    this.floorElement.value = '1';
  }

  bindEvents() {
    const signal = this.abort.signal;

    this.classesElement.addEventListener('click', (event) => {
      const button = event.target.closest('[data-class]');
      if (!button) return;
      this.selectClass(button.dataset.class);
    }, { signal });

    this.statRowsElement.addEventListener('click', (event) => {
      const button = event.target.closest('[data-stat][data-delta]');
      if (!button) return;
      this.changeStat(button.dataset.stat, Number(button.dataset.delta));
    }, { signal });

    this.floorElement?.addEventListener('change', () => {
      const value = Number(this.floorElement.value);
      this.selectedFloor = Math.max(1, Math.min(DUNGEON.totalFloors, Math.floor(value) || 1));
      this.render();
    }, { signal });

    this.startButton.addEventListener('click', () => this.submit(), { signal });
  }

  selectClass(classId) {
    if (!CLASSES[classId]) return;
    this.selectedClass = classId;
    this.stats = createBaseStats();
    this.statPoints = CHARACTER.startingStatPoints;
    this.render();
  }

  changeStat(stat, delta) {
    if (!CHARACTER.statOrder.includes(stat)) return;
    if (delta > 0 && this.statPoints > 0) {
      this.stats[stat] += 1;
      this.statPoints -= 1;
    } else if (delta < 0 && this.stats[stat] > 0) {
      this.stats[stat] -= 1;
      this.statPoints += 1;
    }
    this.render();
  }

  reset() {
    this.selectedClass = null;
    this.selectedFloor = 1;
    this.stats = createBaseStats();
    this.statPoints = CHARACTER.startingStatPoints;
    this.render();
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  submit() {
    if (!this.selectedClass) return;
    this.onStart?.(this.selectedClass, { ...this.stats }, this.selectedFloor);
  }

  render() {
    for (const [classId, card] of this.cards) {
      card.classList.toggle('selected', classId === this.selectedClass);
      card.querySelector('.class-hint').textContent = classId === this.selectedClass ? 'Selected' : 'Select';
    }

    this.statsElement.hidden = !this.selectedClass;
    this.startButton.disabled = !this.selectedClass;
    this.pointsElement.textContent = String(this.statPoints);
    this.abilityElement.textContent = String(CHARACTER.startingAbilityPoints);
    if (this.floorElement) {
      this.floorElement.value = String(this.selectedFloor);
      this.floorElement.disabled = !this.selectedClass;
    }

    for (const [stat, elements] of this.valueElements) {
      elements.value.textContent = String(this.stats[stat]);
      elements.minus.disabled = this.stats[stat] <= 0;
      elements.plus.disabled = this.statPoints <= 0;
    }

    if (!this.selectedClass) {
      this.previewElement.textContent = '';
      return;
    }

    const derived = deriveStats(this.selectedClass, this.stats);
    const lines = [
      `Max health ${derived.maxHealth}`,
      `Max mana ${derived.maxMana}`,
      `Health regen ${derived.healthRegen.toFixed(2)}/s`,
      `Mana regen ${derived.manaRegen.toFixed(2)}/s`,
      `Melee bonus +${derived.meleeDamageBonus.toFixed(1)}`,
      `Spell bonus +${derived.spellDamageBonus.toFixed(1)}`,
      `Defense ${derived.defense} (${(derived.damageReduction * 100).toFixed(1)}% reduction)`,
      `Dodge ${(derived.dodgeChance * 100).toFixed(1)}%`,
      `Accuracy ${(derived.accuracy * 100).toFixed(0)}%`,
      `Spell fumble ${(derived.spellFumbleChance * 100).toFixed(1)}%`,
    ];
    this.previewElement.textContent = lines.join('\n');
  }

  destroy() {
    this.abort.abort();
  }
}
