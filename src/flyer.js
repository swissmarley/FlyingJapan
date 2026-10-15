// The 1903 Wright Flyer, built entirely from primitives.
//
// Layout (metres, body frame): nose points -Z, +Y up, +X to the pilot's right.
// The lower wing's leading edge at the centreline is the origin of the model
// frame; the aircraft's centre of gravity sits at CG so the flight model can
// rotate the whole thing about it.
//
//   wingspan 12.29  chord 1.98  gap 1.88  camber 1-in-20  anhedral ~0.25 m
//   canard elevator 3.66 x 0.76 (two surfaces, 0.75 apart) ahead of the wing
//   twin rudders 2.05 x 0.46, 0.62 apart, behind the wing
//   two 2.59 m pusher propellers, counter-rotating (one chain crossed)
//   four-cylinder engine right of centre, pilot prone left of centre
import * as THREE from 'three';
import { FLYER as F } from './config.js';
import { tubeMesh, canvasTexture } from './geo.js';

export const CG = new THREE.Vector3(0, 0.55, 0.78);

const STRUT_X = [0.92, 2.56, 4.22, 5.86];
const SPARS = [0.06, 1.45];
const SKID_X = 0.92;
const ELEV_Z = -1.98;
const ELEV_Y = 0.32;
const RUD_Z = 3.62;
const RUD_X = 0.31;
const PROP = { x: 1.75, y: 0.95, z: 2.42 };

const HALF = F.span / 2;

function surfaceY(x, t, camberMax, anhedral, half) {
  const sx = Math.min(1, Math.abs(x) / half);
  const tc = Math.pow(t, 0.85);
  return camberMax * 4 * tc * (1 - tc) - anhedral * Math.pow(sx, 1.4);
}

/** Thin cambered surface. Leading edge at z=0, trailing edge at z=chord. */
function wingGeometry(span, chord, camberMax, anhedral, nx = 48, nz = 8, tipRound = 0.3) {
  const half = span / 2;
  const pos = [];
  const uv = [];
  for (let j = 0; j <= nz; j++) {
    const t = j / nz;
    for (let i = 0; i <= nx; i++) {
      const x = -half + (span * i) / nx;
      const sx = Math.abs(x) / half;
      const tipK = Math.max(0, (sx - 0.86) / 0.14);
      const z = t * chord * (1 - tipRound * tipK * tipK * t * t);
      pos.push(x, surfaceY(x, t, camberMax, anhedral, half), z);
      uv.push((x + half) / span, t);
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.base = Float32Array.from(pos);
  g.userData.nx = nx;
  g.userData.nz = nz;
  g.userData.half = half;
  return g;
}

function bladeGeometry(len = 1.2, chord = 0.19) {
  const root = 0.08;
  const g = new THREE.BoxGeometry(chord, len, 0.028, 1, 14, 1);
  g.translate(0, len / 2 + root, 0);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = (v.y - root) / len;
    const twist = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(40, 13, r));
    const taper = 1 - 0.45 * Math.pow(Math.max(0, r - 0.72) / 0.28, 2) + 0.15 * Math.sin(r * Math.PI);
    const x = v.x * taper;
    const z = v.z;
    const c = Math.cos(twist);
    const s = Math.sin(twist);
    pos.setXYZ(i, x * c + z * s, v.y, -x * s + z * c);
  }
  g.computeVertexNormals();
  return g;
}

function fabricMaterial(ribRepeat) {
  const tex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f1e9d4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(120,100,70,${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = 'rgba(105,85,55,0.42)';
    ctx.fillRect(0, 0, 3, h); // rib
    ctx.fillStyle = 'rgba(105,85,55,0.3)';
    ctx.fillRect(0, h * 0.02, w, 2); // front spar
    ctx.fillRect(0, h * 0.72, w, 3); // rear spar
  }, { repeat: [ribRepeat, 1] });
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
}

