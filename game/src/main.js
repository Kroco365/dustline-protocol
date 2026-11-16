// DUSTLINE PROTOCOL — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. main.js owns the round wiring, the player's shots,
// the relay capture and the buy flow; the modules own their own jobs.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createGameState, PHASE, ROUND_TIME, CAPTURE_TIME, RELAY_RADIUS } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { resolveHitscan, applyDamage, createTracers, explode, hasLineOfSight } from './combat.js';
import { createRounds, SHOP } from './rounds.js';
import { createHud } from './hud.js';
import { sfx } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;
if (shot) Math.random = random; // deterministic captures: bots, bursts and spread all draw from the seeded stream

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const state = createGameState();
const world = createWorld(scene);
const hud = createHud();
const player = createPlayer(world.colliders, world.spawns.player);
const weapons = createWeapons(camera, world.colliders);
const tracers = createTracers(scene);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpV = new THREE.Vector3();

// ---- the player's fighter: the shape combat.js understands ----
const playerFighter = {
  id: 'player', team: 'us', kind: 'player', name: 'YOU',
  position: player.state.position,
  eye: 1.6,
  health: 100,
  armor: 0,
  alive: true,
  hitMeshes: [],
  onDamage(amount, attacker) {
    hud.damageFlash(attacker ? damageAngle(attacker.position) : null);
    sfx.hurt();
  },
  onDeath(attacker) {
    state.deaths += 1;
    hud.banner('YOU ARE DOWN', 'Your team fights on.', 3500);
    if (document.pointerLockElement) document.exitPointerLock();
  },
};

function damageAngle(fromPos) {
  const dx = fromPos.x - player.state.position.x;
  const dz = fromPos.z - player.state.position.z;
  const worldAngle = Math.atan2(dx, dz);
  const rel = worldAngle - player.state.yaw;
  return ((rel * 180) / Math.PI + 360) % 360;
}

function allFighters() {
  return [playerFighter, ...bots.bots];
}

function shootables() {
  const list = world.shootables.slice(); // copy: fighter meshes must not accumulate on the shared array
  for (const f of allFighters()) {
    if (f.alive) for (const m of f.hitMeshes) list.push(m);
  }
  return list;
}

// ---- bots ----
const bots = createBots(scene, world, {
  shootables: () => shootables(),
  relayState: () => state.relay,
  onBotShot(bot, origin, dir) {
    const dist = origin.distanceTo(player.state.position);
    sfx.shot('rifle', Math.min(1, dist / 55));
    tracers.spawn(origin, tmpV.copy(origin).addScaledVector(dir, 40), 0xff8a5a);
  },
  onBotHit(bot, target, part, killed) {
    if (target === playerFighter) hud.setHealth(playerFighter.health, weapons.state.armor);
  },
  onKill(attacker, victim, part) {
    const killerName = attacker === playerFighter ? 'YOU' : attacker.name;
    const victimName = victim === playerFighter ? 'YOU' : victim.name;
    hud.killfeed(killerName, victimName, part === 'head', attacker.team);
    if (attacker === playerFighter) {
      rounds.killReward();
      sfx.kill();
      hud.hitMarker(true, 140);
    }
    if (victim.kind === 'bot') {
      victim.group.visible = true; // the fall animation plays in bots.step
    }
  },
});

function aliveCounts() {
  let us = playerFighter.alive ? 1 : 0;
  let them = 0;
  for (const b of bots.bots) {
    if (!b.alive) continue;
    if (b.team === 'us') us += 1;
    else them += 1;
  }
  return { us, them };
}

