// Simplified six-degree-of-freedom flight model tuned to the Flyer's numbers:
// 340 kg gross, 47 m² of cambered biplane wing, a cambered CL0, a gentle stall
// around 15°, high parasite drag from the struts and wires, and twin pusher
// propellers. The engine is a little hotter than the historic 12 hp so the
// aircraft can climb out of the valley; everything else is to scale.
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { FLYER as F } from './config.js';
import { clamp } from './rng.js';

const G = 9.81;
const RHO = 1.225;
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _vRel = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _force = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _wp = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _omegaW = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class FlightModel {
  constructor(contacts) {
    this.contacts = contacts;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3(); // body angular velocity
    this.throttle = 0;
    this.input = { pitch: 0, roll: 0, yaw: 0 };
    this.wind = new THREE.Vector3(0, 0, 4.5); // steady breeze blowing south: a headwind on the rail
    this.engineOn = true;
    this.onGround = false;
    this.rail = { active: true, z0: 2.5, z1: -15.8, dollyZ: 0 };
    this.rpm = 0;
    this.airspeed = 0;
    this.alpha = 0;
    this.beta = 0;
    this.stall = false;
    this.crash = null;
    this.crashed = false;
    this.time = 0;
    this.gust = 0;
    this.params = {
      mass: F.massGross,
      S: F.wingArea,
      CL0: 0.33,
      CLa: 4.3,
      alphaStall: 0.27,
      CD0: 0.05,
      k: 0.085,
      Tmax: 1900,
      Vmax: 40,
      Ipitch: 1500,
      Iyaw: 3000,
      Iroll: 1600,
    };
  }

  reset() {
    const h = terrainHeight(0, 0);
    this.pos.set(0, h + 0.33 + 1.18, 0);
    this.quat.identity();
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.throttle = 0;
    this.rail.active = true;
    this.rail.dollyZ = 0;
    this.engineOn = true;
    this.crash = null;
    this.crashed = false;
    this.onGround = true;
    this.rpm = 0;
  }

  groundAt(x, z) {
    const h = terrainHeight(x, z);
    if (this.rail.active && Math.abs(x) < 1.6 && z < this.rail.z0 + 1 && z > this.rail.z1 - 1) return h + 0.33;
    return h;
  }

  /** Altitude above ground at the CG. */
  agl() {
    return this.pos.y - terrainHeight(this.pos.x, this.pos.z);
  }

  heading() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    let hdg = Math.atan2(_fwd.x, -_fwd.z);
    if (hdg < 0) hdg += Math.PI * 2;
    return hdg;
  }

  bank() {
    _right.set(1, 0, 0).applyQuaternion(this.quat);
    _up.set(0, 1, 0).applyQuaternion(this.quat);
    return Math.atan2(-_right.y, _up.y);
  }

  pitch() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return Math.asin(clamp(_fwd.y, -1, 1));
  }

  step(dt) {
    const P = this.params;
    const q = this.quat;
    this.time += dt;
    _qInv.copy(q).invert();
    _fwd.set(0, 0, -1).applyQuaternion(q);
    _up.set(0, 1, 0).applyQuaternion(q);
    _right.set(1, 0, 0).applyQuaternion(q);

    // Wind with slow gusts.
    this.gust = Math.sin(this.time * 0.37) * 0.8 + Math.sin(this.time * 1.13) * 0.4;
    _vRel.copy(this.vel).sub(this.wind).addScaledVector(_right, this.gust * 0.3).addScaledVector(_fwd, -this.gust * 0.5);
    const V = _vRel.length();
    this.airspeed = V;
    _vLocal.copy(_vRel).applyQuaternion(_qInv);
    const u = Math.max(-_vLocal.z, 0.1);
    const w = _vLocal.y;
    const v = _vLocal.x;
    const alpha = V > 0.5 ? Math.atan2(-w, u) : 0;
    const beta = V > 0.5 ? Math.atan2(v, u) : 0;
    this.alpha = alpha;
    this.beta = beta;
    const qd = 0.5 * RHO * V * V;

    // Lift and drag.
    const as = P.alphaStall;
    let CL = P.CL0 + P.CLa * alpha;
    if (alpha > as) CL = P.CL0 + P.CLa * as - (alpha - as) * 2.6;
    else if (alpha < -as * 0.8) CL = P.CL0 - P.CLa * as * 0.8 + (alpha + as * 0.8) * 2.6;
    CL = clamp(CL, -0.9, 1.6);
    if (this.crashed) CL *= 0.15;
    this.stall = alpha > as + 0.015 && V > 6;
    const CD = P.CD0 + P.k * CL * CL + (alpha > as ? (alpha - as) * 1.1 : 0) + (this.crashed ? 0.4 : 0);

    _force.set(0, -P.mass * G, 0);
    if (V > 0.5) {
      _tmp.copy(_vRel).divideScalar(V); // velocity direction
      _tmp2.copy(_up).addScaledVector(_tmp, -_up.dot(_tmp)).normalize(); // lift direction
      _force.addScaledVector(_tmp2, qd * P.S * CL);
      _force.addScaledVector(_tmp, -qd * P.S * CD);
      _force.addScaledVector(_right, -qd * P.S * 0.45 * beta);
    }

    // Engine and thrust.
    const targetRpm = this.engineOn ? 70 + this.throttle * (F.propRpm - 70) : 0;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 2.2);
    const thrust = this.engineOn ? P.Tmax * this.throttle * Math.max(0, 1 - V / P.Vmax) : 0;
    _force.addScaledVector(_fwd, thrust);

    // Moments, expressed directly as angular accelerations scaled by dynamic pressure.
    const s = Math.min(V / 15, 2.2);
    const s2 = s * s;
    const pitchRate = this.angVel.x;
    const yawRate = -this.angVel.y;
    const rollRate = -this.angVel.z;
    const elev = this.crashed ? 0 : this.input.pitch;
    const warp = this.crashed ? 0 : this.input.roll;
    const rud = clamp((this.crashed ? 0 : this.input.yaw) + 0.45 * warp, -1, 1);

    const bank = this.bank();
    const pitchAngle = this.pitch();
    let pitchAcc = (elev * 1.5 - (alpha - 0.045) * 8.5 - Math.sin(pitchAngle) * 0.9) * s2 - pitchRate * 3.4 * s;
    if (alpha > as) pitchAcc -= (alpha - as) * 9 * s2;
    // Wing warping, roll damping, spiral stability (keeps a held bank near 50°) and a touch of anhedral.
    let rollAcc = warp * 2.2 * s2 - rollRate * 3.2 * s - Math.sin(bank) * 1.4 * s2 - beta * 0.12 * s2;
    let yawAcc = rud * 1.1 * s2 + beta * 2.6 * s2 - yawRate * 2.4 * s - warp * 0.3 * s2;

    this.angVel.x += pitchAcc * dt;
    this.angVel.y += -yawAcc * dt;
    this.angVel.z += -rollAcc * dt;

    // Ground contact: penalty springs at the skids, wingtips, tail and nose.
    _force.divideScalar(P.mass); // now an acceleration
    _omegaW.copy(this.angVel).applyQuaternion(q);
    let anyContact = false;
    let skidContact = false;
    for (const c of this.contacts) {
      _r.copy(c.p).applyQuaternion(q);
      _wp.copy(this.pos).add(_r);
      const gh = this.groundAt(_wp.x, _wp.z);
      const pen = gh - _wp.y;
      if (pen <= 0) continue;
      anyContact = true;
      if (c.skid) skidContact = true;
      _vp.copy(_omegaW).cross(_r).add(this.vel);
      if (!this.crashed && !this.crash) {
        if (!c.skid && (_vp.length() > 6.5 || V > 9)) this.crash = `${c.name} struck the ground`;
        else if (c.skid && _vp.y < -5.2) this.crash = 'hard landing';
        else if (c.skid && Math.abs(this.bank()) > 0.6 && V > 6) this.crash = 'cartwheeled on landing';
      }
      let Fn = pen * 55000 - _vp.y * 5200;
      Fn = clamp(Fn, 0, 24000);
      _force.y += Fn / P.mass;
      _torque.set(0, Fn, 0);
      _torque.copy(_r).cross(_torque).applyQuaternion(_qInv);
      this.angVel.x += (_torque.x / P.Ipitch) * dt;
      this.angVel.y += (_torque.y / P.Iyaw) * dt;
      this.angVel.z += (_torque.z / P.Iroll) * dt;
      // Friction.
      _tmp.set(_vp.x, 0, _vp.z);
      const sp = _tmp.length();
      const mu = this.rail.active && c.skid ? 0.025 : c.skid ? 0.22 : 0.55;
      if (sp > 0.05) {
        const Ff = Math.min(mu * Fn, (sp * P.mass) / dt / this.contacts.length);
        _force.addScaledVector(_tmp.divideScalar(sp), -Ff / P.mass);
      }
    }
    this.onGround = anyContact;
    if (anyContact) {
      const damp = Math.max(0, 1 - 2.5 * dt);
      this.angVel.multiplyScalar(damp);
    }
    if (this.crashed) {
      this.vel.multiplyScalar(Math.max(0, 1 - 0.8 * dt));
    }

    // Launch rail: the dolly keeps the aircraft tracking straight.
    if (this.rail.active) {
      if (skidContact) {
        // A restraining wire holds the Flyer until the engine pulls it forward.
        if (this.vel.z > 0 && this.throttle < 0.1) this.vel.z = 0;
        this.vel.x -= (this.vel.x * 8 + this.pos.x * 30) * dt;
        this.angVel.y *= Math.max(0, 1 - 12 * dt);
        this.angVel.z *= Math.max(0, 1 - 6 * dt);
        this.rail.dollyZ = this.pos.z;
      }
      if (this.pos.z < this.rail.z1 - 0.5 || this.pos.y - terrainHeight(this.pos.x, this.pos.z) > 2.6) this.rail.active = false;
    }

    // Integrate.
    this.vel.addScaledVector(_force, dt);
    const speed = this.vel.length();
    if (speed > 48) this.vel.multiplyScalar(48 / speed);
    this.pos.addScaledVector(this.vel, dt);
    const wl = this.angVel.length();
    if (wl > 1e-6) {
      _dq.setFromAxisAngle(_tmp.copy(this.angVel).divideScalar(wl), wl * dt);
      q.multiply(_dq).normalize();
    }

    // Soft world boundary: the mountains close the valley.
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > 1550) {
      _tmp.set(-this.pos.x, 0, -this.pos.z).normalize();
      this.vel.addScaledVector(_tmp, (d - 1550) * 0.08 * dt);
    }
    if (this.pos.y > 900) this.vel.y -= (this.pos.y - 900) * 0.05 * dt;
  }

  markCrashed() {
    this.crashed = true;
    this.engineOn = false;
    this.throttle = 0;
  }
}
