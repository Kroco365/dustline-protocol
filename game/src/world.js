// DUSTLINE CANYON: the map. An original golden-hour desert canyon — a dry
// riverbed cuts across the middle, three lanes run south to north (West Wash,
// Mid Gorge, East Ridge), and the relay terminal stands on a stone platform at
// the centre. Every solid is a collider for movement and a surface a bullet
// stops on. Ground is flat (y = 0); cover is full-height rock or crouch-height
// crates. Waypoints form the graph the bots route on. All sizes are metres,
// x east, z south, attacker spawn at the south.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 5.2;

// Waypoint graph: id -> [x, z]; edges are listed both ways.
const NODES = {
  atkSpawn: [0, 17],
  wWash1: [-14, 11],
  wWash2: [-14, 3],
  relayW: [-5, 0],
  mid1: [0, 11],
  mid2: [0, 4],
  relay: [0, 0],
  mid3: [0, -5],
  eRidge1: [14, 11],
  eRidge2: [14, 3],
  relayE: [5, 0],
  wBack: [-19, -9],
  eBack: [19, -9],
  defSpawn: [0, -17],
  relayN: [0, -9],
  overlookW: [-10, -11],
  overlookE: [10, -11],
};

const EDGES = [
  ['atkSpawn', 'wWash1'], ['atkSpawn', 'mid1'], ['atkSpawn', 'eRidge1'],
  ['wWash1', 'wWash2'], ['wWash2', 'relayW'], ['wWash2', 'wBack'],
  ['relayW', 'relay'], ['relayW', 'overlookW'],
  ['mid1', 'mid2'], ['mid2', 'relay'], ['relay', 'mid3'],
  ['mid3', 'relayN'], ['mid3', 'overlookW'], ['mid3', 'overlookE'],
  ['eRidge1', 'eRidge2'], ['eRidge2', 'relayE'], ['eRidge2', 'eBack'],
  ['relayE', 'relay'], ['relayE', 'overlookE'],
  ['relayN', 'defSpawn'], ['relayN', 'overlookW'], ['relayN', 'overlookE'],
  ['wBack', 'overlookW'], ['wBack', 'defSpawn'],
  ['eBack', 'overlookE'], ['eBack', 'defSpawn'],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'hazard' || name === 'accent' ? 0.5 : 0.95,
      metalness: name === 'cover' || name === 'rock' ? 0.05 : 0.04,
    });
  }
  const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.floor), roughness: 0.98, metalness: 0.02 });
  const relayGlowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241505'), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2.4, roughness: 0.5 });
  const ringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2408'), emissive: new THREE.Color(PALETTE.hazard), emissiveIntensity: 1.1, roughness: 0.6 });

  const colliders = [];
  const shootables = [];
  const tmpBox = new THREE.Box3();

  function addCollider(mesh) {
    tmpBox.setFromObject(mesh);
    colliders.push(tmpBox.clone());
  }

  function box(w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] || floorMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) addCollider(mesh);
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  function cylinder(rt, rb, h, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), materials[material] || floorMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (!opts.noCollide) addCollider(mesh);
    if (!opts.noShoot) shootables.push(mesh);
    return mesh;
  }

  // ---- shell: sand floor, canyon rock walls, open golden sky above ----
  box(48.8, 0.4, 40.8, 0, -0.2, 0, 'floor');
  box(0.8, WALL_H, 40.8, -24.3, WALL_H / 2, 0, 'rock');
  box(0.8, WALL_H, 40.8, 24.3, WALL_H / 2, 0, 'rock');
  box(48.8, WALL_H, 0.8, 0, WALL_H / 2, -20.3, 'rock');
  box(48.8, WALL_H, 0.8, 0, WALL_H / 2, 20.3, 'rock');
  // mesa caps crowning the outer walls
  box(1.6, 1.2, 40.8, -24.3, WALL_H + 0.6, 0, 'rust', { noCollide: true, noShoot: true });
  box(1.6, 1.2, 40.8, 24.3, WALL_H + 0.6, 0, 'rust', { noCollide: true, noShoot: true });

  // ---- dry riverbed across mid (visual only, flat floor to cross) ----
  const bed = new THREE.Mesh(new THREE.BoxGeometry(48.8, 0.05, 3.2), new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6a42'), roughness: 1 }));
  bed.position.set(0, 0.02, 0);
  bed.receiveShadow = true;
  group.add(bed);
  box(1.8, 0.14, 3.4, -6, 0.07, 0, 'cover', { noCollide: true, noShoot: true }); // ford slab west
  box(1.8, 0.14, 3.4, 6, 0.07, 0, 'cover', { noCollide: true, noShoot: true }); // ford slab east

  // ---- lane dividers: south half split into West Wash / Mid Gorge / East Ridge ----
  box(0.6, 3.6, 11, -7, 1.8, 11, 'rock');
  box(0.6, 3.6, 11, 7, 1.8, 11, 'rock');
  // north half stubs that leave the relay approaches open
  box(0.6, 3.6, 4, -7, 1.8, -7, 'rock');
  box(0.6, 3.6, 4, 7, 1.8, -7, 'rock');

  // ---- the relay platform: stone disc, terminal pylon, glowing ring ----
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.3, 24), materials.cover);
  platform.position.set(0, 0.15, 0);
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);
  addCollider(platform);
  shootables.push(platform);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.07, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.34, 0);
  group.add(ring);
  cylinder(0.55, 0.7, 2.6, 0, 1.6, 0, 'rock');
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), relayGlowMat);
  beacon.position.set(0, 3.2, 0);
  group.add(beacon);
  shootables.push(beacon);
  // a low wall arc sheltering the relay from the south
  box(5.4, 1.1, 0.5, 0, 0.55, 5.6, 'cover');

  // ---- mesas: big rock blocks that break sightlines on the flanks ----
  box(4.5, 3.8, 2.4, -19.5, 1.9, 3, 'rock');
  box(4.5, 3.8, 2.4, 19.5, 1.9, 3, 'rock');
  box(3.2, 4.4, 3.2, -18, 2.2, -13, 'rock');
  box(3.2, 4.4, 3.2, 18, 2.2, -13, 'rock');
  box(2.6, 3.0, 2.6, -11, 1.5, -13.5, 'rock');
  box(2.6, 3.0, 2.6, 11, 1.5, -13.5, 'rock');

  // ---- watchtower (north-west overlook): legs, deck, roof — deck is visual ----
  box(0.35, 3.4, 0.35, -11.2, 1.7, -12.2, 'cover');
  box(0.35, 3.4, 0.35, -8.8, 1.7, -12.2, 'cover');
  box(0.35, 3.4, 0.35, -11.2, 1.7, -9.8, 'cover');
  box(0.35, 3.4, 0.35, -8.8, 1.7, -9.8, 'cover');
  const deck = box(3.4, 0.25, 3.4, -10, 3.5, -11, 'cover', { noCollide: true, noShoot: true });
  deck.castShadow = true;
  box(3.8, 0.2, 3.8, -10, 5.1, -11, 'rust', { noCollide: true, noShoot: true });

  // ---- cover: crates (crouch height), boulders, supply containers ----
  const crates = [
    // West Wash
    [-13.5, 0.55, 7.5, 1.2, 1.1, 1.2], [-15.5, 0.55, -1.5, 1.2, 1.1, 1.2],
    [-12.5, 0.55, -6.5, 2.4, 1.1, 1.2], [-18.5, 0.55, 7.5, 1.2, 1.1, 2.4],
    // East Ridge
    [13.5, 0.55, 7.5, 1.2, 1.1, 1.2], [15.5, 0.55, -1.5, 1.2, 1.1, 1.2],
    [12.5, 0.55, -6.5, 2.4, 1.1, 1.2], [18.5, 0.55, 7.5, 1.2, 1.1, 2.4],
    // Mid Gorge
    [-3.8, 0.55, 6.5, 1.2, 1.1, 1.2], [3.8, 0.55, -3.5, 1.2, 1.1, 1.2],
    [-3.8, 0.55, -8.5, 1.2, 1.1, 1.2], [3.8, 0.55, 8.5, 1.2, 1.1, 1.2],
    // relay approaches
    [-6.5, 0.55, -2.5, 1.2, 1.1, 1.2], [6.5, 0.55, 2.5, 1.2, 1.1, 1.2],
    // spawns
    [-5, 0.55, 16.5, 1.2, 1.1, 1.2], [5, 0.55, 16.5, 1.2, 1.1, 1.2],
  ];
  for (const [x, y, z, w, h, d] of crates) box(w, h, d, x, y, z, 'cover');
  const boulders = [
    [-9, 0.8, 14.5, 1.5], [9, 0.8, 14.5, 1.5],
    [-16, 0.9, -6, 1.8], [16, 0.9, -6, 1.8],
    [-4.5, 0.7, -11, 1.3], [4.5, 0.7, -11, 1.3],
  ];
  for (const [x, y, z, r] of boulders) cylinder(r * 0.8, r, y * 2, x, y, z, 'rock');
  const containers = [
    [-9.5, 1.15, 13.5, 2.2, 2.3, 1.4, 'rust'], [9.5, 1.15, 13.5, 2.2, 2.3, 1.4, 'rust'],
    [-6.5, 1.15, -14.5, 1.4, 2.3, 2.2, 'rust'], [6.5, 1.15, -14.5, 1.4, 2.3, 2.2, 'rust'],
  ];
  for (const [x, y, z, w, h, d, m] of containers) box(w, h, d, x, y, z, m);
  // hazard floor strips marking the relay zone edge
  box(8.4, 0.05, 0.5, 0, 0.03, -4.4, 'hazard', { noCollide: true, noShoot: true });
  box(8.4, 0.05, 0.5, 0, 0.03, 4.4, 'hazard', { noCollide: true, noShoot: true });
  // cacti (visual only) along the walls
  for (const [x, z] of [[-22.5, 8], [-22.5, -4], [22.5, 12], [22.5, -12], [-16, 18.5], [17, 18.5]]) {
    cylinder(0.14, 0.18, 1.6, x, 0.8, z, 'ally', { noCollide: true, noShoot: true });
  }

  // ---- light: low golden sun, warm sky, relay glow ----
  scene.add(new THREE.HemisphereLight(new THREE.Color('#ffd9a0'), new THREE.Color('#5a3a20'), 0.9));
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.1);
  sun.position.set(-26, 14, 18);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const relayLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 55, 18, 1.8);
  relayLight.position.set(0, 3.4, 0);
  scene.add(relayLight);
  const washLight = new THREE.PointLight(new THREE.Color('#ff8a3c'), 22, 14, 1.8);
  washLight.position.set(-16, 2.4, 6);
  scene.add(washLight);
  const ridgeLight = new THREE.PointLight(new THREE.Color('#ff9a4d'), 22, 14, 1.8);
  ridgeLight.position.set(16, 2.4, 6);
  scene.add(ridgeLight);

  // adjacency map for the waypoint graph
  const adjacency = {};
  for (const id of Object.keys(NODES)) adjacency[id] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    relay: {
      center: new THREE.Vector3(0, 0, 0),
      radius: 3.6,
      platform,
      ring,
      beacon,
    },
    spawns: {
      player: new THREE.Vector3(0, 0, 17),
      allies: [new THREE.Vector3(-2.5, 0, 17.5), new THREE.Vector3(2.5, 0, 17.5)],
      enemies: [
        new THREE.Vector3(-4, 0, -16.5), new THREE.Vector3(-1.5, 0, -17),
        new THREE.Vector3(1.5, 0, -17), new THREE.Vector3(4, 0, -16.5),
      ],
    },
    waypoints: { nodes: NODES, adjacency },
  };
}