// ---- rounds ----
const rounds = createRounds(state, {
  onRoundStart(round) {
    player.reset(world.spawns.player, 0);
    const survived = playerFighter.alive;
    playerFighter.health = 100;
    playerFighter.alive = true;
    playerFighter.eye = 1.6;
    weapons.resetRound(survived);
    playerFighter.armor = weapons.state.armor;
    const assignments = {};
    const allyRoutes = [
      { patrol: ['atkSpawn', 'mid1', 'mid2', 'relay', 'mid1'] },
      { patrol: ['atkSpawn', 'wWash1', 'wWash2', 'relayW', 'relay'] },
    ];
    const allies = bots.bots.filter((b) => b.team === 'us');
    allies.forEach((b, i) => {
      assignments[b.id] = allyRoutes[i % allyRoutes.length];
    });
    const enemies = bots.bots.filter((b) => b.team === 'them');
    const defSetup = round % 2 === 1
      ? [
        { anchor: 'relayN', patrol: ['relayN', 'overlookW', 'relayN'] },
        { anchor: 'overlookW', patrol: ['overlookW', 'relayW', 'overlookW'] },
        { anchor: 'overlookE', patrol: ['overlookE', 'relayE', 'overlookE'] },
        { anchor: 'relayN', patrol: ['relayN', 'mid3', 'relayN'] },
      ]
      : [
        { anchor: 'relayN', patrol: ['relayN', 'overlookE', 'relayN'] },
        { anchor: 'overlookE', patrol: ['overlookE', 'relayE', 'overlookE'] },
        { anchor: 'overlookW', patrol: ['overlookW', 'relayW', 'overlookW'] },
        { anchor: 'relayN', patrol: ['relayN', 'mid3', 'relayN'] },
      ];
    enemies.forEach((b, i) => {
      assignments[b.id] = defSetup[i % defSetup.length];
    });
    const spawns = {};
    allies.forEach((b, i) => { spawns[b.id] = world.spawns.allies[i]; });
    enemies.forEach((b, i) => { spawns[b.id] = world.spawns.enemies[i]; });
    bots.reset(spawns, assignments);
    hud.setHealth(100, 0);
    hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name, weapons.state.frags, weapons.state.flashes);
    hud.setMoney(state.money);
    hud.setScore(state.winsUs, state.winsThem, state.round);
    hud.relayStatus(0, 0, null);
    hud.hint('Hold the relay terminal — or eliminate DUSTJACKALS. Press B to buy.', 4000);
  },
  onRoundEnd(winner, reason) {
    hud.banner(state.endText, state.endSub, 3800);
    if (winner === 'us') sfx.roundWin();
    else sfx.roundLose();
    hud.hideBuy();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner) {
    hud.showOverlay('matchEnd', {
      title: winner === 'us' ? 'MATCH WON' : 'MATCH LOST',
      copy: `Final score ${state.winsUs} — ${state.winsThem}. ${state.stats.hits} hits from ${state.stats.shots} shots, ${state.stats.headshots} headshots.`,
      action: 'Play again',
    });
  },
  onMoney(money) {
    hud.setMoney(money);
  },
});

// ---- input ----
let suppressPause = false;
let frozen = false;
let started = false;
const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (suppressPause) {
    suppressPause = false;
  } else if (state.phase === PHASE.MATCH_END) {
    // overlay already shown by onMatchEnd
  } else if (!playerFighter.alive) {
    hud.showOverlay('paused', {
      title: 'YOU ARE DOWN',
      copy: 'Your team fights on. Click to keep watching from here.',
      action: 'Keep watching',
    });
  } else if (state.phase !== PHASE.MENU) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) rounds.startMatch();
  input.requestLock();
});

// ---- shooting ----
let prevFiring = false;
let shake = 0;

