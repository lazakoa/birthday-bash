import { ABILITY_HOTKEYS } from '../config.js';
import { BASIC_ATTACK_ID, cooldownKey } from '../world/abilities.js';

export class AbilityBar {
  constructor({ root, onSelectSlot }) {
    this.root = root;
    this.onSelectSlot = onSelectSlot;
    this.slots = [];
    this.abort = new AbortController();

    if (!this.root) return;

    for (let slot = 0; slot < ABILITY_HOTKEYS.length; slot++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ability-slot empty';
      button.dataset.slot = String(slot);

      const key = document.createElement('span');
      key.className = 'slot-key';
      key.textContent = ABILITY_HOTKEYS[slot];

      const name = document.createElement('span');
      name.className = 'slot-name';

      const cost = document.createElement('span');
      cost.className = 'slot-cost';

      const cooldown = document.createElement('span');
      cooldown.className = 'slot-cooldown';

      button.append(key, name, cost, cooldown);
      this.root.appendChild(button);
      this.slots.push({ button, name, cost, cooldown });
    }

    this.root.addEventListener(
      'click',
      (event) => {
        const slot = event.target.closest('[data-slot]');
        if (slot) this.onSelectSlot?.(Number(slot.dataset.slot));
      },
      { signal: this.abort.signal },
    );
    this.setVisible(false);
  }

  setVisible(visible) {
    if (this.root) this.root.hidden = !visible;
  }

  refresh(character, { cooldowns = null } = {}) {
    if (!character) return;
    for (let slot = 0; slot < this.slots.length; slot++) {
      const entry = this.slots[slot];
      const ability = character.hotbarAbility(slot);
      const selected =
        ability != null &&
        (ability.id === BASIC_ATTACK_ID
          ? character.selectedAbilityId == null
          : character.selectedAbilityId === ability.id);
      const remaining =
        ability && cooldowns && ability.id !== BASIC_ATTACK_ID
          ? cooldowns.remaining(cooldownKey(ability))
          : 0;

      entry.name.textContent = ability?.name ?? '';
      entry.cost.textContent = ability && ability.manaCost > 0 ? `${ability.manaCost} MP` : '';
      entry.cooldown.textContent = remaining > 0.05 ? remaining.toFixed(1) : '';
      entry.button.classList.toggle('empty', !ability);
      entry.button.classList.toggle('selected', selected);
      entry.button.classList.toggle('cooling', remaining > 0.05);
      entry.button.disabled = !ability;
    }
  }

  destroy() {
    this.abort.abort();
  }
}
