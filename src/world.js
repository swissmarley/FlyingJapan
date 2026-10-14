// Populates the valley: forest, village, shrine, pagoda, torii path, lake
// torii, launch rail and the twelve giant course gates.
import * as THREE from 'three';
import { Rng, Noise2D, smoothstep } from './rng.js';
import { WORLD, COURSE_GATES } from './config.js';
import { terrainHeight, terrainSlope, LAKE, buildTerrain, buildWater } from './terrain.js';
import { Forest } from './trees.js';
import { makeTorii, toriiMaterial } from './torii.js';
import { makeMinka, makePagoda, makeShrineHall, lanternGeometry, makeLaunchRail, makeDolly, makeShed, buildingMaterial } from './buildings.js';
import { buildClouds } from './sky.js';

const VILLAGE = { x: 150, z: -110, r: 110 };
const SHRINE = { x: -250, z: -450 };
const PAGODA = { x: -300, z: -520 };

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Finds the flattest dry spot near a target. */
function findFlatSpot(rng, cx, cz, r) {
  let best = null;
  for (let i = 0; i < 60; i++) {
    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(0, r);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const h = terrainHeight(x, z);
    if (h < WORLD.waterLevel + 2) continue;
    const s = terrainSlope(x, z);
    if (!best || s < best.s) best = { x, z, h, s };
  }
  return best;
}

