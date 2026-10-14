import * as THREE from 'three';
import { part, merge } from './geo.js';
import { WORLD } from './config.js';

export const SUN_DIR = new THREE.Vector3(0.42, 0.72, 0.55).normalize();

/** Gradient sky dome that follows the camera. */
export function buildSky() {
  const geo = new THREE.SphereGeometry(4200, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b63b8) },
      mid: { value: new THREE.Color(0x8fbce6) },
      horizon: { value: new THREE.Color(WORLD.fogColor) },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color(0xfff2d6) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y, -0.2, 1.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, t));
        c = mix(c, top, smoothstep(0.22, 0.9, t));
        float s = max(dot(vDir, sunDir), 0.0);
        c += sunColor * (pow(s, 900.0) * 1.4 + pow(s, 14.0) * 0.22 + pow(s, 3.0) * 0.05);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8c8a6a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.near = 50;
  cam.far = 1200;
  cam.left = -170;
  cam.right = 170;
  cam.top = 170;
  cam.bottom = -170;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  return { hemi, sun };
}

/** Keeps the shadow frustum centred on the aircraft. */
export function updateSun(sun, focus) {
  sun.position.copy(focus).addScaledVector(SUN_DIR, 500);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
}

/** Low-poly drifting clouds. */
export function buildClouds(rng) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.93 });
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const parts = [];
    const n = rng.int(4, 9);
    const stretch = rng.float(1, 1.8);
    for (let k = 0; k < n; k++) {
      const r = rng.float(16, 34);
      const g = new THREE.IcosahedronGeometry(r, 1);
      parts.push(part(g, 0xffffff, new THREE.Vector3(rng.float(-40, 40) * stretch, rng.float(-6, 6), rng.float(-18, 18)), null, new THREE.Vector3(1, 0.45, 1)));
    }
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.castShadow = true;
    const a = rng.float(0, Math.PI * 2);
    const d = rng.float(150, 1500);
    mesh.position.set(Math.cos(a) * d, rng.float(190, 420), Math.sin(a) * d);
    mesh.rotation.y = rng.float(0, Math.PI * 2);
    const s = rng.float(0.8, 1.7);
    mesh.scale.set(s, s, s);
    group.add(mesh);
    clouds.push({ mesh, speed: rng.float(1.2, 3) });
  }
  group.userData.update = (dt) => {
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 1700) c.mesh.position.x = -1700;
    }
  };
  return group;
}
