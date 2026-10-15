// Procedural Japanese buildings: minka farmhouses, a five-storey pagoda, a
// shrine hall, stone lanterns and the Wrights' wooden launch rail.
import * as THREE from 'three';
import { part, merge, box, hipRoof, loftFace, tubeBetween, canvasTexture, v3, eul } from './geo.js';
import { VERMILION } from './torii.js';

const WOOD = 0x6e4b2a;
const DARK_WOOD = 0x3d2a18;
const PLASTER = 0xe8dcc4;
const THATCH = 0x9c7f49;
const THATCH_DARK = 0x6f5831;
const TILE = 0x474b55;
const TILE_DARK = 0x2f323a;
const STONE = 0x7a7772;
const COPPER = 0x5e7f72;

export const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

let wallTex = null;
function wallMaterial() {
  if (!wallTex) {
    wallTex = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#ece2cb';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      const panels = 4;
      const pw = w / panels;
      for (let k = 0; k < panels; k++) {
        const x0 = k * pw;
        if (k % 2 === 1) {
          // Shoji panel: pale paper with a lattice.
          ctx.fillStyle = '#f7f2e6';
          ctx.fillRect(x0 + 10, 24, pw - 20, h - 48);
          ctx.strokeStyle = '#4b3722';
          ctx.lineWidth = 3;
          for (let i = 0; i <= 4; i++) {
            const x = x0 + 10 + ((pw - 20) * i) / 4;
            ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, h - 24); ctx.stroke();
          }
          for (let i = 0; i <= 6; i++) {
            const y = 24 + ((h - 48) * i) / 6;
            ctx.beginPath(); ctx.moveTo(x0 + 10, y); ctx.lineTo(x0 + pw - 10, y); ctx.stroke();
          }
        } else {
          // Plaster panel with a horizontal rail.
          ctx.fillStyle = '#4b3722';
          ctx.fillRect(x0, h * 0.55, pw, 8);
        }
        ctx.fillStyle = '#3d2a18';
        ctx.fillRect(x0 - 5, 0, 10, h); // posts
      }
      ctx.fillStyle = '#3d2a18';
      ctx.fillRect(0, 0, w, 14);
      ctx.fillRect(0, h - 14, w, 14);
    });
  }
  return new THREE.MeshLambertMaterial({ map: wallTex });
}

/**
 * A farmhouse. Returns a Group whose userData.collider describes a yaw-aligned box.
 */
export function makeMinka(rng, { w = 11, d = 8, style = 'thatch' } = {}) {
  const g = new THREE.Group();
  const wallH = 2.7;
  const floorY = 0.6;
  const parts = [];
  // Stone foundation, sunk into the slope.
  parts.push(box(w + 1.2, 3.2, d + 1.2, STONE, v3(0, floorY - 1.6, 0)));
  // Engawa deck and posts.
  parts.push(box(w + 2.2, 0.22, d + 2.2, WOOD, v3(0, floorY, 0)));
  const eaveY = floorY + wallH + 0.25;
  const thatch = style === 'thatch';
  const ridgeY = eaveY + (thatch ? 3.8 : 2.9) * (d / 8);
  const overhang = thatch ? 1.5 : 1.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(new THREE.CylinderGeometry(0.09, 0.09, eaveY - floorY, 6), DARK_WOOD, v3(sx * (w / 2 + 0.9), (eaveY + floorY) / 2, sz * (d / 2 + 0.9))));
    }
  }
  // Roof.
  const roofColor = thatch ? THATCH : TILE;
  const roof = hipRoof(w, d, overhang, eaveY, ridgeY, w * 0.55, roofColor, {
    sag: thatch ? 0.25 : 0.12,
    cornerLift: thatch ? 0 : 0.18,
    thickness: thatch ? 0.55 : 0.2,
    underColor: thatch ? THATCH_DARK : TILE_DARK,
  });
  parts.push(roof);
  // Ridge cap.
  parts.push(box(w * 0.55 + 0.8, 0.35, 0.8, thatch ? THATCH_DARK : TILE_DARK, v3(0, ridgeY + 0.1, 0)));
  if (thatch) {
    // Ridge "umagushi" crossed poles typical of gassho/thatched roofs.
    for (let i = -2; i <= 2; i++) {
      const x = (i / 2) * w * 0.25;
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4), DARK_WOOD, v3(x, ridgeY + 0.3, 0), eul(0.5, 0, 0)));
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 4), DARK_WOOD, v3(x, ridgeY + 0.3, 0), eul(-0.5, 0, 0)));
    }
  }
  const body = new THREE.Mesh(merge(parts), buildingMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Textured walls.
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMaterial());
  walls.position.y = floorY + wallH / 2 + 0.1;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);
  g.userData.collider = { hx: w / 2 + overhang, hz: d / 2 + overhang, height: ridgeY + 0.5 };
  return g;
}