function fireOneRound(force = false, armBurst = true) {
  // one trigger pull's worth of fire: one shell for the shotgun (8 pellets),
  // one bullet for everything else. Called by tryShoot and by the burst timer.
  // A burst round (force) skips the cooldown check but never re-arms the burst.
  if (state.phase !== PHASE.LIVE || !playerFighter.alive) return;
  const def = weapons.def();
  if (force) {
    if (weapons.ammo[weapons.state.current].mag === 0 || weapons.state.reloadLeft > 0) return;
  } else if (!weapons.ready()) {
    if (weapons.ammo[weapons.state.current].mag === 0) {
      sfx.dryFire();
      weapons.reload();
    }
    return;
  }
  if (!weapons.takeRound()) return;
  state.stats.shots += 1;
  camera.getWorldDirection(direction);
  const speed = player.groundSpeed();
  const baseSpread = weapons.spread(speed, speed > 0.5);
  const pellets = def.pellets || 1;
  let hitAny = false;
  let killedAny = false;
  scene.updateMatrixWorld(true);
  const origin = camera.position;
  for (let p = 0; p < pellets; p += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * baseSpread;
    dir.y += (random() * 2 - 1) * baseSpread;
    dir.z += (random() * 2 - 1) * baseSpread;
    dir.normalize();
    const result = resolveHitscan(origin, dir, def, shootables());
    muzzle.copy(origin).addScaledVector(dir, 0.6);
    muzzle.x += 0.18;
    muzzle.y -= 0.12;
    if (result) {
      tracers.spawn(muzzle, result.point, 0xffd27a);
      if (result.fighter) {
        hitAny = true;
        state.stats.hits += 1;
        if (result.part === 'head') state.stats.headshots += 1;
        state.stats.damage += result.damage;
        const killed = applyDamage(result.fighter, result.damage, result.part, playerFighter, onKillLocal);
        if (killed) killedAny = true;
      }
    } else {
      tracers.spawn(muzzle, tmpV.copy(origin).addScaledVector(dir, def.range), 0xffd27a);
    }
  }
  if (hitAny) {
    hud.hitMarker(killedAny, killedAny ? 140 : 90);
    sfx.hit();
  }
  weapons.pullTrigger(armBurst);
  player.recoil(def.kick * (1 + weapons.state.bloom * 8), (random() * 2 - 1) * def.kick * 0.4);
  sfx.shot(def.kind, 0);
  bots.hearShot(player.state.position, 'us');
  shake = Math.min(0.02, shake + def.kind === 'dmr' ? 0.02 : 0.006);
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, def.name, weapons.state.frags, weapons.state.flashes);
}

function tryShoot() {
  if (state.phase !== PHASE.LIVE || !playerFighter.alive) return;
  const def = weapons.def();
  if (!def.auto && prevFiring) return;
  fireOneRound();
}

function onKillLocal(attacker, victim, part) {
  const killerName = attacker === playerFighter ? 'YOU' : attacker.name;
  const victimName = victim === playerFighter ? 'YOU' : victim.name;
  hud.killfeed(killerName, victimName, part === 'head', attacker.team);
  if (attacker === playerFighter) {
    rounds.killReward();
    sfx.kill();
  }
}

function throwFrag() {
  if (state.phase !== PHASE.LIVE || !playerFighter.alive) return;
  camera.getWorldDirection(direction);
  const ok = weapons.throwFrag(camera.position, direction, (position) => {
    sfx.explosion(position.distanceTo(player.state.position) / 40);
    shake = 0.03;
    explode(position, {
      radius: 6, maxDamage: 120, minDamage: 20,
      fighters: allFighters(), world, attacker: playerFighter, onKill: onKillLocal,
    });
  });
  if (ok) sfx.grenadePin();
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name, weapons.state.frags, weapons.state.flashes);
}

function throwFlash() {
  if (state.phase !== PHASE.LIVE || !playerFighter.alive) return;
  camera.getWorldDirection(direction);
  const ok = weapons.throwFlash(camera.position, direction, (position) => {
    sfx.flashRing();
    shake = 0.01;
    bots.flashAt(position, shootables());
    // the player's own eyes: blinded only with a clear line and facing the burst
    const eye = tmpV.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    const dist = eye.distanceTo(position);
    if (dist < 20 && hasLineOfSight(position, eye, shootables())) {
      const toBurst = new THREE.Vector3().copy(position).sub(eye).normalize();
      camera.getWorldDirection(direction);
      const facing = direction.dot(toBurst);
      if (facing > -0.2) hud.flashBang(Math.max(0.25, 1 - dist / 20) * (facing > 0.5 ? 1 : 0.6));
    }
  });
  if (ok) sfx.grenadePin();
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name, weapons.state.frags, weapons.state.flashes);
}

// ---- buy menu ----
function toggleBuy() {
  if (state.phase !== PHASE.FREEZE || !playerFighter.alive) return;
  if (hud.isBuyOpen()) {
    hud.hideBuy();
    input.requestLock();
  } else {
    suppressPause = true;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showBuy(SHOP, state.money, (id) => buyItem(id));
  }
}

function buyItem(id) {
  let cost = null;
  if (id === 'frag') cost = weapons.buyFrag(state.money);
  else if (id === 'flash') cost = weapons.buyFlash(state.money);
  else if (id === 'armor') cost = weapons.buyArmor(state.money);
  else cost = weapons.buy(id, state.money);
  if (cost === null) {
    sfx.denied();
    return;
  }
  state.money -= cost;
  hud.setMoney(state.money);
  sfx.buy();
  if (id === 'armor') playerFighter.armor = weapons.state.armor;
  if (id !== 'frag' && id !== 'flash' && id !== 'armor') weapons.switchTo(id);
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name, weapons.state.frags, weapons.state.flashes);
  hud.setHealth(playerFighter.health, weapons.state.armor);
}

