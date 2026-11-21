import test from 'node:test';
import assert from 'node:assert/strict';

import { ABILITIES } from '../src/config.js';
import { Game } from '../src/core/game.js';
import { AbilitySystem } from '../src/world/abilitySystem.js';
import { abilitiesForClass, findAbility } from '../src/world/abilities.js';
import { AreaEffectSystem } from '../src/world/area.js';
import { Character } from '../src/world/character.js';
import { reduceDamage, rollMeleeDamage } from '../src/world/combat.js';
import { Cooldowns, TimedEffectSystem } from '../src/world/effects.js';
import { Enemy, spawnFloorEnemies } from '../src/world/enemies.js';
import { EntityStore } from '../src/world/entity.js';
import { BOSS_FLOOR, TOTAL_FLOORS, generateFloor } from '../src/world/floor.js';
import { Grid } from '../src/world/grid.js';
import { visibleWorldBounds, isWorldPointVisible } from '../src/gfx/iso.js';
import { summonMinions } from '../src/world/lich.js';
import { findPath } from '../src/world/pathfinding.js';
import { PickupSystem } from '../src/world/pickups.js';
import { ProjectileSystem } from '../src/world/projectile.js';
import { Rng } from '../src/world/rng.js';
import { createSummon } from '../src/world/summons.js';

const SEEDS = [1, 4242, 987654321];

function makeSystems() {
  const projectiles = new ProjectileSystem();
  const areas = new AreaEffectSystem();
  const effects = new TimedEffectSystem();
  const cooldowns = new Cooldowns();
  return {
    projectiles,
    areas,
    effects,
    cooldowns,
    abilities: new AbilitySystem({ projectiles, areas, effects, cooldowns }),
  };
}

function makeHud() {
  const logs = [];
  return {
    logs,
    addLog(message) {
      logs.push(message);
    },
    addFloat() {},
    setTarget() {},
    setStatus() {},
    clear() {},
    showStatus() {},
    hideStatus() {},
    setVisible() {},
    update() {},
    renderOverlays() {},
  };
}

function makeHarness(classId = 'wizard') {
  const systems = makeSystems();
  const character = new Character(classId);
  character.recalculate({ fill: true });

  const game = Object.assign(Object.create(Game.prototype), {
    canvas: {
      width: 1,
      height: 1,
      focus() {},
      blur() {},
      getBoundingClientRect() {
        return { width: 800, height: 600 };
      },
    },
    input: {
      mouse: { inside: false },
      consumeClicks() {},
      consumeKeys() {
        return [];
      },
    },
    debugElement: null,
    overlayElement: { hidden: true, textContent: '' },
    view: { cssWidth: 800, cssHeight: 600, width: 800, height: 600, dpr: 1 },
    hoverTile: null,
    hoveredEnemy: null,
    clickMarker: null,
    paused: false,
    contextLost: false,
    state: 'playing',
    character,
    player: character,
    floor: null,
    grid: null,
    seed: 0,
    floorNumber: 1,
    totalFloors: TOTAL_FLOORS,
    exit: null,
    bossDefeated: false,
    lichDefeated: false,
    lich: null,
    attackTargetId: null,
    attackFlash: null,
    chaseTimer: 0,
    pathPoints: [],
    speedMultiplier: 1,
    entities: new EntityStore(),
    cooldowns: systems.cooldowns,
    effects: systems.effects,
    projectiles: systems.projectiles,
    areas: systems.areas,
    abilities: systems.abilities,
    pickups: new PickupSystem(),
    visuals: [],
    combatRng: new Rng(1),
    hud: makeHud(),
    abilityBar: { setVisible() {}, refresh() {} },
    abilityPanel: {
      isOpen() {
        return false;
      },
      hide() {},
      show() {},
      refresh() {},
      setCharacter() {},
    },
    creator: { show() {}, hide() {}, reset() {} },
    updateHud() {},
  });

  return game;
}

function walkToStairs(game) {
  assert.ok(game.floor?.stairs, 'the floor has stairs');
  game.player.x = game.floor.stairs.x;
  game.player.y = game.floor.stairs.y;
  game.checkStairs();
}

function surviveRun(game) {
  while (game.floorNumber < TOTAL_FLOORS) {
    walkToStairs(game);
  }
  assert.equal(game.floorNumber, TOTAL_FLOORS);
  assert.equal(game.floor.isBoss, true);
  assert.ok(game.lich?.isLich, 'the Lich is present');
}

