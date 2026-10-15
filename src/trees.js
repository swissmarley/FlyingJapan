// Procedural Japanese forest: sugi (cedar), matsu (pine), momiji (maple),
// ginkgo and bamboo groves. Each species has a few geometry variants that are
// drawn with InstancedMesh, chunked so distant tiles can be frustum culled.
import * as THREE from 'three';
import { part, merge, tubeBetween, v3, eul } from './geo.js';

const CHUNK = 480;

function trunkColor(rng) {
  return new THREE.Color().setHSL(0.07 + rng.float(-0.01, 0.02), 0.35, 0.22 + rng.float(-0.04, 0.06)).getHex();
}

function makeCedar(rng) {
  const H = rng.float(17, 27);
  const R = H * rng.float(0.13, 0.17);
  const parts = [];
  const tc = trunkColor(rng);
  parts.push(part(new THREE.CylinderGeometry(0.22, 0.42, H * 0.42, 6), tc, v3(0, H * 0.21, 0)));
  const layers = 4;
  const base = new THREE.Color(0x2f5d2c);
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const y0 = H * (0.22 + 0.78 * t * 0.8);
    const hh = H * 0.34;
    const rr = R * (1 - t * 0.72) * rng.float(0.9, 1.1);
    const col = base.clone().offsetHSL(rng.float(-0.02, 0.02), rng.float(-0.05, 0.05), rng.float(-0.04, 0.04) + t * 0.04);
    parts.push(part(new THREE.ConeGeometry(rr, hh, 7), col.getHex(), v3(0, y0 + hh / 2, 0), eul(0, rng.float(0, 1), 0)));
  }
  return { geo: merge(parts), canopyR: R * 0.75, baseY: H * 0.2, topY: H, trunkR: 0.4 };
}

function makePine(rng) {
  const H = rng.float(8, 14);
  const parts = [];
  const tc = trunkColor(rng);
  // Trunk in three bent segments.
  let p = v3(0, 0, 0);
  let dir = v3(rng.float(-0.18, 0.18), 1, rng.float(-0.18, 0.18)).normalize();
  const segs = 3;
  const tips = [];
  for (let i = 0; i < segs; i++) {
    const len = (H / segs) * rng.float(0.85, 1.15);
    const q = p.clone().addScaledVector(dir, len);
    parts.push(tubeBetween(p, q, 0.32 - i * 0.08, tc, 6, 0.26 - i * 0.08));
    if (i >= 1) tips.push({ p: p.clone(), dir: dir.clone() });
    p = q;
    dir = v3(dir.x + rng.float(-0.35, 0.35), 1, dir.z + rng.float(-0.35, 0.35)).normalize();
  }
  const green = new THREE.Color(0x2e5a3a);
  const pad = (center, r, col) => {
    parts.push(part(new THREE.IcosahedronGeometry(r, 1), col, center, eul(0, rng.float(0, 2), 0), v3(1, rng.float(0.35, 0.5), 1)));
  };
  // Branches with pads.
  const nb = rng.int(3, 5);
  let maxR = 1.5;
  for (let i = 0; i < nb; i++) {
    const t = rng.float(0.45, 0.95);
    const base = v3(0, H * t, 0);
    const a = rng.float(0, Math.PI * 2);
    const len = rng.float(1.6, 3.6) * (1.2 - t * 0.5);
    const end = base.clone().add(v3(Math.cos(a) * len, rng.float(0.1, 0.9), Math.sin(a) * len));
    parts.push(tubeBetween(base, end, 0.11, tc, 5, 0.06));
    const r = rng.float(1.5, 2.6);
    pad(end.clone().add(v3(0, r * 0.25, 0)), r, green.clone().offsetHSL(rng.float(-0.03, 0.03), rng.float(-0.08, 0.08), rng.float(-0.05, 0.05)).getHex());
    maxR = Math.max(maxR, len + r);
  }
  pad(p.clone().add(v3(0, 0.3, 0)), rng.float(1.8, 2.6), green.clone().offsetHSL(0, 0, 0.03).getHex());
  return { geo: merge(parts), canopyR: maxR * 0.8, baseY: H * 0.4, topY: H + 1.5, trunkR: 0.35 };
}

const MAPLE_COLORS = [0xc8262b, 0xd94b1f, 0xe8641c, 0xb81f2c, 0xf08a1e];
const GINKGO_COLORS = [0xf2c21b, 0xe9b414, 0xf5d547];

