// Procedural torii gates in the Myojin style: round pillars leaning slightly
// inward, a lower tie beam (nuki) passing through them, a shimaki and an
// upward-curving black kasagi on top, with a small central gakuzuka post.
import * as THREE from 'three';
import { part, merge, box, v3, eul } from './geo.js';

export const VERMILION = 0xd8452a;
const BLACK = 0x1b1a19;
const STONE = 0x6c6a66;

export function toriiGeometry({ height = 6, width = 4.4, vermilion = VERMILION } = {}) {
  const pr = height * 0.036; // pillar radius
  const half = width / 2;
  const parts = [];
  const pillarH = height * 0.9;
  const lean = 0.03; // radians, uchikorobi

  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(pr * 0.92, pr, pillarH, 12);
    parts.push(part(g, vermilion, v3(sx * half, pillarH / 2, 0), eul(0, 0, sx * lean)));
    parts.push(part(new THREE.CylinderGeometry(pr * 1.45, pr * 1.6, pr * 1.2, 12), STONE, v3(sx * half, pr * 0.6, 0)));
    // Daiwa (ring collar) under the kasagi.
    parts.push(part(new THREE.CylinderGeometry(pr * 1.3, pr * 1.3, pr * 0.8, 12), BLACK, v3(sx * (half - lean * pillarH), pillarH - pr * 0.4, 0)));
  }

  // Nuki: lower beam through the pillars.
  const nukiY = height * 0.72;
  parts.push(box(width * 1.22, pr * 1.6, pr * 1.0, vermilion, v3(0, nukiY, 0)));
  // Kusabi wedges at the joints.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(pr * 0.5, pr * 1.9, pr * 0.5, BLACK, v3(sx * (half + pr * 1.1), nukiY, sz * pr * 0.75)));
  }
  // Shimaki: upper straight beam.
  const shimakiH = pr * 1.8;
  const shimakiY = pillarH + shimakiH / 2 - pr * 0.1;
  parts.push(box(width * 1.32, shimakiH, pr * 1.6, vermilion, v3(0, shimakiY, 0)));

  // Kasagi: curved top beam with raised ends.
  {
    const len = width * 1.42;
    const h = pr * 1.7;
    const g = new THREE.BoxGeometry(len, h, pr * 2.2, 32, 1, 1);
    const pos = g.attributes.position;
    const lift = height * 0.05;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = Math.abs(x) / (len / 2);
      pos.setY(i, pos.getY(i) + lift * t * t * t + (pos.getY(i) > 0 ? 0 : -t * t * h * 0.25));
    }
    g.computeVertexNormals();
    parts.push(part(g, BLACK, v3(0, shimakiY + shimakiH / 2 + h / 2, 0)));
  }

  // Gakuzuka: short centre post, with a black name plaque.
  const gakuH = shimakiY - shimakiH / 2 - (nukiY + pr * 0.8);
  parts.push(box(pr * 1.1, gakuH, pr * 0.8, vermilion, v3(0, nukiY + pr * 0.8 + gakuH / 2, 0)));
  parts.push(box(pr * 2.0, gakuH * 0.8, pr * 0.25, BLACK, v3(0, nukiY + pr * 0.8 + gakuH / 2, pr * 0.55)));

  const geo = merge(parts);
  return {
    geo,
    info: {
      height,
      width,
      pillarR: pr,
      pillarH,
      nukiBottom: nukiY - pr * 0.8,
      beamTop: shimakiY + shimakiH / 2 + pr * 1.7 + height * 0.05,
      beamHalfLen: width * 0.71,
      innerHalf: half - pr,
    },
  };
}

export const toriiMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** A torii mesh. The opening faces +z/-z (pillars along x). */
export function makeTorii(opts) {
  const { geo, info } = toriiGeometry(opts);
  const mesh = new THREE.Mesh(geo, toriiMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.torii = info;
  return mesh;
}
