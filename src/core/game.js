import {
  RENDER,
  TUNING,
  COMBAT,
  CHARACTER,
  CLASSES,
  PLAYER,
  PROGRESSION,
  ABILITY_HOTKEYS,
  ELEMENT_COLORS,
  SHRINES,
} from '../config.js';
import { Loop } from './loop.js';
import { Input } from './input.js';
import { createGL } from '../gfx/gl.js';
import { SpriteRenderer } from '../gfx/renderer.js';
import { buildAtlasCanvas } from '../gfx/atlas.js';
import { screenToTile, screenToWorld, tileToWorld } from '../gfx/iso.js';
import { createCamera, followCamera as followCameraStep } from '../gfx/camera.js';
import { generateFloor, TOTAL_FLOORS } from '../world/floor.js';
import { findPath, nearestWalkableTile, smoothPath } from '../world/pathfinding.js';
import { nextSeed, randomSeed, Rng } from '../world/rng.js';
import { EntityStore } from '../world/entity.js';
import { Character } from '../world/character.js';
import { grantStartingFloorExperience } from '../world/progression.js';
import { spawnLich, spawnFloorEnemies } from '../world/enemies.js';
import { updateEnemy } from '../world/enemyAI.js';
import { updateLich } from '../world/lich.js';
import { inAttackRange, resolveMeleeAttack } from '../world/combat.js';
import { Cooldowns, TimedEffectSystem } from '../world/effects.js';
import { ProjectileSystem } from '../world/projectile.js';
import { AreaEffectSystem } from '../world/area.js';
import { AbilitySystem } from '../world/abilitySystem.js';
import { createSummon, updateSummon } from '../world/summons.js';
import { PickupSystem, rollBloodDrop } from '../world/pickups.js';
import {
  hotkeySlotForCode,
  hotkeySlotForKey,
  abilityInRange,
  findAbilityById,
} from '../world/abilities.js';
import { Hud } from '../ui/hud.js';
import { CharacterCreator } from '../ui/creator.js';
import { AbilityBar } from '../ui/abilityBar.js';
import { AbilityPanel } from '../ui/abilityPanel.js';

const STAT_PARAMS = {
  str: 'strength',
  int: 'intelligence',
  vit: 'vitality',
  dex: 'dexterity',
};

export class Game {
  constructor(canvas, { debugElement, overlayElement }) {
    this.canvas = canvas;
    this.debugElement = debugElement;
    this.overlayElement = overlayElement;

    this.gl = createGL(canvas);
    this.atlasCanvas = buildAtlasCanvas();
    this.renderer = new SpriteRenderer(this.gl, RENDER.maxSprites);
    this.renderer.uploadAtlas(this.atlasCanvas);

    this.input = new Input(canvas);

    this.view = { cssWidth: 1, cssHeight: 1, width: 1, height: 1, dpr: 1 };
    this.hoverTile = null;
    this.hoveredEnemy = null;
    this.clickMarker = null;
    this.clickCounts = { left: 0, right: 0 };
    this.paused = false;
    this.contextLost = false;
    this.fps = 0;
    this.frameSamples = 0;
    this.frameSampleTime = 0;
    this.hudTimer = 0;
    this.abort = new AbortController();

    this.state = 'create';
    this.character = null;
    this.player = null;
    this.floor = null;
    this.grid = null;
    this.seed = 0;
    this.floorNumber = 1;
    this.totalFloors = TOTAL_FLOORS;
    this.exit = null;
    this.bossDefeated = false;
    this.lichDefeated = false;
    this.lich = null;
    this.attackTargetId = null;
    this.attackFlash = null;
    this.chaseTimer = 0;
    this.entities = new EntityStore();
    this.cooldowns = new Cooldowns();
    this.effects = new TimedEffectSystem();
    this.projectiles = new ProjectileSystem();
    this.areas = new AreaEffectSystem();
    this.abilities = new AbilitySystem({
      projectiles: this.projectiles,
      areas: this.areas,
      effects: this.effects,
      cooldowns: this.cooldowns,
    });
    this.pickups = new PickupSystem();
    this.visuals = [];
    this.combatRng = new Rng(1);

    this.buildUi();

    const params = new URLSearchParams(window.location.search);
    this.captureAfter = Number(params.get('capture')) || 0;
    this.autoWalk = params.get('walk') === 'stairs';
    this.speedMultiplier = Number(params.get('speed')) || 1;
    const requestedFloor = Math.floor(Number(params.get('floor')) || 1);
    this.requestedFloor = Math.max(1, Math.min(TOTAL_FLOORS, requestedFloor));

    this.loop = new Loop({
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt),
    });

    this.resize();
    this.attachLifecycle();