function makeBroadleaf(rng, palette, H0 = 6.5) {
  const H = H0 * rng.float(0.85, 1.25);
  const parts = [];
  const tc = trunkColor(rng);
  const trunkH = H * 0.42;
  parts.push(part(new THREE.CylinderGeometry(0.16, 0.3, trunkH, 6), tc, v3(0, trunkH / 2, 0)));
  const nb = rng.int(2, 4);
  for (let i = 0; i < nb; i++) {
    const a = rng.float(0, Math.PI * 2);
    const b = v3(0, trunkH * rng.float(0.6, 0.95), 0);
    const e = b.clone().add(v3(Math.cos(a) * rng.float(1, 2), rng.float(1, 2), Math.sin(a) * rng.float(1, 2)));
    parts.push(tubeBetween(b, e, 0.1, tc, 5, 0.05));
  }
  const n = rng.int(4, 6);
  const R = H * 0.45;
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.float(-0.4, 0.4);
    const d = i === 0 ? 0 : R * rng.float(0.35, 0.7);
    const r = R * rng.float(0.55, 0.8);
    const c = v3(Math.cos(a) * d, trunkH + R * 0.5 + rng.float(-0.3, 0.6), Math.sin(a) * d);
    const col = new THREE.Color(rng.pick(palette)).offsetHSL(rng.float(-0.015, 0.015), 0, rng.float(-0.06, 0.06)).getHex();
    parts.push(part(new THREE.IcosahedronGeometry(r, 1), col, c, eul(rng.float(0, 1), rng.float(0, 2), 0), v3(1, rng.float(0.75, 0.95), 1)));
    maxR = Math.max(maxR, d + r);
  }
  return { geo: merge(parts), canopyR: maxR * 0.85, baseY: trunkH * 0.9, topY: trunkH + R * 1.3, trunkR: 0.3 };
}

function makeBamboo(rng) {
  const parts = [];
  const n = rng.int(9, 16);
  let top = 0;
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(0, 2.2);
    const H = rng.float(9, 14);
    const base = v3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const lean = v3(rng.float(-0.12, 0.12), 1, rng.float(-0.12, 0.12)).normalize();
    const tip = base.clone().addScaledVector(lean, H);
    const col = new THREE.Color().setHSL(0.2 + rng.float(-0.02, 0.03), 0.45, 0.42 + rng.float(-0.06, 0.06)).getHex();
    parts.push(tubeBetween(base, tip, 0.09, col, 4, 0.05));
    const leaf = new THREE.Color(0x5f9340).offsetHSL(rng.float(-0.02, 0.02), 0, rng.float(-0.05, 0.05)).getHex();
    for (let k = 0; k < 2; k++) {
      const t = k === 0 ? rng.float(0.65, 0.8) : rng.float(0.9, 1.0);
      const c = base.clone().addScaledVector(lean, H * t);
      parts.push(part(new THREE.IcosahedronGeometry(rng.float(0.7, 1.1), 0), leaf, c, eul(rng.float(0, 1), rng.float(0, 2), 0), v3(1.4, 0.5, 1.0)));
    }
    top = Math.max(top, H);
  }
  return { geo: merge(parts), canopyR: 2.6, baseY: 0, topY: top, trunkR: 2.2 };
}

export const SPECIES = {
  cedar: { make: makeCedar, variants: 4 },
  pine: { make: makePine, variants: 4 },
  maple: { make: (rng) => makeBroadleaf(rng, MAPLE_COLORS, 6.5), variants: 4 },
  ginkgo: { make: (rng) => makeBroadleaf(rng, GINKGO_COLORS, 8), variants: 2 },
  bamboo: { make: makeBamboo, variants: 3 },
};

export class Forest {
  constructor(rng) {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.variants = {};
    for (const [name, s] of Object.entries(SPECIES)) {
      this.variants[name] = [];
      for (let i = 0; i < s.variants; i++) this.variants[name].push(s.make(rng.fork()));
    }
    this.placements = [];
    this.group = new THREE.Group();
    this.group.name = 'forest';
    this.cells = new Map(); // spatial hash for collisions
  }

  add(species, variantIndex, x, y, z, yaw, scale, tint = 0xffffff) {
    this.placements.push({ species, variantIndex, x, y, z, yaw, scale, tint });
  }

  build() {
    const buckets = new Map();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (const pl of this.placements) {
      const cx = Math.floor(pl.x / CHUNK);
      const cz = Math.floor(pl.z / CHUNK);
      const key = `${pl.species}:${pl.variantIndex}:${cx}:${cz}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(pl);
      // Collision record.
      const v = this.variants[pl.species][pl.variantIndex];
      const ck = `${Math.floor(pl.x / 24)}:${Math.floor(pl.z / 24)}`;
      if (!this.cells.has(ck)) this.cells.set(ck, []);
      this.cells.get(ck).push({
        species: pl.species,
        x: pl.x,
        z: pl.z,
        baseY: pl.y + v.baseY * pl.scale,
        topY: pl.y + v.topY * pl.scale,
        r: v.canopyR * pl.scale,
        trunkR: v.trunkR * pl.scale,
        groundY: pl.y,
      });
    }
    for (const [key, list] of buckets) {
      const [species, vi] = key.split(':');
      const v = this.variants[species][Number(vi)];
      const mesh = new THREE.InstancedMesh(v.geo, this.material, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((pl, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw);
        s.set(pl.scale, pl.scale * (0.9 + 0.2 * ((i * 7919) % 13) / 13), pl.scale);
        p.set(pl.x, pl.y - 0.3, pl.z);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.set(pl.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    return this.group;
  }

  /** Returns a tree whose canopy or trunk contains the world point, or null. */
  hit(px, py, pz) {
    const cx = Math.floor(px / 24);
    const cz = Math.floor(pz / 24);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.cells.get(`${cx + dx}:${cz + dz}`);
        if (!list) continue;
        for (const t of list) {
          const d = Math.hypot(px - t.x, pz - t.z);
          if (d < t.trunkR && py < t.topY && py > t.groundY - 1) return t;
          if (d < t.r * 0.82 && py > t.baseY && py < t.topY) return t;
        }
      }
    }
    return null;
  }

  count() {
    return this.placements.length;
  }
}