// ---- relay capture ----
function inRelayZone(position) {
  const c = world.relay.center;
  const dx = position.x - c.x;
  const dz = position.z - c.z;
  return Math.hypot(dx, dz) <= RELAY_RADIUS;
}

let lastRelayBeep = 0;

function stepRelay(dt) {
  const relay = state.relay;
  if (state.phase !== PHASE.LIVE || relay.capturedBy) {
    hud.relayStatus(relay.us, relay.them, relay.holder);
    return;
  }
  let usIn = 0;
  let themIn = 0;
  for (const f of allFighters()) {
    if (!f.alive || !inRelayZone(f.position)) continue;
    if (f.team === 'us') usIn += 1;
    else themIn += 1;
  }
  const prevHolder = relay.holder;
  if (usIn > 0 && themIn === 0) {
    relay.holder = 'us';
    relay.us = Math.min(1, relay.us + dt / CAPTURE_TIME);
    if (Math.floor(relay.us * CAPTURE_TIME) !== lastRelayBeep) {
      lastRelayBeep = Math.floor(relay.us * CAPTURE_TIME);
      sfx.captureTick();
    }
    if (relay.us >= 1) {
      relay.capturedBy = 'us';
      rounds.captureReward();
      hud.banner('RELAY CAPTURED', 'SABLE holds the terminal.', 3000);
      sfx.beep(true);
    }
  } else if (themIn > 0 && usIn === 0) {
    relay.holder = 'them';
    relay.them = Math.min(1, relay.them + dt / CAPTURE_TIME);
    if (Math.floor(relay.them * CAPTURE_TIME) !== lastRelayBeep) {
      lastRelayBeep = Math.floor(relay.them * CAPTURE_TIME);
      sfx.captureAlarm();
    }
    if (relay.them >= 1) {
      relay.capturedBy = 'them';
      hud.banner('RELAY LOST', 'DUSTJACKALS hold the terminal.', 3000);
      sfx.beep(true);
    }
  } else if (usIn > 0 && themIn > 0) {
    relay.holder = 'contested';
  } else {
    relay.holder = null;
  }
  if (prevHolder !== relay.holder && relay.holder === 'them') {
    hud.hint('DUSTJACKALS are capturing the relay — get back to the terminal!', 3000);
  }
  hud.relayStatus(relay.us, relay.them, relay.holder);
  // the terminal beacon burns brighter as a capture nears
  const lead = Math.max(relay.us, relay.them);
  world.relay.beacon.material.emissiveIntensity = 2.4 + lead * 4;
}

// ---- per-frame input edges ----
function handlePresses(presses) {
  for (const code of presses) {
    if (code === 'KeyB') { toggleBuy(); continue; }
    if (hud.isBuyOpen()) {
      const item = SHOP.find((s) => `Digit${s.key}` === code || `Numpad${s.key}` === code);
      if (item) buyItem(item.id);
      continue;
    }
    if (code === 'Digit1') weapons.switchTo('pistol');
    else if (code === 'Digit2') weapons.switchTo('rifle');
    else if (code === 'Digit3') weapons.switchTo('smg');
    else if (code === 'Digit4') weapons.switchTo('shotgun');
    else if (code === 'Digit5') weapons.switchTo('dmr');
    else if (code === 'KeyR') { if (weapons.reload()) sfx.reload(); }
    else if (code === 'KeyG') throwFrag();
    else if (code === 'KeyH') throwFlash();
    if (code.startsWith('Digit')) {
      hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, weapons.def().name, weapons.state.frags, weapons.state.flashes);
    }
  }
}