/** Five-storey pagoda (gojunoto). */
export function makePagoda(rng, tiers = 5) {
  const parts = [];
  let y = 0;
  parts.push(box(11, 1.2, 11, STONE, v3(0, 0.6, 0)));
  y = 1.2;
  const baseW = 7.4;
  for (let t = 0; t < tiers; t++) {
    const w = baseW - t * 0.85;
    const bodyH = 2.6;
    parts.push(box(w, bodyH, w, PLASTER, v3(0, y + bodyH / 2, 0)));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.18, 0.18, bodyH, 6), VERMILION, v3(sx * w * 0.46, y + bodyH / 2, sz * w * 0.46)));
    }
    // Balcony rail.
    if (t > 0) parts.push(box(w + 1.6, 0.12, w + 1.6, DARK_WOOD, v3(0, y + 0.9, 0)));
    const eaveY = y + bodyH;
    const roofH = 1.7;
    parts.push(hipRoof(w, w, 2.1, eaveY, eaveY + roofH, 0.4, TILE, { sag: 0.28, cornerLift: 0.45, thickness: 0.22, underColor: VERMILION }));
    y = eaveY + roofH - 0.3;
  }
  // Sorin spire: a pole with nine rings and a flame finial.
  const spireH = 6;
  parts.push(part(new THREE.CylinderGeometry(0.14, 0.2, spireH, 8), 0xb89a4a, v3(0, y + spireH / 2, 0)));
  for (let i = 0; i < 9; i++) parts.push(part(new THREE.TorusGeometry(0.55 - i * 0.03, 0.08, 6, 14), 0xc9aa55, v3(0, y + 1.2 + i * 0.45, 0), eul(Math.PI / 2, 0, 0)));
  parts.push(part(new THREE.SphereGeometry(0.35, 8, 6), 0xc9aa55, v3(0, y + spireH + 0.2, 0)));
  const mesh = new THREE.Mesh(merge(parts), buildingMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.collider = { radius: baseW / 2 + 2.2, height: y + spireH + 0.6 };
  return g;
}

/** Shrine main hall with a gabled, copper-green roof and a wide stair. */
export function makeShrineHall(rng) {
  const parts = [];
  const w = 14;
  const d = 9;
  const floorY = 1.4;
  parts.push(box(w + 2, 1.6, d + 2, STONE, v3(0, 0.8 - 0.4, 0)));
  parts.push(box(w + 2.6, 0.3, d + 2.6, WOOD, v3(0, floorY, 0)));
  const wallH = 3.6;
  parts.push(box(w, wallH, d, PLASTER, v3(0, floorY + wallH / 2, 0)));
  for (let i = 0; i <= 6; i++) {
    const x = -w / 2 + (w * i) / 6;
    for (const sz of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.22, 0.22, wallH + 0.3, 7), VERMILION, v3(x, floorY + wallH / 2, sz * (d / 2 + 0.05))));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, wallH + 0.3, 7), VERMILION, v3(sx * (w / 2 + 1.1), floorY + wallH / 2, sz * (d / 2 + 1.1))));
  }
  const eaveY = floorY + wallH + 0.3;
  parts.push(hipRoof(w, d, 2.4, eaveY, eaveY + 4.2, w * 0.8, COPPER, { sag: 0.35, cornerLift: 0.5, thickness: 0.3, underColor: 0x3a2a1a }));
  parts.push(box(w * 0.8 + 1, 0.5, 1.0, 0x3a4a44, v3(0, eaveY + 4.3, 0)));
  // Chigi (crossed finials) and katsuogi (ridge billets).
  for (const sx of [-1, 1]) {
    parts.push(box(0.25, 3.2, 0.25, 0x3a2a1a, v3(sx * (w * 0.4 + 0.4), eaveY + 5.2, 0), eul(0, 0, sx * 0.35)));
  }
  for (let i = -2; i <= 2; i++) parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6), 0x3a2a1a, v3(i * 2.2, eaveY + 4.9, 0), eul(Math.PI / 2, 0, 0)));
  // Stairs.
  for (let i = 0; i < 5; i++) parts.push(box(5, 0.28, 0.7, WOOD, v3(0, 0.14 + i * 0.28, d / 2 + 1.3 + (4 - i) * 0.6)));
  const mesh = new THREE.Mesh(merge(parts), buildingMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.collider = { hx: w / 2 + 2.4, hz: d / 2 + 2.4, height: eaveY + 6 };
  return g;
}