function finishRun(game) {
  const lich = game.lich;
  game.dealDamage(lich, lich.health);
  assert.equal(game.bossDefeated, true);
  assert.equal(game.lichDefeated, true);
  assert.equal(lich.alive, false, 'the Lich dies');
  assert.ok(game.exit, 'the exit opens');
  game.player.x = game.exit.x;
  game.player.y = game.exit.y;
  game.checkBossExit();
  assert.equal(game.state, 'victory');
}

test('both classes can run all five floors, defeat the Lich and escape', () => {
  for (const classId of ['wizard', 'warrior']) {
    const game = makeHarness(classId);
    game.startRun(classId, { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 }, 1);

    assert.equal(game.state, 'playing');
    assert.equal(game.floorNumber, 1);
    assert.equal(game.character.classId, classId);

    surviveRun(game);
    finishRun(game);
  }
});

test('every active ability in both complete kits casts through the shared runtime', () => {
  for (const classId of ['wizard', 'warrior']) {
    const systems = makeSystems();
    const caster = new Character(classId);
    caster.abilityPoints = 20;
    caster.spellFumbleChance = 0;

    for (const ability of abilitiesForClass(classId)) caster.unlockAbility(ability.id);

    const actives = ABILITIES[classId].filter((ability) => ability.kind === 'active');
    const passives = ABILITIES[classId].filter((ability) => ability.kind === 'passive');
    assert.equal(caster.unlockedAbilities.length, ABILITIES[classId].length);
    for (const passive of passives) {
      assert.equal(caster.hotbar.includes(passive.id), false, `${passive.id} never occupies a hotkey`);
    }
    for (const active of actives) {
      assert.equal(caster.hotbar.includes(active.id), true, `${active.id} is assigned`);
    }

    const grid = new Grid(24, 24, 0);
    for (const ability of actives) {
      const target = new Enemy('trainingDummy', caster.x + 1.5, caster.y, { floor: 1 });
      const entities = [caster, target];
      caster.mana = 999;
      systems.cooldowns.clear();

      const options = {
        entities,
        grid,
        rng: new Rng(17),
        hooks: {
          damage: (entity, amount) => ({ applied: entity.takeDamage(amount), killed: !entity.alive }),
          beam() {},
          explosion() {},
          dash() {},
          summon: (abilityDef, summoner, point) => {
            const summon = createSummon(abilityDef, summoner, { x: point?.x ?? 2, y: point?.y ?? 2, damage: 1 });
            entities.push(summon);
            return summon;
          },
        },
      };
      if (ability.target === 'enemy') options.target = target;
      if (ability.target === 'point') options.point = { x: caster.x + 2, y: caster.y };

      const result = systems.abilities.cast(caster, ability, options);
      assert.equal(result.ok, true, `${classId} ${ability.id} casts`);
    }
  }
});

test('player abilities and projectiles do not hit allied summons', () => {
  const systems = makeSystems();
  const wizard = new Character('wizard');
  wizard.abilityPoints = 5;
  wizard.mana = 999;
  wizard.spellFumbleChance = 0;
  wizard.unlockAbility('fireball');
  wizard.unlockAbility('chainLightning');
  wizard.x = 5;
  wizard.y = 5;

  const golemAbility = findAbility('wizard', 'summonGolem');
  const ally = createSummon(golemAbility, wizard, { x: 8.6, y: 5, damage: 1 });
  const enemy = new Enemy('skeleton', 9, 5, { floor: 1 });
  const secondEnemy = new Enemy('skeleton', 10.5, 5, { floor: 1 });
  const grid = new Grid(24, 24, 0);
  const entities = [wizard, ally, enemy, secondEnemy];
  const hits = [];

  const fireball = findAbility('wizard', 'fireball');
  systems.abilities.cast(wizard, fireball, {
    target: enemy,
    entities,
    grid,
    rng: new Rng(21),
    hooks: {
      damage: (target, amount) => {
        const applied = target.takeDamage(amount);
        hits.push(target);
        return { applied, killed: !target.alive };
      },
      beam() {},
      explosion() {},
    },
  });
  for (let i = 0; i < 240 && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid, entities });
  }

  assert.equal(enemy.health < enemy.maxHealth, true, 'the hostile target is hit');
  assert.equal(ally.health, ally.maxHealth, 'the golem never takes fireball damage');
  assert.equal(hits.includes(ally), false);

  systems.cooldowns.clear();
  wizard.mana = 999;
  const chain = findAbility('wizard', 'chainLightning');
  const chainHits = [];
  systems.abilities.cast(wizard, chain, {
    target: secondEnemy,
    entities,
    grid,
    rng: new Rng(5),
    hooks: {
      damage: (target, amount) => {
        const applied = target.takeDamage(amount);
        chainHits.push(target);
        return { applied, killed: !target.alive };
      },
      beam() {},
      explosion() {},
    },
  });
  assert.equal(chainHits.includes(ally), false, 'chain lightning never arcs to the golem');
  assert.equal(ally.health, ally.maxHealth);
});

