// The arsenal: five hitscan weapons with different roles, and two grenades.
// RAPTOR-5 fires a 3-round burst per trigger pull; MAULER-12 is a pump shotgun
// that throws 8 pellets per shell; HAWKEYE-50 is a scoped marksman rifle. Each
// weapon owns its numbers; main.js owns the ray, combat.js owns the damage.
// View models are plain boxes on the camera; the muzzle flash is a lit plane.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'DUNE-9', kind: 'pistol', price: 0, auto: false,
    damage: 26, headMult: 4, magSize: 12, startReserve: Infinity, fireGap: 0.18,
    reloadTime: 1.1, spreadStill: 0.004, spreadMove: 0.02, bloomPerShot: 0.0016,
    range: 60, falloffAt: 25, kick: 0.006, barrel: 0.22, zoom: 1, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'RAPTOR-5', kind: 'rifle', price: 2700, auto: false,
    damage: 30, headMult: 4, magSize: 30, startReserve: 90, fireGap: 0.34,
    burst: 3, burstGap: 0.07,
    reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.028, bloomPerShot: 0.0026,
    range: 90, falloffAt: 30, kick: 0.009, barrel: 0.42, zoom: 1, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'SANDVIPER-9', kind: 'smg', price: 1500, auto: true,
    damage: 25, headMult: 4, magSize: 28, startReserve: 112, fireGap: 0.068,
    reloadTime: 1.6, spreadStill: 0.004, spreadMove: 0.032, bloomPerShot: 0.003,
    range: 55, falloffAt: 18, kick: 0.006, barrel: 0.3, zoom: 1, pellets: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'MAULER-12', kind: 'shotgun', price: 2000, auto: false,
    damage: 13, headMult: 3, magSize: 5, startReserve: 20, fireGap: 0.85,
    reloadTime: 2.6, spreadStill: 0.028, spreadMove: 0.05, bloomPerShot: 0.014,
    range: 32, falloffAt: 12, kick: 0.028, barrel: 0.5, zoom: 1, pellets: 8,
  },
  dmr: {
    id: 'dmr', name: 'HAWKEYE-50', kind: 'dmr', price: 4750, auto: false,
    damage: 88, headMult: 4, magSize: 5, startReserve: 15, fireGap: 1.05,
    reloadTime: 2.8, spreadStill: 0.0008, spreadMove: 0.05, bloomPerShot: 0.012,
    range: 120, falloffAt: 40, kick: 0.03, barrel: 0.62, zoom: 0.35, pellets: 1,
  },
};

export const FRAG_PRICE = 300;
export const FLASH_PRICE = 200;
export const ARMOR_PRICE = 650;

const GRAVITY = 14;
const FUSE_AFTER_BOUNCE = 1.6;

