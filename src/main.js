import * as THREE from 'three';
import { WORLD, COURSE_GATES } from './config.js';
import { buildSky, buildLights, updateSun } from './sky.js';
import { buildWorld } from './world.js';
import { createFlyer } from './flyer.js';
import { FlightModel } from './physics.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { terrainHeight } from './terrain.js';

const LOW_QUALITY = /[?&]low\b/.test(location.search);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_QUALITY, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_QUALITY ? 1 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOW_QUALITY;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 7000);

const sky = buildSky();
scene.add(sky);
const { sun } = buildLights(scene);

const world = buildWorld(scene);
const flyer = createFlyer();
scene.add(flyer.root);
const model = new FlightModel(flyer.contacts);
const controls = new Controls();
const hud = new Hud();
const audio = new Audio();

// ---- Game state -------------------------------------------------------------
const game = {
  state: 'intro', // intro | flying | crashed | paused
  gate: 0,
  time: 0,
  timerRunning: false,
  best: Number(localStorage.getItem('flyer-best')) || null,
  crashTimer: 0,
  cameraMode: 0,
  prevSide: 0,
  lastPauseState: null,
  airborneOnce: false,
};
const CAMERA_NAMES = ['chase camera (C)', 'pilot view (C)', 'orbit camera (C)'];

function resetFlight(message = true) {
  model.reset();
  flyer.root.position.copy(model.pos);
  flyer.root.quaternion.copy(model.quat);
  game.gate = 0;
  game.time = 0;
  game.timerRunning = false;
  game.airborneOnce = false;
  game.prevSide = 0;
  updateBeacons();
  world.dolly.position.z = 0;
  chaseInit();
  if (message) hud.message('On the rail', 'Hold Shift to open the throttle, pull up with ↑ or W', 4);
}

function updateBeacons() {
  world.gates.forEach((g, i) => {
    g.beacon.visible = i === game.gate || i === game.gate + 1;
    const next = i === game.gate;
    g.column.material.opacity = next ? 0.16 : 0.05;
    g.halo.visible = next;
  });
}

// ---- Camera ------------------------------------------------------------------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tmp = new THREE.Vector3();
let orbitAngle = 0;

function chaseInit() {
  _fwd.set(0, 0, -1).applyQuaternion(model.quat);
  camPos.copy(model.pos).addScaledVector(_fwd, -18).add(new THREE.Vector3(0, 5.5, 0));
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(model.pos);
}

function updateCamera(dt) {
  const pos = model.pos;
  _fwd.set(0, 0, -1).applyQuaternion(model.quat);
  _up.set(0, 1, 0).applyQuaternion(model.quat);
  if (game.state === 'intro') {
    orbitAngle += dt * 0.12;
    camPos.set(pos.x + Math.cos(orbitAngle) * 19, pos.y + 3.5 + Math.sin(orbitAngle * 0.7) * 1.5, pos.z + Math.sin(orbitAngle) * 19);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(pos.x, pos.y + 0.4, pos.z);
    return;
  }
  if (game.cameraMode === 1) {
    camera.position.copy(flyer.eye).applyQuaternion(model.quat).add(pos);
    camera.quaternion.copy(model.quat);
    camera.up.copy(_up);
    return;
  }
  if (game.cameraMode === 2) {
    orbitAngle += dt * 0.25;
    camPos.set(pos.x + Math.cos(orbitAngle) * 24, pos.y + 6, pos.z + Math.sin(orbitAngle) * 24);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 4));
    camera.up.set(0, 1, 0);
    camera.lookAt(pos);
    return;
  }
  // Chase: behind and above, following yaw, a little of the roll.
  const speed = model.vel.length();
  const flatFwd = _tmp.set(_fwd.x, 0, _fwd.z);
  if (flatFwd.lengthSq() < 0.01) flatFwd.set(0, 0, -1);
  flatFwd.normalize();
  camLook.copy(pos).addScaledVector(flatFwd, -(16 + speed * 0.28)).addScaledVector(_fwd, -2).add(new THREE.Vector3(0, 5.5 + speed * 0.05, 0));
  const groundY = terrainHeight(camLook.x, camLook.z) + 2.2;
  if (camLook.y < groundY) camLook.y = groundY;
  camera.position.lerp(camLook, 1 - Math.exp(-dt * 3.8));
  camera.up.set(0, 1, 0).lerp(_up, 0.3).normalize();
  camLook.copy(pos).addScaledVector(_fwd, 10).addScaledVector(_up, 0.8);
  camera.lookAt(camLook);
}