test('enemy area damage still hurts the player side, including summons', () => {
  const systems = makeSystems();
  const mage = new Enemy('skeletonMage', 5, 5, { floor: 1 });
  const player = new Character('wizard');
  player.x = 9;
  player.y = 5;
  player.recalculate({ fill: true });
  const golem = createSummon(findAbility('wizard', 'summonGolem'), player, { x: 8.5, y: 5, damage: 1 });
  const grid = new Grid(24, 24, 0);
  const entities = [mage, player, golem];

  const result = systems.abilities.cast(
    mage,
    mage.abilities.find((ability) => ability.id === 'skeletonFireball'),
    {
      target: player,
      entities,
      grid,
      rng: new Rng(9),
      hooks: {
        damage: (target, amount) => ({ applied: target.takeDamage(amount), killed: !target.alive }),
        beam() {},
        explosion() {},
      },
    },
  );
  assert.equal(result.ok, true);
  for (let i = 0; i < 240 && systems.projectiles.projectiles.length > 0; i++) {
    systems.projectiles.update(1 / 60, { grid, entities });
  }

  assert.equal(player.health < player.maxHealth, true, 'the player is damaged');
  assert.equal(golem.health < golem.maxHealth, true, 'allied summons are valid enemy targets');
});

test('enemy spells can damage the player through the live combat entity list', () => {
  const game = makeHarness('wizard');
  const enemy = new Enemy('skeletonMage', game.player.x + 3, game.player.y, { floor: 1 });
  enemy.mana = 999;
  game.entities.add(enemy);
  const entities = game.combatEntities();
  assert.ok(entities.includes(game.player), 'the player is part of the live combat list');

  const startingHealth = game.player.health;
  const fireball = enemy.abilities.find((ability) => ability.id === 'skeletonFireball');
  const result = game.abilities.cast(enemy, fireball, {
    target: game.player,
    entities,
    grid: null,
    rng: new Rng(9),
    hooks: {
      damage: (target, amount) => ({ applied: target.takeDamage(amount), killed: !target.alive }),
      beam() {},
      explosion() {},
    },
  });
  assert.equal(result.ok, true);
  for (let i = 0; i < 240 && game.projectiles.projectiles.length > 0; i++) {
    game.projectiles.update(1 / 60, { grid: null, entities: game.combatEntities() });
  }

  assert.ok(game.player.health < startingHealth, 'the enemy projectile damages the player');
});

test('slows survive unrelated enemy buffs and restore speed exactly on expiry', () => {
  const systems = makeSystems();
  const mage = new Enemy('skeletonMage', 5, 5, { floor: 3 });
  mage.mana = 999;

  systems.abilities.applySlow(mage, 0.35, 3);
  assert.ok(Math.abs(mage.moveSpeedMultiplier - 0.65) < 1e-9);

  const shield = mage.abilities.find((ability) => ability.id === 'skeletonManaShield');
  const result = systems.abilities.cast(mage, shield, {
    target: mage,
    entities: [mage],
    grid: new Grid(16, 16, 0),
    rng: new Rng(1),
    cooldowns: mage.cooldowns,
  });
  assert.equal(result.ok, true);
  assert.equal(mage.hasBuff('skeletonManaShield'), true);
  assert.ok(Math.abs(mage.moveSpeedMultiplier - 0.65) < 1e-9, 'mana shield does not clear the slow');

  mage.removeBuff('skeletonManaShield');
  assert.ok(Math.abs(mage.moveSpeedMultiplier - 0.65) < 1e-9, 'removing the buff keeps the slow');

  systems.effects.update(3.1);
  assert.ok(Math.abs(mage.moveSpeedMultiplier - 1) < 1e-9, 'the slow restores full speed');
});

