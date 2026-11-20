import { ABILITY_HOTKEYS, CHARACTER } from '../config.js';
import { assignmentAbilities, BASIC_ATTACK_ID } from '../world/abilities.js';

export class AbilityPanel {
  constructor({
    root,
    closeButton,
    summaryElement,
    statRowsElement,
    listElement,
    onUnlock,
    onAssign,
    onAllocate,
    onClose,
  }) {
    this.root = root;
    this.closeButton = closeButton;
    this.summaryElement = summaryElement;
    this.statRowsElement = statRowsElement;
    this.listElement = listElement;
    this.onUnlock = onUnlock;
    this.onAssign = onAssign;
    this.onAllocate = onAllocate;
    this.onClose = onClose;
    this.abort = new AbortController();
    this.classId = null;
    this.character = null;
    this.statRows = new Map();
    this.abilityRows = new Map();

    if (!this.root) return;
    this.buildStatRows();
    this.bindEvents();
    this.hide();
  }

  isOpen() {
    return this.root ? !this.root.hidden : false;
  }

  show() {
    if (this.root) this.root.hidden = false;
  }

  hide() {
    if (this.root) this.root.hidden = true;
  }

  buildStatRows() {
    if (!this.statRowsElement) return;
    for (const stat of CHARACTER.statOrder) {
      const row = document.createElement('div');
      row.className = 'ability-stat-row';

      const name = document.createElement('span');
      name.className = 'ability-stat-name';
      name.textContent = CHARACTER.statNames[stat];
      name.title = CHARACTER.statDescriptions[stat];

      const value = document.createElement('span');
      value.className = 'ability-stat-value';
      value.textContent = '0';

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.dataset.stat = stat;

      row.append(name, value, plus);
      this.statRowsElement.appendChild(row);
      this.statRows.set(stat, { value, plus });
    }
  }

  bindEvents() {
    const signal = this.abort.signal;
    this.closeButton?.addEventListener('click', () => this.onClose?.(), { signal });

    this.statRowsElement?.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest('[data-stat]');
        if (button) this.onAllocate?.(button.dataset.stat);
      },
      { signal },
    );

    this.listElement?.addEventListener(
      'click',
      (event) => {
        const unlock = event.target.closest('[data-unlock]');
        if (unlock) {
          this.onUnlock?.(unlock.dataset.unlock);
          return;
        }
        const assign = event.target.closest('[data-assign][data-ability]');
        if (assign) this.onAssign?.(Number(assign.dataset.slot), assign.dataset.ability);
      },
      { signal },
    );
  }

  setCharacter(character) {
    this.character = character;
    if (!character || character.classId === this.classId) return;
    this.classId = character.classId;
    this.buildAbilityRows(character.classId);
  }

  buildAbilityRows(classId) {
    if (!this.listElement) return;
    this.listElement.textContent = '';
    this.abilityRows.clear();

    for (const ability of assignmentAbilities(classId)) {
      const row = document.createElement('div');
      row.className = 'ability-row';
      row.dataset.abilityRow = ability.id;

      const info = document.createElement('div');
      info.className = 'ability-info';

      const title = document.createElement('div');
      title.className = 'ability-title';
      title.textContent = ability.name;

      const meta = document.createElement('div');
      meta.className = 'ability-meta';
      meta.textContent =
        ability.id === BASIC_ATTACK_ID
          ? 'Active · always available'
          : ability.kind === 'passive'
            ? 'Passive · works automatically once unlocked'
            : `Active · ${ability.manaCost} MP · ${ability.cooldown}s cooldown` +
              (ability.range > 0 ? ` · ${ability.range} range` : '');

      const description = document.createElement('p');
      description.className = 'ability-description';
      description.textContent = ability.description;

      info.append(title, meta, description);

      const unlock = document.createElement('button');
      unlock.type = 'button';
      unlock.className = 'ability-unlock';
      unlock.textContent = 'Unlock · 1 pt';
      if (ability.id === BASIC_ATTACK_ID) {
        unlock.hidden = true;
      } else {
        unlock.dataset.unlock = ability.id;
      }

      const slots = document.createElement('div');
      slots.className = 'ability-slots';
      if (ability.kind === 'active') {
        for (let slot = 0; slot < ABILITY_HOTKEYS.length; slot++) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ability-slot-pick';
          button.dataset.assign = String(slot);
          button.dataset.ability = ability.id;
          button.dataset.slot = String(slot);
          button.textContent = ABILITY_HOTKEYS[slot];
          slots.appendChild(button);
        }
      }

      row.append(info, unlock, slots);
      this.listElement.appendChild(row);
      this.abilityRows.set(ability.id, { row, unlock, slots });
    }
  }

  refresh(character) {
    if (!character || !this.root) return;
    this.setCharacter(character);

    const buffs = [...character.buffs.values()]
      .map((buff) => `${buff.name}`)
      .filter(Boolean)
      .join(', ');

    if (this.summaryElement) {
      this.summaryElement.textContent = [
        `${character.className} · Level ${character.level}`,
        `XP ${character.experience} / ${character.experienceToNextLevel}`,
        `Stat points ${character.statPoints}   Ability points ${character.abilityPoints}`,
        `Health ${Math.ceil(character.health)} / ${character.maxHealth}   Mana ${Math.ceil(character.mana)} / ${character.maxMana}`,
        `Defense ${character.defense}   Dodge ${(character.dodgeChance * 100).toFixed(1)}%   ` +
          `Accuracy ${(character.accuracy * 100).toFixed(0)}%`,
        buffs ? `Buffs: ${buffs}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    for (const [stat, entry] of this.statRows) {
      const bonus = (character.effectiveStats?.[stat] ?? character.stats[stat]) - character.stats[stat];
      entry.value.textContent = bonus > 0 ? `${character.stats[stat]} (+${bonus})` : String(character.stats[stat]);
      entry.plus.disabled = character.statPoints <= 0;
    }

    for (const [abilityId, entry] of this.abilityRows) {
      const ability = assignmentAbilities(character.classId).find((item) => item.id === abilityId);
      if (!ability) continue;
      const isBasic = ability.id === BASIC_ATTACK_ID;
      const unlocked = isBasic || character.hasAbility(abilityId);
      const selected =
        ability.kind === 'active' &&
        (isBasic ? character.selectedAbilityId == null : character.selectedAbilityId === abilityId);

      entry.row.classList.toggle('unlocked', unlocked);
      entry.row.classList.toggle('selected', selected);
      entry.unlock.hidden = isBasic || unlocked;
      entry.unlock.disabled = isBasic || unlocked || character.abilityPoints <= 0;

      if (ability.kind === 'active') {
        entry.slots.hidden = !unlocked;
        for (const button of entry.slots.children) {
          const slot = Number(button.dataset.slot);
          button.classList.toggle('active', character.hotbar[slot] === abilityId);
          button.disabled = !unlocked;
        }
      } else {
        entry.slots.hidden = true;
      }
    }
  }

  destroy() {
    this.abort.abort();
  }
}