/** Stone lantern (ishi-doro). */
export function lanternGeometry() {
  const parts = [];
  parts.push(box(1.1, 0.3, 1.1, STONE, v3(0, 0.15, 0)));
  parts.push(part(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 6), STONE, v3(0, 1.0, 0)));
  parts.push(box(0.8, 0.18, 0.8, STONE, v3(0, 1.78, 0)));
  parts.push(box(0.6, 0.6, 0.6, 0x8f8a80, v3(0, 2.18, 0)));
  parts.push(part(new THREE.ConeGeometry(0.75, 0.45, 6), STONE, v3(0, 2.7, 0)));
  parts.push(part(new THREE.SphereGeometry(0.16, 6, 5), STONE, v3(0, 3.02, 0)));
  return merge(parts);
}

/** The 60-foot launching rail with sleepers, plus a separate dolly ("truck"). */
export function makeLaunchRail(length = 18.3) {
  const parts = [];
  const railH = 0.1;
  parts.push(box(0.1, railH, length, 0xb3915f, v3(0, 0.22, -length / 2 + 2.5)));
  parts.push(box(0.3, 0.05, length, 0x8a6d44, v3(0, 0.27 + railH / 2, -length / 2 + 2.5)));
  for (let i = 0; i < 13; i++) {
    parts.push(box(1.2, 0.17, 0.25, 0x7c6440, v3(0, 0.085, 2.5 - (i * length) / 12)));
  }
  const mesh = new THREE.Mesh(merge(parts), buildingMaterial);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function makeDolly() {
  const parts = [];
  parts.push(box(2.4, 0.12, 1.2, 0x8a6d44, v3(0, 0.45, 0)));
  parts.push(box(0.5, 0.12, 2.0, 0x8a6d44, v3(0, 0.45, 0)));
  // bicycle hubs riding the rail
  for (const z of [-0.8, 0.8]) parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), 0x333333, v3(0, 0.36, z), eul(0, 0, Math.PI / 2)));
  const mesh = new THREE.Mesh(merge(parts), buildingMaterial);
  mesh.castShadow = true;
  return mesh;
}

/** A small wooden shed, like the Wrights' Kill Devil Hills hangar. */
export function makeShed() {
  const parts = [];
  const w = 14;
  const d = 7;
  const h = 3.2;
  parts.push(box(w, h, d, 0x9a8160, v3(0, h / 2, 0)));
  for (let i = 0; i <= 10; i++) parts.push(box(0.12, h, 0.08, 0x5e4a30, v3(-w / 2 + (w * i) / 10, h / 2, d / 2 + 0.04)));
  const roofParts = [];
  const a0 = v3(-w / 2 - 0.5, h, d / 2 + 0.5);
  const a1 = v3(w / 2 + 0.5, h, d / 2 + 0.5);
  const b0 = v3(-w / 2 - 0.5, h + 1.6, 0);
  const b1 = v3(w / 2 + 0.5, h + 1.6, 0);
  const c = v3(0, h, 0);
  roofParts.push(loftFace(a0, a1, b0, b1, 0x6f5d44, { rows: 1, cols: 1, center: c }));
  roofParts.push(loftFace(v3(w / 2 + 0.5, h, -d / 2 - 0.5), v3(-w / 2 - 0.5, h, -d / 2 - 0.5), b1, b0, 0x6f5d44, { rows: 1, cols: 1, center: c }));
  parts.push(...roofParts);
  parts.push(box(w, 0.1, 0.1, 0x6f5d44, v3(0, h + 1.6, 0)));
  const mesh = new THREE.Mesh(merge(parts), buildingMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.collider = { hx: w / 2 + 0.5, hz: d / 2 + 0.5, height: h + 1.8 };
  return g;
}
