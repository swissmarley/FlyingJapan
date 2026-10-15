import * as THREE from 'three';
import { Noise2D, smoothstep, lerp, clamp } from './rng.js';
import { WORLD } from './config.js';

const noise = new Noise2D(WORLD.seed);
const detail = new Noise2D(WORLD.seed + 7);

export const LAKE = { x: 330, z: -300, r: 150 };
const FUJI = { x: -450, z: -2250, r: 1500, h: 1500 };
const PEAKS = [
  { x: 1550, z: 350, r: 750, h: 650 },
  { x: -1450, z: -350, r: 650, h: 600 },
  { x: 300, z: 1650, r: 800, h: 700 },
  { x: -1150, z: 1250, r: 650, h: 520 },
  { x: 1350, z: -1250, r: 700, h: 620 },
  { x: 900, z: 1100, r: 500, h: 380 },
];

/** Analytic terrain height in metres. Everything (trees, houses, physics) samples this. */
export function terrainHeight(x, z) {
  // Rolling valley floor.
  let h = 7 + 14 * noise.fbm(x * 0.0025, z * 0.0025, 4) + 3.5 * noise.fbm(x * 0.012 + 9, z * 0.012 - 4, 3);

  const d = Math.hypot(x, z);

  // Forested hills surrounding the valley.
  const hills = noise.ridged(x * 0.0011 + 3.1, z * 0.0011 - 1.7, 4);
  h += hills * 115 * smoothstep(140, 650, d);

  // Mountain ring that encloses the playable world.
  const ring = smoothstep(850, 1750, d);
  h += ring * (260 + 380 * noise.ridged(x * 0.0007 + 11, z * 0.0007 + 5, 5));

  // Individual peaks.
  for (const p of PEAKS) {
    const t = 1 - smoothstep(0, p.r, Math.hypot(x - p.x, z - p.z));
    h += p.h * t * t * (0.75 + 0.25 * noise.fbm(x * 0.004, z * 0.004, 3));
  }

  // A great snow-capped volcano on the northern horizon.
  {
    const t = Math.max(0, 1 - Math.hypot(x - FUJI.x, z - FUJI.z) / FUJI.r);
    h += FUJI.h * Math.pow(t, 2.1) * (0.92 + 0.08 * noise.fbm(x * 0.003, z * 0.003, 2));
  }

  // Lake basin.
  const lakeT = 1 - smoothstep(LAKE.r * 0.7, LAKE.r * 1.35, Math.hypot(x - LAKE.x, z - LAKE.z));
  h = lerp(h, -10, lakeT);

  // Flat meadow around the launch rail.
  const field = 1 - smoothstep(55, 230, d);
  h = lerp(h, 6, field);

  return h;
}

export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 1.5;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function terrainSlope(x, z) {
  const e = 2;
  const hx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const hz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(hx, hz);
}

export function isWater(x, z) {
  return terrainHeight(x, z) < WORLD.waterLevel;
}

const C = {
  meadow: new THREE.Color(0x8fa84a),
  grass: new THREE.Color(0x5f8a38),
  forestFloor: new THREE.Color(0x3f6230),
  highGrass: new THREE.Color(0x8b8a4e),
  rock: new THREE.Color(0x6e6a63),
  darkRock: new THREE.Color(0x4f4b48),
  snow: new THREE.Color(0xf4f6fa),
  mud: new THREE.Color(0x8a7a52),
  sand: new THREE.Color(0xc9b98a),
};
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function terrainColor(x, z, h, slope, out) {
  const d = Math.hypot(x, z);
  const n = detail.fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5;
  const n2 = detail.fbm(x * 0.006 + 40, z * 0.006, 2) * 0.5 + 0.5;

  // Base vegetation colour.
  tmpA.copy(C.meadow).lerp(C.grass, smoothstep(40, 260, d));
  tmpA.lerp(C.forestFloor, clamp(n2 * 0.9, 0, 1) * smoothstep(60, 400, d));
  tmpA.lerp(C.highGrass, smoothstep(220, 420, h));

  // Rock on steep ground and at altitude.
  const rockiness = clamp(smoothstep(0.55, 1.1, slope) + smoothstep(380, 620, h) * 0.8, 0, 1);
  tmpB.copy(C.rock).lerp(C.darkRock, n);
  tmpA.lerp(tmpB, rockiness);

  // Snow above the snow line, less on cliffs.
  const snowT = smoothstep(WORLD.snowLine - 60 + 90 * n, WORLD.snowLine + 120, h) * (1 - smoothstep(0.9, 1.6, slope) * 0.6);
  tmpA.lerp(C.snow, snowT);

  // Lake shore and bed.
  const shore = 1 - smoothstep(WORLD.waterLevel, WORLD.waterLevel + 2.5, h);
  tmpB.copy(C.sand).lerp(C.mud, smoothstep(WORLD.waterLevel - 6, WORLD.waterLevel, h) * 0.3 + (1 - smoothstep(WORLD.waterLevel - 6, WORLD.waterLevel, h)));
  tmpA.lerp(tmpB, shore);

  // Subtle noise so flat areas are not uniform.
  tmpA.multiplyScalar(0.9 + 0.2 * n);
  out.copy(tmpA);
}

/** Builds the ground mesh with a radially warped grid: fine near the centre, coarse far away. */
export function buildTerrain() {
  const N = 380;
  const half = WORLD.size / 2;
  const count = (N + 1) * (N + 1);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const warp = (p) => Math.sign(p) * Math.pow(Math.abs(p), 1.65) * half;
  const c = new THREE.Color();
  let k = 0;
  for (let j = 0; j <= N; j++) {
    const v = (j / N) * 2 - 1;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      const x = warp(u);
      const z = warp(v);
      const y = terrainHeight(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      terrainColor(x, z, y, terrainSlope(x, z), c);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      k++;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const cc = a + N + 1;
      const d = cc + 1;
      idx[k++] = a; idx[k++] = cc; idx[k++] = b;
      idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f6f98,
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WORLD.waterLevel;
  mesh.receiveShadow = true;
  mesh.name = 'water';
  return mesh;
}