test('removing an entity clears its timed effects instead of leaving stale state', () => {
  const game = makeHarness('warrior');
  game.startRun('warrior', { strength: 4, intelligence: 0, vitality: 4, dexterity: 2 }, 1);
  const enemy = new Enemy('skeleton', game.player.x + 2, game.player.y, { floor: 1 });
  game.entities.add(enemy);

  game.abilities.applyStun(enemy, 3, 3);
  game.abilities.applySlow(enemy, 0.35, 3);
  assert.equal(game.effects.activeFor(enemy, 'stun').length, 1);
  assert.equal(game.effects.activeFor(enemy, 'slow').length, 1);

  game.removeEntity(enemy);
  assert.equal(game.entities.find(enemy.id), null);
  assert.equal(game.effects.activeFor(enemy).length, 0);
});

test('floor transitions keep character state and clear stale floor state', () => {
  const game = makeHarness('wizard');
  game.startRun('wizard', { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 }, 1);

  game.character.statPoints = 5;
  game.character.abilityPoints = 2;
  assert.equal(game.character.allocateStat('intelligence', 3), true);
  assert.equal(game.character.unlockAbility('fireball'), true);

  game.character.takeDamage(10);
  game.character.spendMana(5);
  const health = game.character.health;
  const mana = game.character.mana;
  const intelligence = game.character.stats.intelligence;
  game.cooldowns.start('ability:fireball', 10);

  const keep = game.effects.add({ target: game.character, name: 'testBuff', duration: 30 });
  const oldEnemy = new Enemy('skeleton', game.player.x + 2, game.player.y, { floor: 1 });
  game.entities.add(oldEnemy);
  game.effects.add({ target: oldEnemy, name: 'enemyDebuff', duration: 30 });
  const oldSummon = createSummon(findAbility('wizard', 'summonGolem'), game.character, {
    x: game.player.x + 1,
    y: game.player.y,
    damage: 1,
  });
  game.entities.add(oldSummon);
  game.projectiles.spawn({ x: game.player.x, y: game.player.y, speed: 1, ttl: 10 });
  game.areas.add({ x: game.player.x, y: game.player.y, radius: 1 });
  game.pickups.spawn({ x: game.player.x, y: game.player.y, heal: 5, ttl: 10 });
  game.visuals.push({ type: 'burst', x: game.player.x, y: game.player.y, radius: 1, ttl: 1, maxTtl: 1, color: [1, 1, 1, 1] });

  walkToStairs(game);

  assert.equal(game.floorNumber, 2);
  assert.equal(game.character, game.player, 'the same character continues');
  assert.equal(game.character.health, health);
  assert.equal(game.character.mana, mana);
  assert.equal(game.character.stats.intelligence, intelligence);
  assert.equal(game.character.hasAbility('fireball'), true);
  assert.ok(game.cooldowns.remaining('ability:fireball') > 9, 'cooldowns carry across floors');
  assert.equal(game.effects.activeFor(game.character).includes(keep), true, 'character effects survive');
  assert.equal(game.effects.activeFor(oldEnemy).length, 0, 'enemy effects are dropped');
  assert.equal(game.projectiles.projectiles.length, 0);
  assert.equal(game.areas.effects.length, 0);
  assert.equal(game.pickups.items.length, 0);
  assert.equal(game.visuals.length, 0);
  assert.equal(game.entities.find(oldEnemy.id), null, 'old enemies are cleared');
  assert.equal(game.entities.find(oldSummon.id), null, 'old summons are cleared');
  assert.ok(game.entities.items.every((entity) => entity.alive), 'only the new population remains');
});

test('repeated restarts do not leak entities, projectiles, effects or cooldowns', () => {
  const game = makeHarness('wizard');
  for (let run = 0; run < 8; run++) {
    const classId = run % 2 === 0 ? 'wizard' : 'warrior';
    const floor = (run % TOTAL_FLOORS) + 1;
    const previousIds = new Set(game.entities.items.map((entity) => entity.id));

    game.showCreation();
    game.startRun(classId, run % 2 === 0 ? { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 } : { strength: 4, intelligence: 0, vitality: 4, dexterity: 2 }, floor);

    assert.equal(game.state, 'playing');
    assert.equal(game.floorNumber, floor);
    assert.equal(game.character.classId, classId);
    assert.equal(game.attackTargetId, null);
    assert.equal(game.projectiles.projectiles.length, 0);
    assert.equal(game.areas.effects.length, 0);
    assert.equal(game.pickups.items.length, 0);
    assert.equal(game.visuals.length, 0);
    assert.equal(game.cooldowns.timers.size, 0);
    assert.equal(game.effects.items.length, 0);
    for (const entity of game.entities.items) {
      assert.equal(previousIds.has(entity.id), false, 'no entity survives a restart');
      assert.equal(entity.alive, true);
    }
    if (floor === BOSS_FLOOR) assert.ok(game.lich?.isLich);
  }
});