    const requestedClass = params.get('class');
    const autoClass = CLASSES[requestedClass] ? requestedClass : this.captureAfter ? 'wizard' : null;
    if (autoClass) {
      const stats = this.parseStatParams(params) ?? CLASSES[autoClass].recommended;
      this.startRun(autoClass, stats, this.requestedFloor);
      this.applyDebugAbilityParams(params);
      if (this.autoWalk && this.floor.stairs) this.moveToTile(this.floor.stairs);
    } else {
      this.showCreation();
    }
  }

  applyDebugAbilityParams(params) {
    const unlock = params.get('unlock');
    if (unlock) {
      for (const abilityId of unlock.split(',').filter(Boolean)) {
        if (this.character.hasAbility(abilityId)) continue;
        this.character.abilityPoints += 1;
        this.character.unlockAbility(abilityId);
      }
      this.updateHud();
    }

    const select = params.get('select');
    if (select) this.character.selectAbility(select);

    const cast = params.get('cast');
    if (cast) {
      const ability = this.character.selectedAbility();
      if (ability) {
        const target = this.entities.nearest(this.player.x, this.player.y, {
          faction: 'enemy',
          maxDistance: ability.range + 0.5,
        });
        if (ability.target === 'enemy' && target) {
          this.castAbility(ability, { target });
        } else if (ability.target === 'self') {
          this.castAbility(ability);
        } else if (ability.target === 'point' && target) {
          this.castAbility(ability, { point: { x: target.x, y: target.y } });
        }
      }
    }

    if (params.get('panel') === '1') this.toggleAbilityPanel(true);
  }

  buildUi() {
    const byId = (id) => document.getElementById(id);
    this.hud = new Hud({
      root: byId('hud'),
      status: byId('hud-status'),
      name: byId('status-name'),
      healthFill: byId('bar-health'),
      healthLabel: byId('label-health'),
      manaFill: byId('bar-mana'),
      manaLabel: byId('label-mana'),
      xpFill: byId('bar-xp'),
      xpLabel: byId('label-xp'),
      extra: byId('status-extra'),
      target: byId('hud-target'),
      targetName: byId('target-name'),
      targetFill: byId('bar-target'),
      targetLabel: byId('label-target'),
      combatLayer: byId('combat-layer'),
      log: byId('hud-log'),
    });
    this.creator = new CharacterCreator({
      root: byId('create'),
      classesElement: byId('create-classes'),
      statsElement: byId('create-stats'),
      statRowsElement: byId('create-stat-rows'),
      pointsElement: byId('create-points'),
      abilityElement: byId('create-ability'),
      previewElement: byId('create-preview'),
      floorElement: byId('create-floor'),
      startButton: byId('create-start'),
      onStart: (classId, stats, floor) => this.startRun(classId, stats, floor),
    });
    this.abilityBar = new AbilityBar({
      root: byId('ability-bar'),
      onSelectSlot: (slot) => this.selectHotbar(slot),
    });
    this.abilityPanel = new AbilityPanel({
      root: byId('ability-panel'),
      closeButton: byId('ability-close'),
      summaryElement: byId('ability-summary'),
      statRowsElement: byId('ability-stat-rows'),
      listElement: byId('ability-list'),
      onUnlock: (abilityId) => this.unlockAbility(abilityId),
      onAssign: (slot, abilityId) => this.assignAbility(slot, abilityId),
      onAllocate: (stat) => this.allocateStat(stat),
      onClose: () => this.toggleAbilityPanel(false),
    });

    const characterButton = byId('character-button');
    characterButton?.addEventListener(
      'click',
      (event) => {
        event.currentTarget.blur();
        this.toggleAbilityPanel();
      },
      { signal: this.abort.signal },
    );
  }

  parseStatParams(params) {
    const stats = {};
    let found = false;
    for (const [param, stat] of Object.entries(STAT_PARAMS)) {
      const raw = params.get(param);
      if (raw == null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      stats[stat] = Math.floor(value);
      found = true;
    }
    return found ? stats : null;
  }

  startRun(classId, allocation = {}, startFloor = 1) {
    const floorNumber = Math.max(1, Math.min(TOTAL_FLOORS, Math.floor(Number(startFloor) || 1)));
    const character = new Character(classId);
    for (const stat of CHARACTER.statOrder) {
      const amount = Math.max(0, Math.floor(allocation?.[stat] ?? 0));
      if (amount > 0 && !character.allocateStat(stat, amount)) break;
    }
    character.baseSpeed = PLAYER.speedTilesPerSecond * this.speedMultiplier;
    character.recalculate({ fill: true });
    const skippedExperience = grantStartingFloorExperience(character, floorNumber);

    this.character = character;
    this.player = character;
    this.state = 'playing';
    this.floorNumber = floorNumber;
    this.exit = null;
    this.bossDefeated = false;
    this.lichDefeated = false;
    this.lich = null;
    this.entities.clear();
    this.projectiles.clear();
    this.areas.clear();
    this.effects.clear();
    this.cooldowns.clear();
    this.pickups.clear();
    this.visuals.length = 0;
    this.hud.clear();
    this.hud.setVisible(true);
    this.creator.hide();
    this.abilityBar.setVisible(true);
    this.abilityPanel.hide();
    this.overlayElement.hidden = true;

    this.loadFloor(randomSeed(), floorNumber);
    this.hud.showStatus();
    this.hud.addLog(
      `${character.className} enters the Lich's Den. Floor ${floorNumber} of ${this.totalFloors}.`,
      '#f3d68a',
    );
    if (skippedExperience > 0) {
      this.hud.addLog(
        `Testing shortcut: awarded ${floorNumber - 1} level${floorNumber === 2 ? '' : 's'} of experience.`,
        '#9fc4ff',
      );
    }
    this.canvas.focus();
  }

  showCreation() {
    this.state = 'create';
    this.character = null;
    this.player = null;
    this.floor = null;
    this.grid = null;
    this.exit = null;
    this.bossDefeated = false;
    this.lichDefeated = false;
    this.lich = null;
    this.floorNumber = 1;
    this.attackTargetId = null;
    this.hoveredEnemy = null;
    this.attackFlash = null;
    this.entities.clear();
    this.projectiles.clear();
    this.areas.clear();
    this.effects.clear();
    this.cooldowns.clear();
    this.pickups.clear();
    this.visuals.length = 0;
    this.hud.clear();
    this.hud.hideStatus();
    this.hud.setVisible(false);
    this.abilityBar.setVisible(false);
    this.abilityPanel.hide();
    this.creator.reset();
    this.creator.show();
    this.overlayElement.hidden = true;
    this.canvas.blur();
  }

  loadFloor(seed, floorNumber = this.floorNumber) {
    const floor = generateFloor(seed, floorNumber);
    this.floor = floor;
    this.grid = floor.grid;
    this.seed = floor.seed;
    this.floorNumber = floor.floorNumber ?? floorNumber;
    this.exit = null;
    this.bossDefeated = false;
    this.lichDefeated = false;
    this.lich = null;

    if (this.player) {
      this.player.x = floor.spawn.x;
      this.player.y = floor.spawn.y;
      this.player.clearPath();
      this.player.facing = 1;
      this.playerWorld = tileToWorld(this.player.x, this.player.y);
      this.camera = createCamera(this.playerWorld.x, this.playerWorld.y);
    }

    this.hoverTile = null;
    this.hoveredEnemy = null;
    this.clickMarker = null;
    this.attackFlash = null;
    this.attackTargetId = null;
    this.chaseTimer = 0;
    this.pathPoints = [];
    if (this.character) this.effects.retainFor(this.character);
    else this.effects.clear();
    this.projectiles.clear();
    this.areas.clear();
    this.pickups.clear();
    this.visuals.length = 0;
    this.entities.clear();
    for (const enemy of spawnFloorEnemies(floor, this.floorNumber)) this.entities.add(enemy);
    if (floor.isBoss) {
      this.lich = this.entities.add(spawnLich(floor));
    }
    this.combatRng = new Rng((this.seed ^ 0x7f4a7c15) >>> 0);
    this.updateHud();
  }

  clearTimedEffects() {
    for (const effect of [...this.effects.items]) effect.onExpire?.(effect);
    this.effects.clear();
  }

  attachLifecycle() {
    const signal = this.abort.signal;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);
    window.addEventListener('resize', () => this.resize(), { signal });

    window.addEventListener('blur', () => this.setPaused(true), { signal });
    window.addEventListener('focus', () => this.setPaused(false), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.setPaused(true);
      } else {
        this.setPaused(false);
      }
    }, { signal });

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.loop.stop();
      this.showOverlay('Graphics context lost.\nWaiting for the browser to restore WebGL...');
    }, { signal });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.restoreGraphics();
    }, { signal });
  }

  start() {
    this.input.start();
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    this.input.stop();
    this.resizeObserver?.disconnect();
    this.abort.abort();
    this.creator?.destroy();
    this.abilityBar?.destroy();
    this.abilityPanel?.destroy();
    this.renderer.dispose();
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) this.loop.resetClock();
    if (paused) this.input.consumeClicks();
  }

  restoreGraphics() {
    this.renderer.dispose();
    this.renderer = new SpriteRenderer(this.gl, RENDER.maxSprites);
    this.renderer.uploadAtlas(this.atlasCanvas);
    this.contextLost = false;
    this.resize();
    this.hideOverlay();
    this.loop.start();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDevicePixelRatio);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));

    this.view = { cssWidth, cssHeight, width, height, dpr };
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  update(dt) {
    if (this.paused || this.contextLost) return;

    if (this.state === 'create') {
      this.hud.update(dt);
      this.input.endFrame();
      return;
    }

    if (this.state === 'dead' || this.state === 'victory') {
      this.hud.update(dt);
      for (const key of this.input.consumeKeys()) {
        if (key.code === 'Enter' || key.code === 'NumpadEnter') this.showCreation();
      }
      this.input.endFrame();
      return;
    }

    this.handleKeys();
    this.handleClicks();

    this.cooldowns.update(dt);
    this.effects.update(dt);
    this.player.update(this.grid, dt);
    this.entities.update(dt);
    this.updateEnemies(dt);
    this.projectiles.update(dt, { grid: this.grid, entities: this.entities.all });
    this.areas.update(dt, { grid: this.grid, entities: this.entities.all });
    this.updateSummons(dt);
    this.updatePickups(dt);
    this.updateShrines();
    this.updateVisuals(dt);
    this.updateAttackTarget(dt);

    this.checkStairs();
    this.playerWorld = tileToWorld(this.player.x, this.player.y);
    this.pathPoints = this.player.path;
    this.followCamera(dt);
    this.updateHover();
    this.checkPlayerDeath();
    this.checkBossExit();

    if (this.clickMarker) {
      this.clickMarker.ttl -= dt;
      if (this.clickMarker.ttl <= 0) this.clickMarker = null;
    }
    if (this.attackFlash) {
      this.attackFlash.ttl -= dt;
      if (this.attackFlash.ttl <= 0) this.attackFlash = null;
    }

    this.hud.update(dt);
    this.input.endFrame();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.updateHud();
      this.hudTimer = 0.1;
    }
  }

  handleKeys() {
    for (const key of this.input.consumeKeys()) {
      const slot = hotkeySlotForCode(key.code) ?? hotkeySlotForKey(key.key);
      if (slot != null) {
        this.selectHotbar(slot);
        continue;
      }

      const menuKey = key.key?.toLowerCase();
      const pressedMenu =
        key.code === 'KeyK' || key.code === 'KeyC' || menuKey === 'k' || menuKey === 'c';
      if (pressedMenu && !key.shiftKey) {
        this.toggleAbilityPanel();
      } else if (key.code === 'KeyR') {
        this.loadFloor(key.shiftKey ? this.seed : randomSeed());
        this.hud.addLog(key.shiftKey ? 'Rebuilt the current floor.' : 'A new floor takes shape.', '#9fc4ff');
      } else if (key.code === 'KeyS') {
        if (this.floor.stairs) this.moveToTile(this.floor.stairs);
        else this.hud.addLog('There are no stairs on the boss floor.', '#9fb0d0');
      } else if (key.code === 'KeyH') {
        const healed = this.character.heal(25);
        if (healed > 0) this.hud.addFloat(this.playerWorld.x, this.playerWorld.y - 28, `+${Math.round(healed)}`, '#8ef2a6');
      } else if (key.code === 'KeyM') {
        const restored = this.character.restoreMana(25);
        if (restored > 0) this.hud.addFloat(this.playerWorld.x, this.playerWorld.y - 28, `+${Math.round(restored)} MP`, '#9ec9ff');
      } else if (key.code === 'KeyT') {
        const enemy = this.entities.nearest(this.player.x, this.player.y, { faction: 'enemy', maxDistance: 20 });
        if (enemy) this.selectTarget(enemy, true);
      } else if (key.code === 'Escape') {
        if (this.abilityPanel.isOpen()) {
          this.toggleAbilityPanel(false);
        } else {
          this.character?.resetSelection();
          this.clearTarget();
        }
      }
    }
  }

  handleClicks() {
    for (const click of this.input.consumeClicks()) {
      if (click.button === 'right') {
        this.clickCounts.right += 1;
        this.clearTarget();
        const tile = screenToTile(click.x, click.y, this.camera, this.view.cssWidth, this.view.cssHeight);
        this.moveToTile({ x: tile.x, y: tile.y });
        continue;
      }

      this.clickCounts.left += 1;
      const enemy = this.pickEnemy(click.x, click.y);
      const ability = this.character?.selectedAbility();
      if (ability) {
        this.tryAbilityClick(ability, click, enemy);
        continue;
      }

      if (enemy) {
        this.selectTarget(enemy, true);
        continue;
      }

      this.clearTarget();
      const world = screenToWorld(click.x, click.y, this.camera, this.view.cssWidth, this.view.cssHeight);
      this.clickMarker = { x: world.x, y: world.y, ttl: 0.45 };
    }
  }

  pickEnemy(sx, sy) {
    const world = screenToWorld(sx, sy, this.camera, this.view.cssWidth, this.view.cssHeight);
    let best = null;
    let bestDistance = COMBAT.pickRadiusWorld;
    for (const enemy of this.entities.items) {
      if (!enemy.alive || enemy.faction !== 'enemy') continue;
      const center = tileToWorld(enemy.x, enemy.y);
      const distance = Math.hypot(world.x - center.x, world.y - (center.y - COMBAT.pickAnchorLift));
      if (distance <= bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }

  tryAbilityClick(ability, click, pickedEnemy) {
    if (this.state !== 'playing' || !this.character) return;
    if (ability.target === 'self') {
      this.castAbility(ability);
      return;
    }
    if (ability.target === 'point') {
      const tile = screenToTile(click.x, click.y, this.camera, this.view.cssWidth, this.view.cssHeight);
      this.castAbility(ability, { point: { x: tile.x, y: tile.y } });
      return;
    }

    const target = pickedEnemy ?? this.entities.find(this.attackTargetId);
    if (!target || !target.alive) {
      this.hud.addLog(`${ability.name} needs a target.`, '#ffcf8a');
      return;
    }
    this.selectTarget(target, true);
  }

  selectTarget(enemy, attackNow) {
    this.attackTargetId = enemy.id;
    this.chaseTimer = 0;
    this.hud.setTarget(enemy);
    if (!attackNow) return;

    const ability = this.character?.selectedAbility();
    if (ability && ability.target === 'enemy') {
      if (abilityInRange(this.player, enemy, ability)) {
        this.player.clearPath();
        this.castAbility(ability, { target: enemy });
      } else {
        this.chaseTarget(enemy);
      }
      return;
    }

    if (inAttackRange(this.player, enemy)) {
      this.player.clearPath();
      this.tryBasicAttack(enemy);
    } else {
      this.chaseTarget(enemy);
    }
  }

  clearTarget() {
    this.attackTargetId = null;
    this.hud.setTarget(null);
  }

  chaseTarget(enemy) {
    if (!this.grid) return;
    const raw = findPath(this.grid, this.player.x, this.player.y, enemy.x, enemy.y);
    if (!raw || raw.length === 0) {
      this.player.clearPath();
      return;
    }
    const smoothed = smoothPath(this.grid, this.player.x, this.player.y, raw, this.player.radius);
    this.player.setPath(smoothed);
  }

  updateAttackTarget(dt) {
    if (this.attackTargetId == null) return;
    const target = this.entities.find(this.attackTargetId);
    if (!target || !target.alive) {
      this.clearTarget();
      return;
    }

    const ability = this.character?.selectedAbility();
    if (ability && ability.target === 'enemy') {
      if (abilityInRange(this.player, target, ability)) {
        if (this.player.hasPath) this.player.clearPath();
        if (this.abilities.canCast(this.character, ability, { target }).ok) {
          this.castAbility(ability, { target });
        }
        return;
      }
      this.chaseTimer -= dt;
      if (!this.player.hasPath && this.chaseTimer <= 0) {
        this.chaseTimer = COMBAT.chaseRetrySeconds;
        this.chaseTarget(target);
      }
      return;
    }

    if (ability) return;

    if (inAttackRange(this.player, target)) {
      if (this.player.hasPath) this.player.clearPath();
      this.tryBasicAttack(target);
      return;
    }

    this.chaseTimer -= dt;
    if (!this.player.hasPath && this.chaseTimer <= 0) {
      this.chaseTimer = COMBAT.chaseRetrySeconds;
      this.chaseTarget(target);
    }
  }

  tryBasicAttack(target) {
    const cooldownId = 'basic-attack';
    if (!this.cooldowns.ready(cooldownId)) return false;

    const result = resolveMeleeAttack(this.player, target, this.combatRng);
    if (!result.ok) return false;

    this.cooldowns.start(cooldownId, this.player.weapon.cooldown * (this.player.attackSpeedMultiplier ?? 1));
    this.player.facing = target.x >= this.player.x ? 1 : -1;
    const targetWorld = tileToWorld(target.x, target.y);
    this.attackFlash = {
      x: target.x,
      y: target.y,
      ttl: COMBAT.attackFlashDuration,
    };

    if (result.parried) {
      this.hud.addFloat(targetWorld.x, targetWorld.y - 30, 'parry', '#f3d68a');
      this.hud.addLog(`${target.name} parries ${this.player.className}.`, '#f3d68a');
      return true;
    }

    if (!result.hit) {
      this.hud.addFloat(targetWorld.x, targetWorld.y - 30, 'dodge', '#9fd8ff');
      this.hud.addLog(`${this.player.className} misses ${target.name}.`, '#9fd8ff');
      return true;
    }

    const dealt = this.dealDamage(target, result.damage, { color: '#ff9b9b', source: this.player });
    if (!dealt.killed) {
      this.hud.addLog(
        `${this.player.className} hits ${target.name} for ${Math.max(1, Math.round(result.damage))}.`,
        '#e9edf7',
      );
    }
    return true;
  }

  dealDamage(target, amount, { color = '#ff9b9b', source = null } = {}) {
    if (!target || !target.alive) return { applied: 0, killed: false };
    const applied = Math.max(0, target.takeDamage(amount));
    if (applied <= 0) return { applied: 0, killed: false };

    const center = tileToWorld(target.x, target.y);
    const killed = !target.alive;
    this.hud.addFloat(center.x, center.y - 30, `-${Math.max(1, Math.round(applied))}`, killed ? '#ffe08a' : color);

    if (killed && target.faction === 'enemy') this.onEnemyKilled(target);
    else if (killed && target.kind === 'summon') this.entities.remove(target);
    return { applied, killed };
  }

  onEnemyKilled(target) {
    const character = this.character;
    if (!character) return;

    const reward = Math.max(0, Math.floor(target.experience ?? 0));
    const levelBefore = character.level;
    if (reward > 0) character.awardExperience(reward);

    const center = tileToWorld(target.x, target.y);
    if (reward > 0) this.hud.addFloat(center.x, center.y - 46, `+${reward} XP`, '#f3d68a');
    this.hud.addLog(`${target.name} dies. +${reward} XP.`, '#f3d68a');

    const levels = character.level - levelBefore;
    if (levels > 0) {
      this.hud.addLog(
        `Level ${character.level}! +${levels * PROGRESSION.statPointsPerLevel} stat points, ` +
          `+${levels * PROGRESSION.abilityPointsPerLevel} ability point.`,
        '#f3d68a',
      );
      this.hud.addFloat(this.playerWorld.x, this.playerWorld.y - 52, `Level ${character.level}!`, '#f3d68a');
    }

    this.maybeDropBlood(target);
    if (target.isBoss) this.onBossDefeated(target);
    this.entities.remove(target);
    if (this.attackTargetId === target.id) this.clearTarget();
  }

  maybeDropBlood(target) {
    const blessing = this.character?.vampiricBlessing;
    if (!blessing) return;
    const drop = rollBloodDrop(blessing, this.combatRng);
    if (!drop) return;
    this.pickups.spawn({ x: target.x, y: target.y, heal: drop.heal, ttl: drop.ttl });
    const center = tileToWorld(target.x, target.y);
    this.hud.addFloat(center.x, center.y - 40, 'blood', '#ff6b8a');
  }

  castAbility(ability, { target = null, point = null } = {}) {
    if (this.state !== 'playing' || !this.character) return false;
    const check = this.abilities.canCast(this.character, ability, { target, point });
    if (!check.ok) {
      this.abilityFeedback(check, ability);
      return false;
    }

    if (ability.category === 'summon' && point && this.grid) {
      if (!this.grid.isWalkable(Math.floor(point.x), Math.floor(point.y))) {
        const x = this.playerWorld?.x ?? 0;
        const y = (this.playerWorld?.y ?? 0) - 40;
        this.hud.addFloat(x, y, 'Cannot summon there', '#ffcf8a');
        return false;
      }
    }

    const result = this.abilities.cast(this.character, ability, {
      target,
      point,
      entities: this.entities.all,
      grid: this.grid,
      rng: this.combatRng,
      hooks: {
        damage: (entity, amount) =>
          this.dealDamage(entity, amount, { color: this.abilityColor(ability), source: this.character }),
        beam: (from, to, element) => this.addBeam(from, to, element),
        explosion: (x, y, radius, element) => this.addBurst(x, y, radius, element),
        dash: (from, to) => this.addBeam(from, to, ability.element),
        summon: (abilityDef, caster, point) => this.spawnSummon(abilityDef, point),
      },
    });

    if (!result.ok) {
      this.abilityFeedback(result, ability);
      return false;
    }

    if (result.fumbled) {
      this.hud.addLog(`${ability.name} fizzles.`, '#9fd8ff');
      this.hud.addFloat(this.playerWorld.x, this.playerWorld.y - 40, 'fizzle', '#9fd8ff');
      return true;
    }

    for (const event of result.events ?? []) {
      if (event.type !== 'stun' || !event.target) continue;
      const center = tileToWorld(event.target.x, event.target.y);
      this.hud.addFloat(center.x, center.y - 52, 'stunned', '#f3d68a');
    }

    if (target) {
      this.attackFlash = { x: target.x, y: target.y, ttl: COMBAT.attackFlashDuration };
    }
    this.hud.addLog(`${this.character.className} casts ${ability.name}.`, '#c8b6ff');
    return true;
  }

  abilityFeedback(check, ability) {
    const x = this.playerWorld?.x ?? 0;
    const y = (this.playerWorld?.y ?? 0) - 40;
    switch (check.reason) {
      case 'mana':
        this.hud.addFloat(x, y, 'Not enough mana', '#9ec9ff');
        break;
      case 'cooldown':
        this.hud.addFloat(x, y, `${ability.name} ${check.remaining.toFixed(1)}s`, '#dfe6ff');
        break;
      case 'range':
        this.hud.addFloat(x, y, 'Out of range', '#ffcf8a');
        break;
      case 'target':
        this.hud.addLog(`${ability.name} needs a valid target.`, '#ffcf8a');
        break;
      default:
        break;
    }
  }

  abilityColor(ability) {
    return this.elementColor(ability.element);
  }

  elementColor(element) {
    const color = ELEMENT_COLORS[element] ?? [1, 1, 1, 1];
    return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
  }

  selectHotbar(slot) {
    if (!this.character) return false;
    const ability = this.character.hotbarAbility(slot);
    if (!ability) {
      this.hud.addLog(`Hotkey ${ABILITY_HOTKEYS[slot]} is empty.`, '#9fb0d0');
      return false;
    }
    const ok = this.character.selectHotkey(slot);
    if (ok) this.hud.addLog(`${ability.name} selected.`, '#c8b6ff');
    return ok;
  }

  toggleAbilityPanel(force = null) {
    if (!this.character || this.state !== 'playing') {
      this.abilityPanel.hide();
      return;
    }
    const open = force ?? !this.abilityPanel.isOpen();
    if (!open) {
      this.abilityPanel.hide();
      return;
    }
    this.abilityPanel.setCharacter(this.character);
    this.abilityPanel.show();
    this.abilityPanel.refresh(this.character, { cooldowns: this.cooldowns });
  }

  unlockAbility(abilityId) {
    if (!this.character) return false;
    const ability = findAbilityById(abilityId);
    if (!this.character.unlockAbility(abilityId)) return false;
    this.hud.addLog(`Unlocked ${ability?.name ?? abilityId}.`, '#f3d68a');
    this.updateHud();
    this.abilityPanel.refresh(this.character, { cooldowns: this.cooldowns });
    return true;
  }

  assignAbility(slot, abilityId) {
    if (!this.character?.assignAbility(slot, abilityId)) return false;
    const ability = findAbilityById(abilityId);
    this.hud.addLog(`${ability?.name ?? abilityId} assigned to ${ABILITY_HOTKEYS[slot]}.`, '#c8b6ff');
    this.updateHud();
    this.abilityPanel.refresh(this.character, { cooldowns: this.cooldowns });
    return true;
  }

  allocateStat(stat) {
    if (!this.character?.allocateStat(stat, 1)) return false;
    this.updateHud();
    this.abilityPanel.refresh(this.character, { cooldowns: this.cooldowns });
    return true;
  }

  spawnSummon(ability, point = null) {
    const summonDef = ability.summon ?? {};
    const spot = this.findSummonSpot(point);
    const statBonus =
      ability.damageStat === 'spell' ? this.character.spellDamageBonus : this.character.meleeDamageBonus;
    const damage = (summonDef.damage ?? 3) + statBonus * (summonDef.damageScaling ?? 0);
    const summon = createSummon(ability, this.character, { x: spot.x, y: spot.y, damage });
    this.entities.add(summon);
    this.hud.addLog(`${summon.name} answers the call.`, '#c8b6ff');
    return summon;
  }

  findSummonSpot(point = null) {
    if (point && this.grid) {
      const tx = Math.floor(point.x);
      const ty = Math.floor(point.y);
      const tile = this.grid.isWalkable(tx, ty) ? { x: tx, y: ty } : nearestWalkableTile(this.grid, tx, ty, 3);
      if (tile) return { x: tile.x + 0.5, y: tile.y + 0.5 };
    }

    const origin = this.player;
    for (let radius = 1; radius <= 3; radius++) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const x = origin.x + Math.cos(angle) * radius;
        const y = origin.y + Math.sin(angle) * radius;
        if (this.grid && !this.grid.isWalkable(Math.floor(x), Math.floor(y))) continue;
        const occupied = this.entities.items.some(
          (entity) => entity.alive && Math.hypot(entity.x - x, entity.y - y) < 0.7,
        );
        if (!occupied) return { x, y };
      }
    }
    return { x: origin.x, y: origin.y };
  }

  updateEnemies(dt) {
    if (!this.character || !this.grid) return;
    const hooks = {
      damage: (entity, amount, info = {}) =>
        this.dealDamage(entity, amount, {
          color: this.elementColor(info.element),
          source: info.source ?? null,
        }),
      beam: (from, to, element) => this.addBeam(from, to, element),
      explosion: (x, y, radius, element) => this.addBurst(x, y, radius, element),
      slash: (lich, facing, radius) => this.addSlash(lich.x, lich.y, facing, radius, 'melee'),
      summon: (lich, minions) => {
        this.addBurst(lich.x, lich.y, 2.2, 'arcane');
        this.hud.addFloat(this.playerWorld?.x ?? 0, (this.playerWorld?.y ?? 0) - 44, 'SUMMON', '#c8b6ff');
        this.hud.addLog(`${minions.length} undead claw out of the floor.`, '#c8b6ff');
      },
      push: (lich, target, result) => {
        this.addBeam(lich, result.from, 'arcane');
        this.hud.addFloat(this.playerWorld?.x ?? 0, (this.playerWorld?.y ?? 0) - 44, 'pushed', '#c8b6ff');
      },
      pull: (lich, target, result) => {
        this.addBeam(lich, result.from, 'arcane');
        this.hud.addFloat(this.playerWorld?.x ?? 0, (this.playerWorld?.y ?? 0) - 44, 'pulled', '#c8b6ff');
      },
      log: (message, color) => this.hud.addLog(message, color),
      remove: (entity) => this.entities.remove(entity),
      add: (entity) => this.entities.add(entity),
    };
    const context = {
      player: this.character,
      entities: this.entities.all,
      grid: this.grid,
      rng: this.combatRng,
      abilitySystem: this.abilities,
      hooks,
      onMeleeHit: (enemy, target, result) => this.onEnemyMeleeHit(enemy, target, result),
    };

    for (const enemy of [...this.entities.items]) {
      if (enemy.kind !== 'enemy') continue;
      if (!enemy.alive) {
        this.entities.remove(enemy);
        if (this.attackTargetId === enemy.id) this.clearTarget();
        continue;
      }
      if (enemy.isLich) updateLich(enemy, dt, context);
      else updateEnemy(enemy, dt, context);
    }
  }

  onEnemyMeleeHit(enemy, target, result) {
    const center = tileToWorld(target.x, target.y);
    const targetName = target.className ?? target.name ?? 'target';
    if (result.parried) {
      this.hud.addFloat(center.x, center.y - 30, 'parry', '#f3d68a');
      this.hud.addLog(`${targetName} parries ${enemy.name}.`, '#f3d68a');
      return;
    }
    if (!result.hit) {
      this.hud.addFloat(center.x, center.y - 30, 'dodge', '#9fd8ff');
      this.hud.addLog(`${targetName} dodges ${enemy.name}.`, '#9fd8ff');
      return;
    }
    if (result.damage > 0) {
      this.hud.addFloat(center.x, center.y - 30, `-${Math.max(1, Math.round(result.damage))}`, '#ff9b9b');
      this.hud.addLog(`${enemy.name} hits ${targetName} for ${Math.max(1, Math.round(result.damage))}.`, '#ffb0b0');
    }
    if (!target.alive && target.kind === 'summon') {
      this.entities.remove(target);
      this.hud.addLog(`${target.name} crumbles.`, '#9fb0d0');
    }
  }

  updateSummons(dt) {
    for (const summon of [...this.entities.items]) {
      if (summon.kind !== 'summon' || summon.faction !== 'ally') continue;
      const outcome = updateSummon(summon, dt, {
        entities: this.entities.items,
        grid: this.grid,
        onBeam: (from, to, element) => this.addBeam(from, to, element),
        onDamage: (target, amount) =>
          this.dealDamage(target, amount, {
            color: this.elementColor(summon.element),
            source: summon,
          }),
      });
      if (!outcome.removed) continue;
      const center = tileToWorld(summon.x, summon.y);
      this.hud.addFloat(center.x, center.y - 30, outcome.reason === 'dead' ? 'crumbles' : 'fades', '#9fb0d0');
      this.entities.remove(summon);
    }
  }

  updatePickups(dt) {
    this.pickups.update(dt, {
      player: this.character,
      onCollect: (pickup) => {
        const healed = this.character.heal(pickup.healAmount);
        const center = tileToWorld(pickup.x, pickup.y);
        this.hud.addFloat(center.x, center.y - 30, `+${Math.round(healed)}`, '#8ef2a6');
        this.hud.addLog(`${pickup.name} restores ${Math.round(healed)} health.`, '#8ef2a6');
      },
    });
  }

  updateShrines() {
    const shrineList = this.floor?.shrines;
    if (!shrineList || shrineList.length === 0 || !this.character?.alive) return;
    const reach = 0.75 + (this.player.radius ?? 0);
    const remaining = [];
    for (const shrine of shrineList) {
      if (Math.hypot(shrine.x - this.player.x, shrine.y - this.player.y) <= reach) {
        this.activateShrine(shrine);
      } else {
        remaining.push(shrine);
      }
    }
    this.floor.shrines = remaining;
  }

  activateShrine(shrine) {
    const character = this.character;
    const type = SHRINES.types[shrine.type];
    if (!character || !type) return false;

    character.addShrine(shrine.type, shrine.magnitude);
    const duration = SHRINES.duration;
    this.effects.add({
      target: character,
      name: `shrine:${shrine.type}`,
      label: type.name,
      duration,
      magnitude: shrine.magnitude,
      data: { shrine: shrine.type },
      onExpire: () => {
        character.removeShrine(shrine.type, shrine.magnitude);
        this.hud.addLog(`${type.name} fades.`, '#9fb0d0');
        this.updateHud();
      },
    });

    const center = tileToWorld(shrine.x, shrine.y);
    this.hud.addFloat(center.x, center.y - 34, type.description, type.hudColor);
    this.hud.addLog(`${type.name}: ${type.description} for ${duration}s.`, type.hudColor);
    this.updateHud();
    return true;
  }

  onBossDefeated(target) {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    if (target?.isLich) this.lichDefeated = true;
    const exitSpot = this.floor?.exitSpot ?? { x: target.x, y: target.y };
    this.exit = { x: exitSpot.x, y: exitSpot.y };
    const center = tileToWorld(this.exit.x, this.exit.y);
    this.hud.addFloat(center.x, center.y - 44, 'EXIT OPEN', '#9fd8ff');
    this.hud.addLog('The Lich falls. An exit tears open in the room.', '#f3d68a');
    if (target?.isLich) {
      this.hud.addLog('Its surviving summons keep fighting. Reach the exit to escape.', '#ffb0b0');
      for (const entity of this.entities?.items ?? []) {
        if (!entity?.alive || entity.summonedBy !== target.id) continue;
        entity.aggroed = true;
        entity.deaggroRadius = Infinity;
        entity.leashRadius = Infinity;
      }
    }
  }

  checkBossExit() {
    if (this.state !== 'playing' || !this.exit || !this.character?.alive) return;
    if (Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) > 0.7) return;
    this.completeRun();
  }

  completeRun() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.player.clearPath();
    this.clearTarget();
    this.character.resetSelection();
    this.abilityBar.setVisible(false);
    this.abilityPanel.hide();
    this.hud.addLog(`${this.character.className} escapes the Lich's Den!`, '#f3d68a');
    this.showOverlay('You escaped the Lich\'s Den!\n\nPress Enter to create a new character.');
  }

  addBeam(from, to, element = null) {
    this.visuals.push({
      type: 'beam',
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      ttl: 0.18,
      maxTtl: 0.18,
      color: ELEMENT_COLORS[element] ?? ELEMENT_COLORS.arcane,
    });
  }

  addBurst(x, y, radius, element = null) {
    this.visuals.push({
      type: 'burst',
      x,
      y,
      radius,
      ttl: 0.32,
      maxTtl: 0.32,
      color: ELEMENT_COLORS[element] ?? ELEMENT_COLORS.arcane,
    });
  }

  addSlash(x, y, facing = 1, radius = 2.5, element = null) {
    this.visuals.push({
      type: 'slash',
      x,
      y,
      facing,
      radius,
      ttl: 0.28,
      maxTtl: 0.28,
      color: ELEMENT_COLORS[element] ?? ELEMENT_COLORS.melee,
    });
  }

  updateVisuals(dt) {
    for (const visual of this.visuals) visual.ttl -= dt;
    this.visuals = this.visuals.filter((visual) => visual.ttl > 0);
  }

  checkPlayerDeath() {
    if (this.state !== 'playing') return;
    if (!this.character || this.character.alive) return;
    this.state = 'dead';
    this.player.clearPath();
    this.clearTarget();
    this.character.resetSelection();
    for (const summon of this.entities.byFaction('ally')) this.entities.remove(summon);
    this.projectiles.clear();
    this.areas.clear();
    this.pickups.clear();
    this.clearTimedEffects();
    this.visuals.length = 0;
    this.abilityBar.setVisible(false);
    this.abilityPanel.hide();
    this.hud.addLog(`${this.character.className} has fallen.`, '#ff9b9b');
    this.showOverlay('You died.\n\nPress Enter to create a new character.');
  }

  moveToTile(point) {
    if (!this.grid || !this.player) return;
    const targetX = Math.floor(point.x);
    const targetY = Math.floor(point.y);
    const target = this.grid.isWalkable(targetX, targetY)
      ? { x: targetX, y: targetY }
      : nearestWalkableTile(this.grid, targetX, targetY, 6);
    if (!target) {
      this.player.clearPath();
      return;
    }

    const raw = findPath(this.grid, this.player.x, this.player.y, target.x, target.y);
    if (!raw || raw.length === 0) {
      this.player.clearPath();
      return;
    }
    const smoothed = smoothPath(this.grid, this.player.x, this.player.y, raw, this.player.radius);
    this.player.setPath(smoothed);
  }

  checkStairs() {
    if (!this.floor?.stairs || this.floor.isBoss) return;
    const dx = this.floor.stairs.x - this.player.x;
    const dy = this.floor.stairs.y - this.player.y;
    if (Math.hypot(dx, dy) > 0.6) return;
    const nextFloor = this.floorNumber + 1;
    this.loadFloor(nextSeed(this.seed), nextFloor);
    this.hud.addLog(
      this.floor.isBoss
        ? `Descending to floor ${nextFloor} — the boss floor.`
        : `Descending to floor ${nextFloor} of ${this.totalFloors}.`,
      '#9fc4ff',
    );
  }

  followCamera(dt) {
    followCameraStep(this.camera, this.playerWorld, dt, RENDER.cameraFollowSharpness);
  }

  updateHover() {
    if (!this.input.mouse.inside) {
      this.hoverTile = null;
      this.hoveredEnemy = null;
      return;
    }
    this.hoverTile = screenToTile(
      this.input.mouse.x,
      this.input.mouse.y,
      this.camera,
      this.view.cssWidth,
      this.view.cssHeight,
    );
    this.hoveredEnemy = this.pickEnemy(this.input.mouse.x, this.input.mouse.y);
  }

  visibleTileBounds() {
    const corners = [
      [0, 0],
      [this.view.cssWidth, 0],
      [0, this.view.cssHeight],
      [this.view.cssWidth, this.view.cssHeight],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [sx, sy] of corners) {
      const tile = screenToTile(sx, sy, this.camera, this.view.cssWidth, this.view.cssHeight);
      minX = Math.min(minX, tile.x);
      minY = Math.min(minY, tile.y);
      maxX = Math.max(maxX, tile.x);
      maxY = Math.max(maxY, tile.y);
    }
    return {
      minX: Math.max(0, Math.floor(minX) - 2),
      minY: Math.max(0, Math.floor(minY) - 2),
      maxX: Math.min(this.grid.width - 1, Math.ceil(maxX) + 2),
      maxY: Math.min(this.grid.height - 1, Math.ceil(maxY) + 2),
    };
  }

  render(dt) {
    if (this.contextLost) return;
    this.trackFps(dt);

    const renderer = this.renderer;
    renderer.begin();

    if (!this.floor) {
      renderer.flush(this.view.width, this.view.height, { x: 0, y: 0 }, this.view.dpr, TUNING.background);
      this.hud.renderOverlays(this.camera ?? { x: 0, y: 0 }, this.view.cssWidth, this.view.cssHeight);
      this.maybeCapture();
      return;
    }

    const bounds = this.visibleTileBounds();
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const center = tileToWorld(tx + 0.5, ty + 0.5);
        const alt = (tx + ty) % 2 === 0;
        renderer.draw(alt ? 'floorAlt' : 'floor', center.x, center.y);
      }
    }

    if (this.floor.stairs) {
      const stairsCenter = tileToWorld(this.floor.stairs.x, this.floor.stairs.y);
      renderer.draw('stairs', stairsCenter.x, stairsCenter.y);
    }

    for (const shrine of this.floor.shrines ?? []) {
      const center = tileToWorld(shrine.x, shrine.y);
      const bob = Math.sin(performance.now() / 320 + shrine.id) * 2;
      renderer.draw('shadow', center.x, center.y, { scale: 0.45 });
      renderer.draw(shrine.sprite, center.x, center.y + bob);
    }

    if (this.exit) {
      const center = tileToWorld(this.exit.x, this.exit.y);
      const pulse = 1 + Math.sin(performance.now() / 260) * 0.08;
      renderer.draw('highlight', center.x, center.y, {
        scale: 0.6 * pulse,
        tint: [0.55, 0.85, 1, 0.35],
      });
      renderer.draw('exitPortal', center.x, center.y - 6, { scale: pulse });
    }

    const target = this.entities.find(this.attackTargetId);
    if (target?.alive) {
      const center = tileToWorld(target.x, target.y);
      renderer.draw('highlight', center.x, center.y, { tint: [1, 0.32, 0.32, 0.72] });
    }

    for (const point of this.pathPoints) {
      const center = tileToWorld(point.x, point.y);
      renderer.draw('highlight', center.x, center.y, {
        tint: [0.4, 0.8, 1, 0.5],
        scale: 0.22,
      });
    }

    if (this.hoverTile) {
      const tx = Math.floor(this.hoverTile.x);
      const ty = Math.floor(this.hoverTile.y);
      if (this.grid.inBounds(tx, ty)) {
        const center = tileToWorld(tx + 0.5, ty + 0.5);
        renderer.draw('highlight', center.x, center.y, { tint: [1, 0.9, 0.45, 0.85] });
      }
    }

    if (this.clickMarker) {
      const life = Math.max(0, this.clickMarker.ttl / 0.45);
      renderer.draw('highlight', this.clickMarker.x, this.clickMarker.y, {
        tint: [1, 0.35, 0.35, 0.9 * life],
        scale: 0.5 + 0.5 * (1 - life),
      });
    }

    for (const area of this.areas.effects) {
      const center = tileToWorld(area.x, area.y);
      const life = area.duration > 0 ? Math.max(0, Math.min(1, area.remaining / area.duration)) : 1;
      renderer.draw('highlight', center.x, center.y, {
        scale: area.radius,
        tint: [0.55, 0.85, 1, 0.16 + 0.1 * life],
      });
      renderer.draw('highlight', center.x, center.y, {
        scale: area.radius * (1.4 - 0.4 * life),
        tint: [0.75, 0.95, 1, 0.1 * life],
      });
    }

    for (const projectile of this.projectiles.projectiles) {
      const center = tileToWorld(projectile.x, projectile.y);
      const color = ELEMENT_COLORS[projectile.element] ?? [1, 1, 1, 1];
      renderer.draw('spark', center.x, center.y - 14, { scale: 5, tint: color });
    }

    for (const pickup of this.pickups.items) {
      const center = tileToWorld(pickup.x, pickup.y);
      const bob = Math.sin(performance.now() / 260 + pickup.id) * 2;
      renderer.draw('shadow', center.x, center.y, { scale: 0.35 });
      renderer.draw(pickup.sprite, center.x, center.y + bob, { tint: [1, 0.78, 0.88, 1] });
    }

    const occluders = [];
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        if (!this.grid.isBlocked(tx, ty)) continue;
        const center = tileToWorld(tx + 0.5, ty + 0.5);
        occluders.push({ y: center.y + 16, kind: 'wall', x: center.x });
      }
    }

    for (const enemy of this.entities.items) {
      if (!enemy.alive || enemy.kind === 'pickup') continue;
      const center = tileToWorld(enemy.x, enemy.y);
      occluders.push({ y: center.y, kind: 'enemy', x: center.x, enemy, center });
    }

    const feet = this.playerWorld;
    occluders.push({
      y: feet.y,
      kind: 'player',
      x: feet.x,
      facing: this.player.facing,
      moving: this.player.moving,
    });

    occluders.sort((a, b) => a.y - b.y || a.x - b.x);

    for (const item of occluders) {
      if (item.kind === 'wall') {
        renderer.draw('wall', item.x, item.y);
      } else if (item.kind === 'enemy') {
        const { enemy, center } = item;
        if (enemy.windup > 0 && enemy.windupTime > 0) {
          const charge = Math.max(0, Math.min(1, 1 - enemy.windup / enemy.windupTime));
          renderer.draw('highlight', center.x, center.y, {
            scale: 0.55 + charge * 0.45,
            tint: [1, 0.3, 0.24, 0.35 + charge * 0.5],
          });
        }
        const enemyScale = enemy.isLich ? 1.75 : enemy.isBoss ? 1.35 : 1;
        renderer.draw('shadow', center.x, center.y, { scale: 0.8 * enemyScale });
        renderer.draw(enemy.sprite, center.x, center.y, { flipX: enemy.facing < 0, scale: enemyScale });
        if ((enemy.stunRemaining ?? 0) > 0) {
          const spin = (performance.now() / 180) % (Math.PI * 2);
          for (let i = 0; i < 3; i++) {
            const angle = spin + (i / 3) * Math.PI * 2;
            renderer.draw('spark', center.x + Math.cos(angle) * 10, center.y - 48 + Math.sin(angle) * 4, {
              scale: 3,
              tint: [1, 0.88, 0.4, 0.95],
            });
          }
        }
        const width = enemy.isLich ? 52 : 28;
        const barY = center.y - (enemy.isLich ? 62 : 42);
        renderer.draw('bar', center.x - width / 2, barY, {
          scaleX: width / 2,
          scaleY: 2,
          tint: [0, 0, 0, 0.7],
        });
        if (enemy.health > 0) {
          renderer.draw('bar', center.x - width / 2, barY, {
            scaleX: (width / 2) * enemy.healthRatio,
            scaleY: 2,
            tint: [0.88, 0.3, 0.3, 0.95],
          });
        }
      } else {
        const bob = item.moving ? Math.sin(performance.now() / 70) * 1.5 : 0;
        if (this.character?.hasBuff?.('manaShield')) {
          renderer.draw('highlight', feet.x, feet.y, { scale: 0.72, tint: [0.62, 0.5, 1, 0.38] });
        }
        if (this.character?.hasBuff?.('berserkersRage')) {
          renderer.draw('highlight', feet.x, feet.y, { scale: 0.78, tint: [1, 0.36, 0.24, 0.42] });
        }
        renderer.draw('shadow', feet.x, feet.y, { tint: [1, 1, 1, 1] });
        renderer.draw(this.player.sprite ?? 'wizard', feet.x, feet.y + bob, { flipX: item.facing < 0 });
      }
    }

    for (const visual of this.visuals) {
      if (visual.type !== 'burst') continue;
      const center = tileToWorld(visual.x, visual.y);
      const life = Math.max(0, visual.ttl / visual.maxTtl);
      const scale = visual.radius * (1.35 - 0.45 * life);
      renderer.draw('highlight', center.x, center.y, {
        scale,
        tint: [visual.color[0], visual.color[1], visual.color[2], 0.45 * life],
      });
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        renderer.draw('spark', center.x + Math.cos(angle) * scale * 24, center.y - 12 + Math.sin(angle) * scale * 12, {
          scale: 3 * life + 1,
          tint: [visual.color[0], visual.color[1], visual.color[2], 0.9 * life],
        });
      }
    }

    for (const visual of this.visuals) {
      if (visual.type !== 'beam') continue;
      const life = Math.max(0, visual.ttl / visual.maxTtl);
      const segments = 8;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = visual.from.x + (visual.to.x - visual.from.x) * t;
        const y = visual.from.y + (visual.to.y - visual.from.y) * t;
        const center = tileToWorld(x, y);
        renderer.draw('spark', center.x, center.y - 18, {
          scale: 4 * life + 1,
          tint: [visual.color[0], visual.color[1], visual.color[2], 0.9 * life],
        });
      }
    }

    for (const visual of this.visuals) {
      if (visual.type !== 'slash') continue;
      const center = tileToWorld(visual.x, visual.y);
      const life = Math.max(0, visual.ttl / visual.maxTtl);
      renderer.draw('slash', center.x + visual.facing * 18, center.y - 22, {
        scale: 0.9 + visual.radius * 0.18,
        tint: [visual.color[0], visual.color[1], visual.color[2], life],
        flipX: visual.facing < 0,
      });
    }

    if (this.attackFlash) {
      const center = tileToWorld(this.attackFlash.x, this.attackFlash.y);
      const life = Math.max(0, this.attackFlash.ttl / COMBAT.attackFlashDuration);
      renderer.draw('slash', center.x, center.y - 22, {
        scale: 0.85 + (1 - life) * 0.45,
        tint: [1, 0.86, 0.45, life],
        flipX: this.player.facing < 0,
      });
    }

    renderer.flush(this.view.width, this.view.height, this.camera, this.view.dpr, TUNING.background);
    this.hud.renderOverlays(this.camera, this.view.cssWidth, this.view.cssHeight);
    this.maybeCapture();
  }

  maybeCapture() {
    if (!this.captureAfter) return;
    this.captureFrame = (this.captureFrame ?? 0) + 1;
    if (this.captureFrame < this.captureAfter) return;
    this.captureAfter = 0;
    this.captureFramebuffer();
  }

  captureFramebuffer() {
    const gl = this.gl;
    const width = this.view.width;
    const height = this.view.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const flipped = new Uint8ClampedArray(pixels.length);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const source = (height - 1 - y) * rowSize;
      flipped.set(pixels.subarray(source, source + rowSize), y * rowSize);
    }

    const snapshot = document.createElement('canvas');
    snapshot.width = width;
    snapshot.height = height;
    snapshot.getContext('2d').putImageData(new ImageData(flipped, width, height), 0, 0);
    snapshot.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;z-index:1;pointer-events:none;image-rendering:pixelated';
    document.body.appendChild(snapshot);
  }

  trackFps(dt) {
    this.frameSamples += 1;
    this.frameSampleTime += dt;
    if (this.frameSampleTime >= 0.5) {
      this.fps = this.frameSamples / this.frameSampleTime;
      this.frameSamples = 0;
      this.frameSampleTime = 0;
    }
  }

  updateHud() {
    if (!this.debugElement) return;
    const tile = this.hoverTile
      ? `${Math.floor(this.hoverTile.x)}, ${Math.floor(this.hoverTile.y)}`
      : 'n/a';
    let blocked = 'n/a';
    if (this.hoverTile && this.grid) {
      blocked = this.grid.isBlocked(Math.floor(this.hoverTile.x), Math.floor(this.hoverTile.y))
        ? 'wall'
        : 'floor';
    }
    const dest = this.player?.destination
      ? `${this.player.destination.x.toFixed(1)}, ${this.player.destination.y.toFixed(1)}`
      : 'none';
    const target = this.entities.find(this.attackTargetId);
    const targetText = target ? `${target.name} ${Math.ceil(target.health)}/${target.maxHealth}` : 'none';
    const character = this.character;
    const selectedAbility = character?.selectedAbility();
    const buffs = character
      ? this.effects.activeFor(character).map((effect) => ({
          name: effect.label ?? findAbilityById(effect.name)?.name ?? effect.name,
          remaining: effect.remaining,
        }))
      : [];

    const enemies = this.entities.byFaction('enemy');
    this.debugElement.textContent = [
      `fps ${this.fps.toFixed(0)}   sprites ${this.renderer.spriteCount}   dpr ${this.view.dpr}`,
      `canvas ${this.view.width}x${this.view.height} (css ${this.view.cssWidth}x${this.view.cssHeight})`,
      character
        ? `${character.className} lv${character.level} hp ${Math.ceil(character.health)}/${character.maxHealth} ` +
          `mp ${Math.ceil(character.mana)}/${character.maxMana} xp ${character.experience}/${character.experienceToNextLevel}`
        : 'no character',
      character
        ? `str ${character.stats.strength} int ${character.stats.intelligence} vit ${character.stats.vitality} ` +
          `dex ${character.stats.dexterity}   points ${character.statPoints}/${character.abilityPoints}`
        : '',
      this.floor
        ? `seed ${this.seed}   floor ${this.floorNumber}/${this.totalFloors}` +
          `${this.floor.isBoss ? ' (boss)' : ''}   rooms ${this.floor.roomCount}   ` +
          `shrines ${this.floor.shrines?.length ?? 0}   exit ${this.exit ? 'open' : 'closed'}`
        : '',
      this.player
        ? `player ${this.player.x.toFixed(2)}, ${this.player.y.toFixed(2)}   dest ${dest}`
        : '',
      this.floor
        ? this.floor.stairs
          ? `stairs ${this.floor.stairs.x.toFixed(1)}, ${this.floor.stairs.y.toFixed(1)}`
          : 'stairs none'
        : '',
      `target ${targetText}   enemies ${enemies.length}   ` +
        `aggro ${enemies.filter((enemy) => enemy.aggroed).length}   ` +
        `summons ${this.entities.byFaction('ally').length}   pickups ${this.pickups.size}`,
      `cast ${selectedAbility ? selectedAbility.name : 'basic attack'}   ` +
        `hotbar ${character ? character.hotbar.map((id) => id ?? '-').join(',') : 'n/a'}`,
      `cursor tile ${tile} (${blocked})   clicks L${this.clickCounts.left} R${this.clickCounts.right}   ` +
        `last key ${this.input.lastKey ?? 'none'}`,
      `map The Lich's Den   ${this.paused ? 'PAUSED' : this.state}   errors ${window.__bbErrors?.length ?? 0}`,
      window.__bbErrors?.length ? `last error: ${window.__bbErrors[window.__bbErrors.length - 1].slice(0, 120)}` : '',
    ].filter(Boolean).join('\n');

    if (character) {
      this.hud.setStatus(character, {
        floorNumber: this.floorNumber,
        totalFloors: this.totalFloors,
        seed: this.seed,
        buffs,
        isBossFloor: this.floor?.isBoss ?? false,
      });
      this.hud.setTarget(target ?? this.hoveredEnemy);
      this.abilityBar.refresh(character, { cooldowns: this.cooldowns });
      if (this.abilityPanel.isOpen()) {
        this.abilityPanel.refresh(character, { cooldowns: this.cooldowns });
      }
    }
  }

  showOverlay(message) {
    if (!this.overlayElement) return;
    this.overlayElement.textContent = message;
    this.overlayElement.hidden = false;
  }

  hideOverlay() {
    if (!this.overlayElement) return;
    this.overlayElement.hidden = true;
  }
}