export function createFlyer() {
  const root = new THREE.Group();
  root.name = 'flyer';
  const body = new THREE.Group();
  body.position.copy(CG).negate();
  root.add(body);

  const mats = {
    wingFabric: fabricMaterial(F.span / 0.3),
    smallFabric: fabricMaterial(F.elevatorSpan / 0.3),
    rudderFabric: fabricMaterial(F.rudderChord / 0.3),
    wood: new THREE.MeshStandardMaterial({ color: 0xd9b67c, roughness: 0.72 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x9b7646, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.5, metalness: 0.6 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xbdbdb8, roughness: 0.4, metalness: 0.75 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.6, metalness: 0.5 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x2b2e3a, roughness: 0.95 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd9a98a, roughness: 0.8 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }),
    prop: new THREE.MeshStandardMaterial({ color: 0xc9a56a, roughness: 0.6 }),
    propTip: new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 }),
  };
  const all = [];
  const add = (mesh, parent = body) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    all.push(mesh);
    return mesh;
  };
  const strut = (a, b, r, mat = mats.wood, parent = body) => add(tubeMesh(a, b, r, mat, 6), parent);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- Wings -------------------------------------------------------------
  const lowerGeo = wingGeometry(F.span, F.chord, F.camber, F.anhedral);
  const upperGeo = wingGeometry(F.span, F.chord, F.camber, F.anhedral);
  const lowerWing = add(new THREE.Mesh(lowerGeo, mats.wingFabric));
  const upperWing = add(new THREE.Mesh(upperGeo, mats.wingFabric));
  upperWing.position.y = F.gap;
  const yL = (x, z) => surfaceY(x, z / F.chord, F.camber, F.anhedral, HALF);
  const yU = (x, z) => F.gap + yL(x, z);

  // Leading-edge spar caps (visible as a thin wooden edge).
  for (const y0 of [0, F.gap]) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const x = -HALF + (F.span * i) / 24;
      pts.push(V(x, y0 + yL(x, 0.03) - 0.005, 0.03));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.03, 5, false), mats.wood));
  }

  // ---- Interplane struts and bracing wires --------------------------------
  const wirePts = [];
  const wire = (a, b) => wirePts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const stations = [...STRUT_X.map((x) => -x).reverse(), ...STRUT_X];
  for (const x of stations) {
    for (const z of SPARS) {
      const r = Math.abs(x) < 1 ? 0.03 : 0.024;
      strut(V(x, yL(x, z), z), V(x, yU(x, z), z), r);
    }
    // Chordwise X bracing on the rigid centre and inner bays.
    if (Math.abs(x) < 3) {
      wire(V(x, yL(x, SPARS[0]), SPARS[0]), V(x, yU(x, SPARS[1]), SPARS[1]));
      wire(V(x, yU(x, SPARS[0]), SPARS[0]), V(x, yL(x, SPARS[1]), SPARS[1]));
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const x0 = stations[i];
    const x1 = stations[i + 1];
    for (const z of SPARS) {
      wire(V(x0, yL(x0, z), z), V(x1, yU(x1, z), z));
      wire(V(x0, yU(x0, z), z), V(x1, yL(x1, z), z));
    }
  }

  // ---- Skids ---------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const x = sx * SKID_X;
    const pts = [V(x, -0.62, 1.75), V(x, -0.62, 0.4), V(x, -0.62, -0.9), V(x, -0.52, -1.6), V(x, -0.25, -2.25), V(x, 0.12, -2.75), V(x, 0.36, -3.0)];
    const curve = new THREE.CatmullRomCurve3(pts);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.04, 6, false), mats.darkWood));
    // Posts from skid up to the lower wing.
    for (const z of SPARS) strut(V(x, -0.62, z), V(x, yL(x, z), z), 0.026, mats.darkWood);
    strut(V(x, -0.62, 0.95), V(x, yL(x, 0.06), 0.06), 0.018, mats.darkWood);
    // Elevator outriggers: a truss from the skid tip and the wing to the canard.
    strut(V(x, -0.3, -2.1), V(x, ELEV_Y - 0.02, ELEV_Z + 0.1), 0.026, mats.darkWood);
    strut(V(x, yL(x, 0.06), 0.06), V(x, ELEV_Y, ELEV_Z + 0.35), 0.02);
    strut(V(x, yU(x, 0.06), 0.06), V(x, ELEV_Y + F.elevatorGap, ELEV_Z + 0.35), 0.02);
    wire(V(x, yL(x, 0.06), 0.06), V(x, ELEV_Y + F.elevatorGap, ELEV_Z + 0.35));
    wire(V(x, -0.62, 0.4), V(x, ELEV_Y, ELEV_Z + 0.1));
  }
  // Cross bar between the skid tips.
  strut(V(-SKID_X, -0.3, -2.1), V(SKID_X, -0.3, -2.1), 0.022, mats.darkWood);
  strut(V(-SKID_X, -0.62, 1.2), V(SKID_X, -0.62, 1.2), 0.022, mats.darkWood);

  // ---- Canard elevator -----------------------------------------------------
  const elevator = new THREE.Group();
  elevator.position.set(0, ELEV_Y, ELEV_Z);
  body.add(elevator);
  for (const y of [0, F.elevatorGap]) {
    const g = wingGeometry(F.elevatorSpan, F.elevatorChord, 0.03, 0, 24, 4, 0.5);
    g.translate(0, 0, -F.elevatorChord / 2);
    const m = add(new THREE.Mesh(g, mats.smallFabric), elevator);
    m.position.y = y;
  }
  for (const x of [-1.55, -0.92, 0.92, 1.55]) {
    for (const z of [-0.3, 0.25]) strut(V(x, 0, z), V(x, F.elevatorGap, z), 0.018, mats.wood, elevator);
  }
  for (const sx of [-1, 1]) {
    wire(V(sx * 1.55, ELEV_Y, ELEV_Z - 0.3), V(sx * 0.92, ELEV_Y + F.elevatorGap, ELEV_Z - 0.3));
    wire(V(sx * 1.55, ELEV_Y + F.elevatorGap, ELEV_Z - 0.3), V(sx * 0.92, ELEV_Y, ELEV_Z - 0.3));
  }

  // ---- Rudder frame and twin rudders ---------------------------------------
  const rudderGroup = new THREE.Group();
  rudderGroup.position.set(0, 0, RUD_Z);
  body.add(rudderGroup);
  const rudders = [];
  for (const sx of [-1, 1]) {
    const x = sx * RUD_X;
    const g = new THREE.PlaneGeometry(F.rudderChord, F.rudderHeight, 2, 6);
    g.rotateY(Math.PI / 2);
    g.translate(0, 0, F.rudderChord / 2);
    const m = add(new THREE.Mesh(g, mats.rudderFabric), rudderGroup);
    m.position.set(x, 0.1 + F.rudderHeight / 2, 0);
    rudders.push(m);
    // Rudder posts.
    const post = strut(V(x, 0.05, 0), V(x, 0.15 + F.rudderHeight, 0), 0.02, mats.wood, rudderGroup);
    post.position.z = 0;
  }
  strut(V(-RUD_X, 0.08, 0.02), V(RUD_X, 0.08, 0.02), 0.018, mats.wood, rudderGroup);
  strut(V(-RUD_X, 0.12 + F.rudderHeight, 0.02), V(RUD_X, 0.12 + F.rudderHeight, 0.02), 0.018, mats.wood, rudderGroup);
  // Booms from the wing rear spars to the rudder.
  for (const sx of [-1, 1]) {
    const x0 = sx * SKID_X;
    strut(V(x0, yL(x0, SPARS[1]) - 0.02, SPARS[1]), V(sx * RUD_X, 0.08, RUD_Z - 0.05), 0.022, mats.darkWood);
    strut(V(x0, yU(x0, SPARS[1]), SPARS[1]), V(sx * RUD_X, 0.12 + F.rudderHeight, RUD_Z - 0.05), 0.022, mats.darkWood);
    strut(V(x0, -0.62, 1.75), V(sx * RUD_X, 0.08, RUD_Z - 0.05), 0.016, mats.darkWood);
    wire(V(x0, yL(x0, SPARS[1]), SPARS[1]), V(sx * RUD_X, 0.12 + F.rudderHeight, RUD_Z - 0.05));
    wire(V(x0, yU(x0, SPARS[1]), SPARS[1]), V(sx * RUD_X, 0.08, RUD_Z - 0.05));
  }
  wire(V(-RUD_X, 0.08, RUD_Z), V(RUD_X, 0.12 + F.rudderHeight, RUD_Z));
  wire(V(RUD_X, 0.08, RUD_Z), V(-RUD_X, 0.12 + F.rudderHeight, RUD_Z));

  // ---- Engine, radiator, fuel tank -----------------------------------------
  const engine = new THREE.Group();
  engine.position.set(0.52, yL(0.52, 0.8) + 0.02, 0.35);
  body.add(engine);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.9), mats.engine), engine).position.set(0, 0.17, 0.45);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.95), mats.metal), engine).position.set(0, 0.04, 0.45);
  for (let k = 0; k < 4; k++) {
    const cyl = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 10), mats.engine), engine);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(0.24, 0.2, 0.15 + k * 0.2);
    const head = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), mats.metal), engine);
    head.rotation.z = Math.PI / 2;
    head.position.set(0.39, 0.2, 0.15 + k * 0.2);
  }
  const flywheel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 18), mats.metal), engine);
  flywheel.rotation.x = Math.PI / 2;
  flywheel.position.set(0, 0.2, 0.95);
  const sprocket = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), mats.chain), engine);
  sprocket.rotation.x = Math.PI / 2;
  sprocket.position.set(0, 0.2, 1.02);
  // Intake / exhaust pipe.
  strut(V(0.1, 0.34, 0.2), V(0.1, 0.34, 0.9), 0.02, mats.metal, engine);
  // Tall, narrow radiator hung on the right front inner strut.
  const radiator = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.25, 0.3), mats.metal));
  radiator.position.set(SKID_X + 0.1, 0.9, 0.2);
  strut(V(SKID_X + 0.1, 1.55, 0.2), V(0.6, yL(0.6, 0.5) + 0.3, 0.5), 0.012, mats.metal);
  // Fuel can under the upper wing.
  const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), mats.metal));
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0.75, F.gap - 0.2, 0.55);
  strut(V(0.75, F.gap - 0.12, 0.45), V(0.75, yU(0.75, 0.45), 0.45), 0.012, mats.metal);

  // ---- Chain drive and propeller shafts ------------------------------------
  const crank = V(0.52, yL(0.52, 0.8) + 0.22, 1.37);
  const props = [];
  for (const sx of [-1, 1]) {
    const hub = V(sx * PROP.x, PROP.y, SPARS[1]);
    // Twin chain-guide tubes (the left chain is crossed to reverse rotation).
    for (const dz of [-0.045, 0.045]) {
      const a = V(crank.x, crank.y, crank.z + dz);
      const b = V(hub.x, hub.y, hub.z + (sx < 0 ? -dz : dz));
      strut(a, b, 0.02, mats.chain);
    }
    // Shaft back to the propeller.
    strut(hub, V(hub.x, hub.y, PROP.z + 0.05), 0.03, mats.metal);
    // Shaft bearing frame braced to the rear struts.
    for (const x of [sx * SKID_X, sx * STRUT_X[1]]) {
      strut(hub, V(x, yL(x, SPARS[1]) + 0.08, SPARS[1]), 0.013, mats.metal);
      strut(hub, V(x, yU(x, SPARS[1]) - 0.08, SPARS[1]), 0.013, mats.metal);
    }
    // Propeller.
    const prop = new THREE.Group();
    prop.position.set(sx * PROP.x, PROP.y, PROP.z);
    body.add(prop);
    const hubMesh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10), mats.metal), prop);
    hubMesh.rotation.x = Math.PI / 2;
    const bladeGeo = bladeGeometry(F.propDiameter / 2 - 0.1, 0.19);
    const blades = [];
    for (const a of [0, Math.PI]) {
      const bl = add(new THREE.Mesh(bladeGeo, mats.prop), prop);
      bl.rotation.z = a;
      blades.push(bl);
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(F.propDiameter / 2, 36),
      new THREE.MeshBasicMaterial({ color: 0xd9cfb6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    prop.add(disc);
    props.push({ group: prop, dir: -sx, blades, disc });
  }

  // ---- Pilot, prone on the lower wing, left of centre ------------------------
  const pilot = new THREE.Group();
  pilot.position.set(-0.46, yL(-0.46, 0.8) + 0.02, 0.18);
  body.add(pilot);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.21, 0.72), mats.cloth), pilot).position.set(0, 0.12, 0.6);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), mats.skin), pilot).position.set(0, 0.2, 0.1);
  const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.07, 12), mats.cap), pilot);
  cap.position.set(0, 0.28, 0.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), mats.cap), pilot).position.set(0, 0.26, -0.03);
  for (const sx of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.78), mats.cloth), pilot).position.set(sx * 0.11, 0.09, 1.32);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), mats.cloth), pilot).position.set(sx * 0.25, 0.12, 0.2);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.skin), pilot).position.set(sx * 0.25, 0.12, -0.05);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), mats.cap), pilot).position.set(sx * 0.11, 0.09, 1.76);
  }
  // Hip cradle rails and the elevator lever.
  for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.5), mats.wood), pilot).position.set(sx * 0.26, 0.1, 0.85);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), mats.wood), pilot).position.set(0, 0.06, 1.1);
  strut(V(0.32, 0.05, -0.1), V(0.34, 0.45, -0.25), 0.012, mats.metal, pilot);

  // ---- Bracing wires as one LineSegments -----------------------------------
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1e1e1e }));
  body.add(wires);

  // ---- Contact points (body frame relative to CG) --------------------------
  const contacts = [
    { p: V(-SKID_X, -0.62, 1.7), skid: true },
    { p: V(SKID_X, -0.62, 1.7), skid: true },
    { p: V(-SKID_X, -0.62, -0.9), skid: true },
    { p: V(SKID_X, -0.62, -0.9), skid: true },
    { p: V(-SKID_X, -0.25, -2.25), skid: true },
    { p: V(SKID_X, -0.25, -2.25), skid: true },
    { p: V(-6.1, -0.26, 1.0), skid: false, name: 'left wingtip' },
    { p: V(6.1, -0.26, 1.0), skid: false, name: 'right wingtip' },
    { p: V(0, 0.05, RUD_Z + 0.4), skid: false, name: 'rudder' },
    { p: V(0, ELEV_Y, ELEV_Z - 0.4), skid: false, name: 'elevator' },
    { p: V(-PROP.x, PROP.y - F.propDiameter / 2, PROP.z), skid: false, name: 'left propeller' },
    { p: V(PROP.x, PROP.y - F.propDiameter / 2, PROP.z), skid: false, name: 'right propeller' },
  ].map((c) => ({ ...c, p: c.p.sub(CG) }));

  // Sample points for tree / building collisions.
  const probes = [V(-6, 0.6, 0.6), V(-3, 0.6, 0.6), V(0, 0.9, 0.7), V(3, 0.6, 0.6), V(6, 0.6, 0.6), V(0, 0.5, ELEV_Z), V(0, 1.1, RUD_Z + 0.2), V(0, 1.9, 0.5)].map((p) => p.sub(CG));

  // Pilot's eye point for the cockpit camera.
  const eye = V(-0.46, yL(-0.46, 0.8) + 0.3, 0.05).sub(CG);

  // ---- Animation --------------------------------------------------------------
  let warpState = 0;
  const applyWarp = (warp) => {
    for (const geo of [lowerGeo, upperGeo]) {
      const base = geo.userData.base;
      const pos = geo.attributes.position;
      const nx = geo.userData.nx;
      const nz = geo.userData.nz;
      const half = geo.userData.half;
      for (let j = 0; j <= nz; j++) {
        const t = j / nz;
        for (let i = 0; i <= nx; i++) {
          const k = j * (nx + 1) + i;
          const x = base[k * 3];
          const sx = Math.abs(x) / half;
          const dy = -warp * Math.sign(x) * sx * sx * Math.pow(t, 1.5) * 0.26;
          pos.setY(k, base[k * 3 + 1] + dy);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };

  let propAngle = 0;
  function update(dt, s) {
    elevator.rotation.x = s.elevator * 0.32;
    for (const r of rudders) r.rotation.y = s.rudder * 0.45;
    const w = THREE.MathUtils.clamp(s.warp, -1, 1);
    if (Math.abs(w - warpState) > 0.01) {
      warpState += (w - warpState) * Math.min(1, dt * 10);
      applyWarp(warpState);
    }
    propAngle += (s.propRpm * Math.PI * 2 * dt) / 60;
    flywheel.rotation.z = propAngle * 3;
    sprocket.rotation.z = propAngle * 3;
    const blur = THREE.MathUtils.clamp((s.propRpm - 120) / 180, 0, 1);
    for (const p of props) {
      p.group.rotation.z = propAngle * p.dir;
      p.disc.material.opacity = blur * 0.32;
      for (const b of p.blades) {
        b.material = blur > 0.9 ? mats.propTip : mats.prop;
        b.visible = blur < 0.98;
      }
    }
  }

  return { root, body, update, contacts, probes, eye, elevator, rudderGroup };
}