test('many summons expire cleanly without stale entities or effects', () => {
  const game = makeHarness('wizard');
  game.startRun('wizard', { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 }, 4);
  const ability = findAbility('wizard', 'summonGolem');
  const baseline = game.entities.size;

  for (let index = 0; index < 40; index++) {
    const summon = createSummon(ability, game.character, {
      x: game.player.x + (index % 5) * 0.5,
      y: game.player.y + Math.floor(index / 5) * 0.5,
      damage: 1,
    });
    game.entities.add(summon);
    game.effects.add({ target: summon, name: 'summonAura', duration: 0.5 });
  }
  assert.equal(game.entities.byFaction('ally').length, 40);

  for (let frame = 0; frame < 60 * 25; frame++) {
    game.updateSummons(1 / 60);
    game.effects.update(1 / 60);
  }

  assert.equal(game.entities.byFaction('ally').length, 0, 'expired summons are removed');
  assert.ok(game.entities.size <= baseline, 'no entities are left behind');
  assert.ok(game.entities.items.every((entity) => entity.kind === 'enemy'), 'only floor enemies remain');
  assert.equal(game.effects.items.length, 0, 'summon effects expire with their owners');
});

test('simultaneous Lich and player deaths resolve as a failed run', () => {
  const game = makeHarness('wizard');
  game.startRun('wizard', { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 }, BOSS_FLOOR);
  const lich = game.lich;
  const minions = summonMinions(lich, {
    entities: game.entities.all,
    grid: game.floor.grid,
    rng: new Rng(4),
    hooks: { add: (entity) => game.entities.add(entity) },
  });
  assert.ok(minions.length > 0);

  game.dealDamage(lich, lich.health);
  assert.ok(game.exit);
  assert.equal(minions[0].alive, true, 'surviving summons stay dangerous');

  game.player.x = game.exit.x;
  game.player.y = game.exit.y;
  game.character.takeDamage(game.character.health);
  game.checkPlayerDeath();
  game.checkBossExit();

  assert.equal(game.state, 'dead', 'death wins over the open exit');
  assert.equal(game.character.alive, false);
  assert.equal(game.projectiles.projectiles.length, 0);
  assert.equal(game.areas.effects.length, 0);
  assert.equal(game.effects.items.length, 0);
  assert.equal(game.entities.byFaction('ally').length, 0, 'allied summons are cleaned up on death');
});

test('the early game and the Lich fight stay winnable and survivable', () => {
  for (const classId of ['wizard', 'warrior']) {
    const character = new Character(classId);
    const stats = classId === 'wizard' ? { strength: 1, intelligence: 4, vitality: 3, dexterity: 2 } : { strength: 4, intelligence: 0, vitality: 4, dexterity: 2 };
    for (const [stat, amount] of Object.entries(stats)) character.allocateStat(stat, amount);
    character.recalculate({ fill: true });

    const skeleton = new Enemy('skeleton', 1, 1, { floor: 1 });
    const hit = reduceDamage(rollMeleeDamage(character), skeleton);
    const hitsToKill = Math.ceil(skeleton.maxHealth / Math.max(hit, 1));
    assert.ok(hitsToKill <= 12, `${classId} kills a floor-one skeleton in ${hitsToKill} hits`);

    const enemyHit = reduceDamage(rollMeleeDamage(skeleton), character);
    const hitsToDie = Math.ceil(character.maxHealth / Math.max(enemyHit, 1));
    assert.ok(hitsToDie >= 5, `${classId} survives at least ${hitsToDie} skeleton hits`);
  }

  const wizard = new Character('wizard');
  wizard.statPoints = 60;
  wizard.allocateStat('intelligence', 30);
  wizard.allocateStat('vitality', 15);
  wizard.allocateStat('dexterity', 10);
  wizard.recalculate({ fill: true });
  const fireball = findAbility('wizard', 'fireball');
  const spellDamage = (fireball.flatDamage + wizard.spellDamageBonus) * fireball.damageMultiplier;
  const lich = new Enemy('lich', 1, 1, { floor: BOSS_FLOOR });
  const lichHit = reduceDamage(spellDamage, lich);
  const castsToKill = Math.ceil(lich.maxHealth / Math.max(lichHit, 1));
  assert.ok(castsToKill <= 30, `a built wizard needs ${castsToKill} fireballs to kill the Lich`);

  const lichFireball = mageFireballDamage(wizard);
  assert.ok(lichFireball < wizard.maxHealth, 'one Lich fireball cannot one-shot a built wizard');
  assert.ok(Math.ceil(wizard.maxHealth / lichFireball) >= 3, 'a built wizard survives several Lich hits');
});