// ---- simulation step ----
let elapsed = 0;
let stepCount = 0;
let footAcc = 0;

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const phase = state.phase;
  if (phase === PHASE.LIVE || phase === PHASE.FREEZE) {
    if (playerFighter.alive) player.step(dt, input.state.keys);
    playerFighter.eye = player.state.eye;
    playerFighter.armor = weapons.state.armor;
  }
  weapons.step(dt, () => fireOneRound(true, false));
  tracers.step(dt);
  if (phase === PHASE.LIVE) {
    bots.step(dt, allFighters());
    stepRelay(dt);
  }
  rounds.tick(dt, aliveCounts());
  // footsteps
  if (playerFighter.alive && (phase === PHASE.LIVE || phase === PHASE.FREEZE)) {
    footAcc += player.groundSpeed() * dt;
    if (footAcc > 2.4) {
      footAcc = 0;
      if (player.groundSpeed() > 0.5) sfx.step(player.groundSpeed() > 4);
    }
  }
  // HUD numbers
  hud.setHealth(Math.ceil(playerFighter.health), weapons.state.armor);
  hud.setTimer(phase === PHASE.FREEZE ? state.freezeTime : state.roundTime, phase);
  hud.setScore(state.winsUs, state.winsThem, state.round);
  const alive = aliveCounts();
  hud.setAlive(alive.us, alive.them);
  const scoped = input.state.aiming && weapons.def().kind === 'dmr' && playerFighter.alive;
  weapons.state.scoped = scoped;
  const spreadPx = 10 + weapons.spread(player.groundSpeed(), player.groundSpeed() > 0.5) * 900;
  hud.setCrosshair(scoped ? 0 : spreadPx, scoped);
  shake = Math.max(0, shake - dt * 0.05);
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  if (shake > 0) {
    camera.rotation.x += (random() * 2 - 1) * shake * 0.3;
    camera.rotation.y += (random() * 2 - 1) * shake * 0.3;
  }
  const targetFov = weapons.state.scoped ? 74 * WEAPONS.dmr.zoom : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerFighter.alive && (state.phase === PHASE.LIVE || state.phase === PHASE.FREEZE)) {
      player.look(look.x, look.y);
    }
    handlePresses(input.takePresses());
    if (input.state.firing) tryShoot();
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  rounds.startMatch();
  state.phase = PHASE.LIVE;
  if (name === 'start') {
    player.reset(world.spawns.player, 0);
    playerFighter.health = 100;
    playerFighter.alive = true;
    settle(30);
    aimAt(new THREE.Vector3(0, 1.6, -12));
    hud.showOverlay('start');
  } else if (name === 'play') {
    player.reset(new THREE.Vector3(0, 0, 8), 0);
    const enemies = bots.bots.filter((b) => b.team === 'them');
    enemies[0].position.set(1.5, 0, -3.5);
    enemies[1].position.set(4.5, 0, -5.5);
    enemies[0].group.position.copy(enemies[0].position);
    enemies[1].group.position.copy(enemies[1].position);
    settle(30);
    aimAt(new THREE.Vector3(enemies[0].position.x, 1.2, enemies[0].position.z));
    for (let i = 0; i < 3; i += 1) {
      tryShoot();
      settle(6);
    }
    settle(10);
  } else {
    // end: relay captured, one enemy down in front of the player
    player.reset(new THREE.Vector3(-6, 0, 6), 0.35);
    const enemies = bots.bots.filter((b) => b.team === 'them');
    enemies[0].position.set(-7, 0, 1);
    enemies[0].alive = false;
    enemies[0].fall = 1;
    enemies[0].group.rotation.x = -1.45;
    enemies[0].group.position.copy(enemies[0].position);
    state.winsUs = 2;
    state.winsThem = 1;
    state.relay.us = 1;
    state.relay.capturedBy = 'us';
    settle(20);
    hud.banner('RELAY CAPTURED', 'SABLE holds the terminal.', 60000);
    hud.setScore(2, 1, 3);
  }
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = { state, playerFighter, bots, weapons, rounds, world, input };
// test hooks for the local Playwright harness: advance the fixed-step sim
// without waiting on the renderer, fire one shot, and feed one key press.
// They do not change the game; they only let a slow software renderer test it.
window.__game.stepSim = (seconds) => {
  const n = Math.max(0, Math.round(seconds / FIXED_STEP));
  for (let i = 0; i < n; i += 1) step(FIXED_STEP);
  syncCamera();
};
window.__game.shootOnce = () => { prevFiring = false; tryShoot(); }; // one fresh trigger pull per call
window.__game.press = (code) => { handlePresses([code]); };

syncCamera();
hud.setAmmo(12, Infinity, 'DUNE-9', 0, 0);
hud.setMoney(state.money);
hud.setScore(0, 0, 1);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