export function createWeapons(camera, colliders) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cover), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.55, metalness: 0.2 });

  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let modelParts = [];
  function buildModel(def) {
    for (const part of modelParts) model.remove(part);
    modelParts = [];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -0.17 - def.barrel / 2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.28);
    modelParts.push(receiver, barrel, stock);
    if (def.kind === 'dmr') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), accent);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      modelParts.push(scope);
    }
    if (def.kind === 'smg') {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), accent);
      mag.position.set(0, -0.12, -0.05);
      modelParts.push(mag);
    }
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), accent);
      pump.position.set(0, -0.04, -0.32);
      modelParts.push(pump);
    }
    for (const part of modelParts) model.add(part);
  }

  // per-weapon ammo persists across switches; grenades and armour are per round
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].startReserve };
  const state = {
    current: 'pistol',
    owned: new Set(['pistol']),
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0,
    flash: 0,
    kick: 0,
    frags: 0,
    flashes: 0,
    armor: 0,
    scoped: false,
    burstLeft: 0,
    burstTimer: 0,
  };
  buildModel(WEAPONS.pistol);

  const thrown = [];
  const fragGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.6 });
  const flashGeo = new THREE.SphereGeometry(0.08, 10, 8);
  const flashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f5f0e0'), roughness: 0.3, metalness: 0.6, emissive: new THREE.Color('#fff6d8'), emissiveIntensity: 1.2 });
  const probe = new THREE.Box3();

  function step(dt, onBurstRound) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = WEAPONS[state.current];
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const need = def.magSize - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
    // burst fire: the remaining rounds of a RAPTOR-5 burst go out on their own
    // timer, each one through the same firing path as a trigger pull.
    if (state.burstLeft > 0) {
      state.burstTimer -= dt;
      if (state.burstTimer <= 0) {
        state.burstLeft -= 1;
        state.burstTimer = WEAPONS[state.current].burstGap || 0.07;
        if (onBurstRound) onBurstRound();
      }
    }
    // thrown grenades: gravity, bounce off colliders, fuse
    for (let i = thrown.length - 1; i >= 0; i -= 1) {
      const g = thrown[i];
      g.velocity.y -= GRAVITY * dt;
      g.position.addScaledVector(g.velocity, dt);
      probe.min.set(g.position.x - 0.09, g.position.y - 0.09, g.position.z - 0.09);
      probe.max.set(g.position.x + 0.09, g.position.y + 0.09, g.position.z + 0.09);
      let hit = false;
      for (const c of colliders) if (probe.intersectsBox(c)) { hit = true; break; }
      if (g.position.y <= 0.09) hit = true;
      if (hit) {
        g.velocity.multiplyScalar(-0.42);
        g.velocity.y = Math.abs(g.velocity.y) * 0.5 + 0.5;
        if (g.position.y < 0.09) g.position.y = 0.09;
        if (!g.bounced) { g.bounced = true; g.fuse = Math.min(g.fuse, FUSE_AFTER_BOUNCE); }
      }
      g.fuse -= dt;
      g.mesh.position.copy(g.position);
      if (g.fuse <= 0) {
        g.mesh.removeFromParent();
        thrown.splice(i, 1);
        g.onExplode(g.position);
      }
    }
  }

  function throwOne(origin, direction, kind, onExplode) {
    const mesh = new THREE.Mesh(kind === 'flash' ? flashGeo : fragGeo, kind === 'flash' ? flashMat : fragMat);
    const position = origin.clone().addScaledVector(direction, 0.5);
    position.y -= 0.08;
    mesh.position.copy(position);
    camera.parent.add(mesh);
    const velocity = direction.clone().multiplyScalar(14);
    velocity.y += 4.5;
    thrown.push({ position, velocity, fuse: 2.4, bounced: false, mesh, onExplode });
    return true;
  }

  return {
    state,
    ammo,
    def() {
      return WEAPONS[state.current];
    },
    step,
    ready() {
      const slot = ammo[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      const slot = ammo[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    pullTrigger(armBurst = true) {
      const def = WEAPONS[state.current];
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.03, state.bloom + def.bloomPerShot);
      if (armBurst && def.burst) {
        state.burstLeft = def.burst - 1;
        state.burstTimer = def.burstGap || 0.07;
      }
    },
    reload() {
      const def = WEAPONS[state.current];
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.magSize || slot.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed, moving) {
      const def = WEAPONS[state.current];
      const moveFactor = Math.min(1, speed / 5.2);
      const scoped = state.scoped && def.kind === 'dmr' ? 0.35 : 1;
      return (def.spreadStill + moveFactor * def.spreadMove + state.bloom) * (moving ? 1 : 0.55) * scoped;
    },
    switchTo(id) {
      if (!state.owned.has(id) || id === state.current) return false;
      state.current = id;
      state.reloadLeft = 0;
      state.scoped = false;
      state.burstLeft = 0;
      buildModel(WEAPONS[id]);
      return true;
    },
    buy(id, money) {
      const def = WEAPONS[id];
      if (!def || state.owned.has(id) || money < def.price) return null;
      state.owned.add(id);
      ammo[id] = { mag: def.magSize, reserve: def.startReserve };
      return def.price;
    },
    buyFrag(money) {
      if (state.frags >= 1 || money < FRAG_PRICE) return null;
      state.frags = 1;
      return FRAG_PRICE;
    },
    buyFlash(money) {
      if (state.flashes >= 1 || money < FLASH_PRICE) return null;
      state.flashes = 1;
      return FLASH_PRICE;
    },
    buyArmor(money) {
      if (state.armor > 0 || money < ARMOR_PRICE) return null;
      state.armor = 50;
      return ARMOR_PRICE;
    },
    throwFrag(origin, direction, onExplode) {
      if (state.frags <= 0) return false;
      state.frags -= 1;
      return throwOne(origin, direction, 'frag', onExplode);
    },
    throwFlash(origin, direction, onExplode) {
      if (state.flashes <= 0) return false;
      state.flashes -= 1;
      return throwOne(origin, direction, 'flash', onExplode);
    },
    resetRound(keepPrimary) {
      const keep = keepPrimary && state.current !== 'pistol' ? state.current : 'pistol';
      state.owned = new Set(['pistol', ...(keep !== 'pistol' ? [keep] : [])]);
      for (const id of Object.keys(WEAPONS)) {
        ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].startReserve };
      }
      state.current = keep;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      state.flash = 0;
      state.kick = 0;
      state.frags = 0;
      state.flashes = 0;
      state.armor = 0;
      state.scoped = false;
      state.burstLeft = 0;
      state.burstTimer = 0;
      buildModel(WEAPONS[keep]);
      for (const g of thrown) g.mesh.removeFromParent();
      thrown.length = 0;
    },
  };
}