function mageFireballDamage(target) {
  const lichStats = new Enemy('lich', 0, 0, { floor: BOSS_FLOOR });
  const ability = lichStats.abilities.find((item) => item.id === 'lichFireball');
  const damage = (ability.flatDamage + lichStats.spellDamageBonus) * ability.damageMultiplier;
  return reduceDamage(damage, target);
}

test('pathfinding is deterministic and reusable across many queries', () => {
  const grid = new Grid(64, 64, 1);
  for (let y = 4; y < 60; y++) {
    for (let x = 4; x < 60; x++) grid.set(x, y, 0);
  }
  const first = findPath(grid, 5.5, 5.5, 55.5, 55.5);
  assert.ok(first.length > 0);
  for (let index = 0; index < 200; index++) {
    const path = findPath(grid, 5.5, 5.5, 55.5, 55.5);
    assert.deepEqual(path, first, 'reused buffers return the same path');
  }
  assert.equal(findPath(grid, 5.5, 5.5, 90.5, 5.5), null, 'out-of-bounds goals are rejected');
});

test('the renderer culls points outside the visible world rectangle', () => {
  const bounds = visibleWorldBounds({ x: 0, y: 0 }, 800, 600, 64);
  assert.deepEqual(bounds, { minX: -464, maxX: 464, minY: -364, maxY: 364 });
  assert.equal(isWorldPointVisible(0, 0, bounds), true);
  assert.equal(isWorldPointVisible(463, 363, bounds), true);
  assert.equal(isWorldPointVisible(465, 0, bounds), false);
  assert.equal(isWorldPointVisible(0, -365, bounds), false);
});

test('resizing clamps DPR and pause/resume resets the loop clock', () => {
  const game = makeHarness('wizard');
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 3 };
  try {
    game.canvas.getBoundingClientRect = () => ({ width: 320, height: 200 });
    game.resize();
    assert.deepEqual(game.view, { cssWidth: 320, cssHeight: 200, width: 640, height: 400, dpr: 2 });
    assert.equal(game.canvas.width, 640);
    assert.equal(game.canvas.height, 400);

    game.canvas.getBoundingClientRect = () => ({ width: 100.4, height: 50.6 });
    game.resize();
    assert.deepEqual(game.view, { cssWidth: 100, cssHeight: 51, width: 200, height: 102, dpr: 2 });

    game.canvas.getBoundingClientRect = () => ({ width: 0, height: 0 });
    game.resize();
    assert.equal(game.view.cssWidth, 1);
    assert.equal(game.view.cssHeight, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  let resets = 0;
  let clicks = 0;
  game.loop = {
    resetClock() {
      resets += 1;
    },
  };
  game.input.consumeClicks = () => {
    clicks += 1;
  };

  game.setPaused(true);
  assert.equal(game.paused, true);
  assert.equal(clicks, 1, 'pending clicks are discarded on pause');
  game.setPaused(true);
  assert.equal(clicks, 1, 'a repeated pause is a no-op');
  game.setPaused(false);
  assert.equal(game.paused, false);
  assert.equal(resets, 1, 'resuming resets the accumulator clock');
});

test('generated floor populations integrate every roster type on every regular floor', () => {
  for (const seed of SEEDS) {
    for (let floorNumber = 1; floorNumber < BOSS_FLOOR; floorNumber++) {
      const floor = generateFloor(seed, floorNumber);
      const enemies = spawnFloorEnemies(floor, floorNumber);
      const types = new Set(enemies.map((enemy) => enemy.typeId));
      for (const typeId of ['skeleton', 'skeletonArcher', 'skeletonMage', 'zombie', 'bat', 'vampire']) {
        assert.equal(types.has(typeId), true, `seed ${seed} floor ${floorNumber} includes ${typeId}`);
      }
      assert.ok(enemies.every((enemy) => enemy.alive && floor.grid.isWalkable(Math.floor(enemy.x), Math.floor(enemy.y))));
    }
  }
});