export function buildWorld(scene) {
  const rng = new Rng(WORLD.seed);
  const forestNoise = new Noise2D(WORLD.seed + 99);
  const solids = [];
  const clearings = []; // {x, z, r, keep} areas with reduced tree density
  const world = { solids, gates: [], forest: null, dolly: null, beacons: [], houses: [] };

  scene.add(buildTerrain());
  scene.add(buildWater());

  // ---- Course gates ------------------------------------------------------
  const gateDefs = COURSE_GATES;
  for (let i = 0; i < gateDefs.length; i++) {
    const [x, z] = gateDefs[i];
    const prev = i === 0 ? [0, 80] : gateDefs[i - 1];
    const next = gateDefs[i + 1] || null;
    const inV = new THREE.Vector2(x - prev[0], z - prev[1]).normalize();
    const outV = next ? new THREE.Vector2(next[0] - x, next[1] - z).normalize() : inV.clone();
    let dir = inV.clone().add(outV);
    if (dir.length() < 0.1) dir = inV.clone();
    dir.normalize();
    const yaw = Math.atan2(-dir.x, -dir.y);
    const y = terrainHeight(x, z);
    const mesh = makeTorii({ height: 27, width: 30 });
    mesh.position.set(x, y - 0.4, z);
    mesh.rotation.y = yaw;
    scene.add(mesh);
    const info = mesh.userData.torii;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // local +x in world
    const gate = {
      index: i,
      x,
      z,
      y,
      dir: new THREE.Vector3(dir.x, 0, dir.y),
      right,
      innerHalf: info.innerHalf,
      passTop: y + info.nukiBottom,
      mesh,
      info,
    };
    world.gates.push(gate);
    for (const sx of [-1, 1]) {
      solids.push({ type: 'cyl', x: x + right.x * sx * 15, z: z + right.z * sx * 15, r: info.pillarR + 0.4, y0: y - 1, y1: y + info.pillarH, name: 'a torii pillar' });
    }
    solids.push({ type: 'box', x, z, yaw, hx: info.beamHalfLen, hz: info.pillarR * 1.6 + 0.4, y0: y + info.nukiBottom, y1: y + info.beamTop, name: 'a torii beam' });
    clearings.push({ x, z, r: 34, keep: 0 });
    clearings.push({ x, z, r: 60, keep: 0.35 });

    // Beacon: a column of light and a halo in the opening.
    const beacon = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.4, 420, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    col.position.y = 210;
    beacon.add(col);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(9, 0.45, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    halo.position.y = info.nukiBottom * 0.5;
    halo.rotation.y = yaw;
    beacon.add(halo);
    beacon.position.set(x, y, z);
    beacon.visible = false;
    scene.add(beacon);
    gate.beacon = beacon;
    gate.halo = halo;
    gate.column = col;
  }
  // Course corridors for tree thinning.
  const corridors = [];
  for (let i = 0; i < gateDefs.length; i++) {
    const a = i === 0 ? [0, 0] : gateDefs[i - 1];
    corridors.push([a[0], a[1], gateDefs[i][0], gateDefs[i][1]]);
  }

  // ---- Launch field ---------------------------------------------------------
  const fieldH = terrainHeight(0, 0);
  const rail = makeLaunchRail();
  rail.position.set(0, fieldH, 0);
  scene.add(rail);
  const dolly = makeDolly();
  dolly.position.set(0, fieldH, 0);
  scene.add(dolly);
  world.dolly = dolly;
  const shed = makeShed();
  shed.position.set(34, terrainHeight(34, 16), 16);
  shed.rotation.y = -0.35;
  scene.add(shed);
  solids.push({ type: 'box', x: 34, z: 16, yaw: -0.35, hx: shed.userData.collider.hx, hz: shed.userData.collider.hz, y0: terrainHeight(34, 16) - 1, y1: terrainHeight(34, 16) + shed.userData.collider.height, name: 'the hangar' });
  clearings.push({ x: 0, z: 0, r: 70, keep: 0 });
  clearings.push({ x: 0, z: 0, r: 130, keep: 0.25 });

  // ---- Village -------------------------------------------------------------
  const houses = [];
  for (let tries = 0; tries < 120 && houses.length < 17; tries++) {
    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(10, VILLAGE.r);
    const x = VILLAGE.x + Math.cos(a) * d;
    const z = VILLAGE.z + Math.sin(a) * d;
    const h = terrainHeight(x, z);
    if (h < WORLD.waterLevel + 2.5 || terrainSlope(x, z) > 0.32) continue;
    if (houses.some((o) => Math.hypot(o.x - x, o.z - z) < 26)) continue;
    if (world.gates.some((g) => Math.hypot(g.x - x, g.z - z) < 48)) continue;
    const w = rng.float(9, 13);
    const dd = rng.float(7, 9.5);
    const style = rng.chance(0.6) ? 'thatch' : 'tile';
    const house = makeMinka(rng, { w, d: dd, style });
    const yaw = rng.float(0, Math.PI * 2);
    house.position.set(x, h, z);
    house.rotation.y = yaw;
    scene.add(house);
    houses.push({ x, z });
    solids.push({ type: 'box', x, z, yaw, hx: house.userData.collider.hx, hz: house.userData.collider.hz, y0: h - 1, y1: h + house.userData.collider.height, name: 'a farmhouse roof' });
    clearings.push({ x, z, r: 16, keep: 0 });
  }
  world.houses = houses;
  clearings.push({ x: VILLAGE.x, z: VILLAGE.z, r: VILLAGE.r + 30, keep: 0.3 });

  // ---- Shrine, pagoda and the torii path ----------------------------------
  const shrineSpot = findFlatSpot(rng, SHRINE.x, SHRINE.z, 45);
  const hall = makeShrineHall(rng);
  const shrineYaw = Math.atan2(VILLAGE.x - shrineSpot.x, VILLAGE.z - shrineSpot.z);
  hall.position.set(shrineSpot.x, shrineSpot.h, shrineSpot.z);
  hall.rotation.y = shrineYaw;
  scene.add(hall);
  solids.push({ type: 'box', x: shrineSpot.x, z: shrineSpot.z, yaw: shrineYaw, hx: hall.userData.collider.hx, hz: hall.userData.collider.hz, y0: shrineSpot.h - 1, y1: shrineSpot.h + hall.userData.collider.height, name: 'the shrine roof' });
  clearings.push({ x: shrineSpot.x, z: shrineSpot.z, r: 40, keep: 0 });
  clearings.push({ x: shrineSpot.x, z: shrineSpot.z, r: 80, keep: 0.4 });

  const pagodaSpot = findFlatSpot(rng, PAGODA.x, PAGODA.z, 50);
  const pagoda = makePagoda(rng, 5);
  pagoda.position.set(pagodaSpot.x, pagodaSpot.h, pagodaSpot.z);
  pagoda.rotation.y = rng.float(0, 1);
  scene.add(pagoda);
  solids.push({ type: 'cyl', x: pagodaSpot.x, z: pagodaSpot.z, r: pagoda.userData.collider.radius, y0: pagodaSpot.h - 1, y1: pagodaSpot.h + pagoda.userData.collider.height, name: 'the pagoda' });
  clearings.push({ x: pagodaSpot.x, z: pagodaSpot.z, r: 24, keep: 0 });

  // Path of small torii from the village to the shrine entrance.
  const entrance = new THREE.Vector3(shrineSpot.x, 0, shrineSpot.z).add(new THREE.Vector3(Math.sin(shrineYaw), 0, Math.cos(shrineYaw)).multiplyScalar(22));
  // The path leaves the village northwards, crosses the valley well north of
  // the first gate and climbs west to the shrine.
  const pathPts = [
    new THREE.Vector3(VILLAGE.x - 30, 0, VILLAGE.z - 95),
    new THREE.Vector3(VILLAGE.x - 60, 0, VILLAGE.z - 230),
    new THREE.Vector3(-40, 0, -400),
    new THREE.Vector3((entrance.x - 40) / 2 - 30, 0, (entrance.z - 400) / 2 - 20),
    entrance,
  ];
  const path = new THREE.CatmullRomCurve3(pathPts);
  const pathLen = path.getLength();
  const nTorii = Math.floor(pathLen / 7);
  const smallTorii = [];
  const lanternGeo = lanternGeometry();
  const lanterns = [];
  for (let i = 0; i <= nTorii; i++) {
    const t = i / nTorii;
    const p = path.getPointAt(t);
    const tan = path.getTangentAt(t);
    const yaw = Math.atan2(-tan.x, -tan.z);
    const h = terrainHeight(p.x, p.z);
    if (h < WORLD.waterLevel + 1) continue;
    const m = makeTorii({ height: 6, width: 4.4 });
    m.position.set(p.x, h - 0.2, p.z);
    m.rotation.y = yaw;
    scene.add(m);
    smallTorii.push(m);
    if (i % 3 === 0) {
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const s of [-1, 1]) {
        const lp = p.clone().addScaledVector(side, s * 4.2);
        const l = new THREE.Mesh(lanternGeo, buildingMaterial);
        l.position.set(lp.x, terrainHeight(lp.x, lp.z) - 0.1, lp.z);
        l.rotation.y = yaw;
        l.castShadow = true;
        scene.add(l);
        lanterns.push(l);
      }
    }
  }
  // Keep trees off the path.
  const pathSamples = [];
  for (let i = 0; i <= 40; i++) pathSamples.push(path.getPointAt(i / 40));

  // ---- Lake torii ----------------------------------------------------------
  {
    const a = Math.atan2(VILLAGE.z - LAKE.z, VILLAGE.x - LAKE.x);
    const x = LAKE.x + Math.cos(a) * 78;
    const z = LAKE.z + Math.sin(a) * 78;
    const h = terrainHeight(x, z);
    const m = makeTorii({ height: 16, width: 11 });
    const yaw = a + Math.PI / 2;
    m.position.set(x, h, z);
    m.rotation.y = yaw;
    scene.add(m);
    const info = m.userData.torii;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const sx of [-1, 1]) solids.push({ type: 'cyl', x: x + right.x * sx * 5.5, z: z + right.z * sx * 5.5, r: info.pillarR + 0.3, y0: h, y1: h + info.pillarH, name: 'the lake torii' });
    solids.push({ type: 'box', x, z, yaw, hx: info.beamHalfLen, hz: info.pillarR * 1.6 + 0.3, y0: h + info.nukiBottom, y1: h + info.beamTop, name: 'the lake torii' });
  }

  // ---- Forest ---------------------------------------------------------------
  const forest = new Forest(rng.fork());
  const treeRng = rng.fork();
  const step = 10;
  const extent = 1520;
  const density = (x, z, h, slope, d) => {
    if (h < WORLD.waterLevel + 1.5) return 0;
    let dens = 0.46 + 0.5 * forestNoise.fbm(x * 0.004, z * 0.004, 3);
    dens *= 1 - smoothstep(WORLD.treeLine - 110, WORLD.treeLine + 70, h);
    dens *= 1 - smoothstep(0.75, 1.25, slope);
    dens *= 0.4 + 0.6 * (1 - smoothstep(1000, 1500, d));
    for (const c of clearings) {
      const dd = Math.hypot(x - c.x, z - c.z);
      if (dd < c.r) dens *= c.keep;
    }
    for (const s of corridors) {
      if (distToSegment(x, z, s[0], s[1], s[2], s[3]) < 24) dens *= 0.28;
    }
    for (const p of pathSamples) {
      if (Math.hypot(x - p.x, z - p.z) < 8) return 0;
    }
    return dens;
  };
  for (let gx = -extent; gx <= extent; gx += step) {
    for (let gz = -extent; gz <= extent; gz += step) {
      const x = gx + treeRng.float(-4.5, 4.5);
      const z = gz + treeRng.float(-4.5, 4.5);
      const d = Math.hypot(x, z);
      if (d > extent) continue;
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 1.5 || h > WORLD.treeLine + 80) continue;
      const slope = terrainSlope(x, z);
      const dens = density(x, z, h, slope, d);
      if (dens <= 0 || !treeRng.chance(dens)) continue;
      const bamboo = forestNoise.fbm(x * 0.012 + 50, z * 0.012 - 20, 2) > 0.42 && h < 70;
      const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
      const ds = Math.hypot(x - shrineSpot.x, z - shrineSpot.z);
      const mapleMask = forestNoise.fbm(x * 0.009 - 30, z * 0.009 + 70, 2);
      let species;
      let scale = treeRng.float(0.85, 1.2);
      if (bamboo) {
        if (!treeRng.chance(0.55)) continue;
        species = 'bamboo';
      } else if (h > 230) {
        species = treeRng.chance(0.6) ? 'pine' : 'cedar';
        scale *= 0.75;
      } else if (h < 70 && (dv < 260 || dl < 240 || ds < 200)) {
        const r = treeRng.next();
        species = r < 0.42 ? 'maple' : r < 0.6 ? 'pine' : r < 0.78 ? 'cedar' : 'ginkgo';
      } else {
        const r = treeRng.next();
        species = r < 0.62 ? 'cedar' : r < 0.8 ? 'pine' : mapleMask > 0.1 ? 'maple' : 'cedar';
      }
      const variant = treeRng.int(0, forest.variants[species].length - 1);
      const tint = 0.88 + treeRng.float(0, 0.18);
      forest.add(species, variant, x, h, z, treeRng.float(0, Math.PI * 2), scale, new THREE.Color(tint, tint, tint).getHex());
    }
  }
  scene.add(forest.build());
  world.forest = forest;

  // ---- Clouds --------------------------------------------------------------
  const clouds = buildClouds(rng.fork());
  scene.add(clouds);
  world.clouds = clouds;

  world.update = (dt) => {
    clouds.userData.update(dt);
  };

  /** Returns the name of a solid object containing the point, or null. */
  world.hitSolid = (px, py, pz) => {
    for (const s of solids) {
      if (py < s.y0 || py > s.y1) continue;
      if (s.type === 'cyl') {
        if (Math.hypot(px - s.x, pz - s.z) < s.r) return s.name;
      } else {
        const dx = px - s.x;
        const dz = pz - s.z;
        const c = Math.cos(s.yaw);
        const sn = Math.sin(s.yaw);
        const lx = dx * c - dz * sn;
        const lz = dx * sn + dz * c;
        if (Math.abs(lx) < s.hx && Math.abs(lz) < s.hz) return s.name;
      }
    }
    return null;
  };

  world.stats = { trees: forest.count(), houses: houses.length, torii: smallTorii.length + world.gates.length + 1, lanterns: lanterns.length };
  return world;
}
