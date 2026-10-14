// Small helpers for building merged, vertex-coloured low-poly geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

/**
 * Returns a non-indexed copy of `geometry` with a flat vertex colour and an
 * optional transform applied. Parts made this way can be merged together.
 */
export function part(geometry, color, position = null, rotation = null, scale = null) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (position || rotation || scale) {
    _q.identity();
    if (rotation) _q.setFromEuler(rotation);
    _m.compose(position || new THREE.Vector3(), _q, scale || _one);
    g.applyMatrix4(_m);
  }
  const n = g.attributes.position.count;
  _c.set(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/** A cylinder running from point a to point b (as a coloured part). */
export function tubeBetween(a, b, r, color, segments = 5, rTop = r) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(rTop, r, len, segments, 1);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  _m.compose(mid, q, _one);
  geo.applyMatrix4(_m);
  return part(geo, color);
}

/** Mesh version of tubeBetween for objects that are not merged. */
export function tubeMesh(a, b, r, material, segments = 6, rTop = r) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(rTop, r, len, segments, 1);
  const mesh = new THREE.Mesh(geo, material);
  const dir = b.clone().sub(a).normalize();
  mesh.quaternion.setFromUnitVectors(_up, dir);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  return mesh;
}

export function box(w, h, d, color, position, rotation, scale) {
  return part(new THREE.BoxGeometry(w, h, d), color, position, rotation, scale);
}

export function v3(x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}
export function eul(x = 0, y = 0, z = 0) {
  return new THREE.Euler(x, y, z);
}

/**
 * Lofts a surface between a bottom edge (a0 -> a1) and a top edge (b0 -> b1),
 * subdivided so the profile can sag (concave sweep) and the corners can lift.
 * Winding is fixed so the normal faces away from `outsideRef`'s opposite, i.e.
 * away from the given centre point.
 */
export function loftFace(a0, a1, b0, b1, color, { rows = 5, cols = 6, sag = 0, cornerLift = 0, center = null } = {}) {
  const pos = [];
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const s = c / cols;
      bottom.lerpVectors(a0, a1, s);
      top.lerpVectors(b0, b1, s);
      p.lerpVectors(bottom, top, t);
      p.y -= sag * 4 * t * (1 - t);
      const edge = Math.abs(s - 0.5) * 2;
      p.y += cornerLift * edge * edge * edge * (1 - t) * (1 - t);
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const cc = a + cols + 1;
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (center) {
    // Flip winding if the face points toward the centre.
    const n = new THREE.Vector3();
    const mid = new THREE.Vector3().addVectors(a0, a1).add(b0).add(b1).multiplyScalar(0.25);
    g.computeBoundingBox();
    const tri = new THREE.Triangle(
      new THREE.Vector3().fromArray(pos, 0),
      new THREE.Vector3().fromArray(pos, (cols + 1) * 3),
      new THREE.Vector3().fromArray(pos, 3),
    );
    tri.getNormal(n);
    if (n.dot(mid.clone().sub(center)) < 0) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 3) {
        const tmp = ia[i + 1];
        ia[i + 1] = ia[i + 2];
        ia[i + 2] = tmp;
      }
      g.computeVertexNormals();
    }
  }
  return part(g, color);
}

/**
 * Hipped roof with an optional ridge (ridgeLen = 0 gives a pyramid). Centred on
 * the origin in x/z, eaves at eaveY, ridge at ridgeY.
 */
export function hipRoof(w, d, overhang, eaveY, ridgeY, ridgeLen, color, { sag = 0.15, cornerLift = 0, thickness = 0.18, underColor = null } = {}) {
  const W = w / 2 + overhang;
  const D = d / 2 + overhang;
  const rl = ridgeLen / 2;
  const center = v3(0, (eaveY + ridgeY) / 2, 0);
  const c = [v3(-W, eaveY, D), v3(W, eaveY, D), v3(W, eaveY, -D), v3(-W, eaveY, -D)];
  const r0 = v3(-rl, ridgeY, 0);
  const r1 = v3(rl, ridgeY, 0);
  const opts = { sag, cornerLift, center };
  const parts = [
    loftFace(c[0], c[1], r0, r1, color, opts), // front
    loftFace(c[2], c[3], r1, r0, color, opts), // back
    loftFace(c[1], c[2], r1, r1, color, { ...opts, cols: 4 }), // right
    loftFace(c[3], c[0], r0, r0, color, { ...opts, cols: 4 }), // left
  ];
  if (thickness > 0) {
    // Underside: same roof lowered a little, facing down, slightly darker.
    const uc = underColor ?? new THREE.Color(color).multiplyScalar(0.55).getHex();
    const dy = -thickness;
    const cu = c.map((p) => v3(p.x, p.y + dy, p.z));
    const ru0 = v3(r0.x, r0.y + dy, 0);
    const ru1 = v3(r1.x, r1.y + dy, 0);
    const under = v3(0, ridgeY + 50, 0); // flip winding to face away from a point far above
    parts.push(
      loftFace(cu[0], cu[1], ru0, ru1, uc, { ...opts, center: under }),
      loftFace(cu[2], cu[3], ru1, ru0, uc, { ...opts, center: under }),
      loftFace(cu[1], cu[2], ru1, ru1, uc, { ...opts, cols: 4, center: under }),
      loftFace(cu[3], cu[0], ru0, ru0, uc, { ...opts, cols: 4, center: under }),
    );
    // Eave edge strip.
    const strip = (p0, p1) => {
      const q0 = v3(p0.x, p0.y + dy, p0.z);
      const q1 = v3(p1.x, p1.y + dy, p1.z);
      return loftFace(q0, q1, p0, p1, uc, { rows: 1, cols: 1, center });
    };
    parts.push(strip(c[0], c[1]), strip(c[1], c[2]), strip(c[2], c[3]), strip(c[3], c[0]));
  }
  return merge(parts);
}

/** Canvas texture helper. */
export function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