// ---- Dust puffs for crashes and touchdowns ---------------------------------
const puffs = [];
const puffGeo = new THREE.IcosahedronGeometry(1, 1);
function puff(x, y, z, n = 6, size = 1.5) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xcbb995, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x + (Math.random() - 0.5) * 3, y + Math.random() * 1.5, z + (Math.random() - 0.5) * 3);
    const s = size * (0.6 + Math.random());
    m.scale.setScalar(s);
    scene.add(m);
    puffs.push({ m, vx: (Math.random() - 0.5) * 4, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 4, life: 1.2 + Math.random() * 0.6, age: 0 });
  }
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    p.m.scale.multiplyScalar(1 + dt * 1.4);
    p.m.material.opacity = 0.7 * (1 - p.age / p.life);
    if (p.age > p.life) {
      scene.remove(p.m);
      p.m.material.dispose();
      puffs.splice(i, 1);
    }
  }
}

// ---- Events ------------------------------------------------------------------
function startGame() {
  if (game.state !== 'intro') return;
  audio.start();
  audio.resume();
  game.state = 'flying';
  hud.showIntro(false);
  resetFlight(true);
}
controls.on('start', startGame);
window.addEventListener('pointerdown', () => {
  if (game.state === 'intro') startGame();
  audio.resume();
});
controls.on('camera', () => {
  if (game.state === 'intro') return;
  game.cameraMode = (game.cameraMode + 1) % 3;
});
controls.on('reset', () => {
  if (game.state === 'intro') return;
  game.state = 'flying';
  resetFlight();
});
controls.on('mute', () => audio.setMuted(!audio.muted));
controls.on('help', () => hud.toggleHelp());
controls.on('invert', () => {
  controls.invertPitch = !controls.invertPitch;
  hud.message(controls.invertPitch ? 'Pitch inverted' : 'Pitch normal', controls.invertPitch ? '↑ pushes the nose down' : '↑ pulls the nose up', 2);
});
controls.on('pause', () => {
  if (game.state === 'paused') {
    game.state = game.lastPauseState || 'flying';
    hud.showPause(false);
  } else if (game.state !== 'intro') {
    game.lastPauseState = game.state;
    game.state = 'paused';
    hud.showPause(true);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'flying') controls.emit('pause');
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
const stick = document.getElementById('stick');
if (stick) controls.bindTouch(stick, document.getElementById('stick-knob'), document.getElementById('btn-up'), document.getElementById('btn-down'), document.getElementById('btn-cam'));
if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ---- Gates & collisions -------------------------------------------------------
const TREE_NAMES = { cedar: 'a cedar', pine: 'a pine', maple: 'a maple', ginkgo: 'a ginkgo', bamboo: 'a bamboo grove' };
function checkGate() {
  const g = world.gates[game.gate];
  if (!g) return;
  const dx = model.pos.x - g.x;
  const dz = model.pos.z - g.z;
  const along = dx * g.dir.x + dz * g.dir.z;
  const side = along > 0 ? 1 : -1;
  if (game.prevSide < 0 && side > 0 && Math.abs(along) < 25) {
    const lateral = dx * g.right.x + dz * g.right.z;
    const inside = Math.abs(lateral) < g.innerHalf - 1.5 && model.pos.y < g.passTop - 1 && model.pos.y > g.y - 2;
    if (inside) {
      game.gate++;
      audio.chime(game.gate === world.gates.length ? 99 : 1);
      if (game.gate === world.gates.length) {
        game.timerRunning = false;
        const t = game.time;
        const isBest = game.best == null || t < game.best;
        if (isBest) {
          game.best = t;
          localStorage.setItem('flyer-best', String(t));
        }
        hud.message('Course complete!', `${Hud.fmtTime(t)}${isBest ? ' — new best time' : ''}. Press R to fly it again.`, 8);
      } else {
        hud.message(`Gate ${game.gate} of ${world.gates.length}`, '', 1.6);
      }
      updateBeacons();
    }
  }
  game.prevSide = Math.abs(along) < 60 ? side : 0;
}

const probeWorld = new THREE.Vector3();
function checkCollisions() {
  for (const p of flyer.probes) {
    probeWorld.copy(p).applyQuaternion(model.quat).add(model.pos);
    const tree = world.forest.hit(probeWorld.x, probeWorld.y, probeWorld.z);
    if (tree) return `flew into ${TREE_NAMES[tree.species] || 'a tree'}`;
    const solid = world.hitSolid(probeWorld.x, probeWorld.y, probeWorld.z);
    if (solid) return `hit ${solid}`;
  }
  return null;
}

function crash(reason) {
  if (game.state === 'crashed') return;
  game.state = 'crashed';
  game.crashTimer = 0;
  game.timerRunning = false;
  model.markCrashed();
  audio.thud();
  hud.flash();
  puff(model.pos.x, model.pos.y - 1, model.pos.z, 12, 2.2);
  hud.message('Crashed', `You ${reason}. Rebuilding the Flyer…`, 3);
}

// ---- Main loop -----------------------------------------------------------------
const FIXED = 1 / 120;
let accumulator = 0;
let last = performance.now();
let wasOnGround = true;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  controls.update(dt);

  if (game.state === 'paused') {
    renderer.render(scene, camera);
    return;
  }

  if (game.state === 'flying' || game.state === 'crashed') {
    if (game.state === 'flying') {
      model.throttle = THREE.MathUtils.clamp(model.throttle + controls.throttleRate * dt * 0.55, 0, 1);
      model.input.pitch = controls.pitch;
      model.input.roll = controls.roll;
      model.input.yaw = controls.yaw;
      if (model.throttle > 0.05 && !game.timerRunning && game.gate === 0) game.timerRunning = true;
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED && steps < 12) {
      model.step(FIXED);
      accumulator -= FIXED;
      steps++;
    }
    if (game.timerRunning) game.time += dt;
    if (game.state === 'flying') {
      if (model.agl() > 3) game.airborneOnce = true;
      if (model.crash) crash(model.crash);
      else {
        const hit = checkCollisions();
        if (hit) crash(hit);
      }
      if (game.state === 'flying') checkGate();
      if (model.onGround && !wasOnGround && game.airborneOnce) {
        puff(model.pos.x, model.pos.y - 1, model.pos.z, 5, 1.2);
      }
    } else {
      game.crashTimer += dt;
      if (game.crashTimer > 3) {
        game.state = 'flying';
        resetFlight();
      }
    }
    wasOnGround = model.onGround;
    if (model.rail.active) world.dolly.position.z = model.rail.dollyZ;
  } else if (game.state === 'intro') {
    model.input.pitch = model.input.roll = model.input.yaw = 0;
  }

  flyer.root.position.copy(model.pos);
  flyer.root.quaternion.copy(model.quat);
  flyer.update(dt, { elevator: model.input.pitch, rudder: model.input.yaw + 0.45 * model.input.roll, warp: model.input.roll, propRpm: model.rpm });

  world.update(dt);
  updatePuffs(dt);
  updateCamera(dt);
  updateSun(sun, model.pos);
  sky.position.copy(camera.position);
  audio.update(model.rpm, model.airspeed, model.engineOn);

  // HUD
  const g = world.gates[game.gate];
  let compass = null;
  let compassDist = 0;
  if (g && game.state !== 'intro') {
    const dx = g.x - model.pos.x;
    const dz = g.z - model.pos.z;
    const target = Math.atan2(dx, -dz);
    compass = target - model.heading();
    compassDist = Math.hypot(dx, dz);
  }
  hud.update(now / 1000, {
    speed: model.airspeed,
    agl: model.agl() - 1.2,
    throttle: model.throttle,
    heading: model.heading(),
    gate: Math.min(game.gate, world.gates.length),
    gateTotal: world.gates.length,
    time: game.time,
    best: game.best,
    stall: model.stall && game.state === 'flying',
    compass,
    compassDist,
    cameraName: CAMERA_NAMES[game.cameraMode],
    muted: audio.muted || !audio.started,
  });

  renderer.render(scene, camera);
}

// Debug hooks for automated screenshots: open with ?debug in the URL.
if (location.search.includes('debug')) {
  window.__debug = () => ({ state: game.state, gate: game.gate, x: +model.pos.x.toFixed(1), y: +model.pos.y.toFixed(1), z: +model.pos.z.toFixed(1), agl: +model.agl().toFixed(1), speed: +model.airspeed.toFixed(1), crash: model.crash });
  window.__nearestTree = (x, z) => {
    let best = null;
    for (const t of world.forest.placements) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (!best || d < best.d) best = { d, x: t.x, z: t.z, y: t.y, species: t.species, scale: t.scale };
    }
    return best;
  };
  window.__teleport = (x, agl, z, yawDeg, speed = 16, throttle = 0.8, mode = 0) => {
    if (game.state === 'intro') startGame();
    game.state = 'flying';
    model.rail.active = false;
    model.pos.set(x, terrainHeight(x, z) + agl, z);
    model.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-yawDeg * Math.PI) / 180);
    model.vel.set(0, 0, -1).applyQuaternion(model.quat).multiplyScalar(speed);
    model.angVel.set(0, 0, 0);
    model.throttle = throttle;
    model.crash = null;
    model.crashed = false;
    model.engineOn = true;
    game.cameraMode = mode;
    flyer.root.position.copy(model.pos);
    flyer.root.quaternion.copy(model.quat);
    chaseInit();
  };
}

resetFlight(false);
hud.showIntro(true);
document.getElementById('stats').textContent = `${world.stats.trees.toLocaleString()} trees · ${world.stats.torii} torii · ${world.stats.houses} houses, all generated in your browser`;
document.getElementById('loading').remove();
requestAnimationFrame(frame);
