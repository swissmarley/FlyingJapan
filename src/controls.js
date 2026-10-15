// Keyboard, touch and gamepad input with smoothed axes.

export class Controls {
  constructor() {
    this.keys = new Set();
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.throttleRate = 0; // -1..1 per second scale
    this.invertPitch = false;
    this.listeners = {};
    this.touch = { active: false, x: 0, y: 0, throttleUp: false, throttleDown: false };
    this.anyKeyPressed = false;
    this.pointerLocked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.anyKeyPressed = true;
      const map = { KeyC: 'camera', KeyR: 'reset', KeyM: 'mute', KeyH: 'help', KeyP: 'pause', KeyI: 'invert', Escape: 'help', Enter: 'start', Space: 'start' };
      if (map[e.code]) this.emit(map[e.code]);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }

  emit(name) {
    for (const fn of this.listeners[name] || []) fn();
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Wires on-screen touch controls (elements created in index.html). */
  bindTouch(stick, knob, btnUp, btnDown, btnCam) {
    const radius = 54;
    let id = null;
    let cx = 0;
    let cy = 0;
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) {
        dx *= radius / d;
        dy *= radius / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.x = dx / radius;
      this.touch.y = dy / radius;
    };
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      this.touch.active = true;
      stick.setPointerCapture(id);
      move(e);
      this.anyKeyPressed = true;
    });
    stick.addEventListener('pointermove', move);
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.touch.active = false;
      this.touch.x = this.touch.y = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    const hold = (el, key) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touch[key] = true;
        this.anyKeyPressed = true;
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => (this.touch[key] = false));
    };
    hold(btnUp, 'throttleUp');
    hold(btnDown, 'throttleDown');
    btnCam.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.emit('camera');
    });
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      const r = dz(gp.axes[0] || 0);
      const p = dz(gp.axes[1] || 0);
      const y = dz(gp.axes[2] || 0);
      const up = gp.buttons[7]?.value || 0;
      const down = gp.buttons[6]?.value || 0;
      if (r || p || y || up || down) {
        this.anyKeyPressed = true;
        return { roll: r, pitch: -p, yaw: y, throttle: up - down };
      }
    }
    return null;
  }

  update(dt) {
    const t = this.touch;
    const gp = this.pollGamepad();
    let pitchT = 0;
    let rollT = 0;
    let yawT = 0;
    let thr = 0;
    if (this.down('ArrowUp', 'KeyW')) pitchT += 1;
    if (this.down('ArrowDown', 'KeyS')) pitchT -= 1;
    if (this.down('ArrowRight', 'KeyD')) rollT += 1;
    if (this.down('ArrowLeft', 'KeyA')) rollT -= 1;
    if (this.down('KeyE')) yawT += 1;
    if (this.down('KeyQ')) yawT -= 1;
    if (this.down('ShiftLeft', 'ShiftRight', 'KeyZ', 'Equal', 'NumpadAdd')) thr += 1;
    if (this.down('ControlLeft', 'ControlRight', 'KeyX', 'Minus', 'NumpadSubtract')) thr -= 1;
    if (t.active) {
      rollT += t.x;
      pitchT += -t.y;
    }
    if (t.throttleUp) thr += 1;
    if (t.throttleDown) thr -= 1;
    if (gp) {
      rollT += gp.roll;
      pitchT += gp.pitch;
      yawT += gp.yaw;
      thr += gp.throttle;
    }
    if (this.invertPitch) pitchT = -pitchT;
    pitchT = Math.max(-1, Math.min(1, pitchT));
    rollT = Math.max(-1, Math.min(1, rollT));
    yawT = Math.max(-1, Math.min(1, yawT));
    const ease = (cur, target) => {
      const rate = Math.abs(target) > Math.abs(cur) ? 5.5 : 7.5;
      return cur + (target - cur) * Math.min(1, dt * rate);
    };
    this.pitch = ease(this.pitch, pitchT);
    this.roll = ease(this.roll, rollT);
    this.yaw = ease(this.yaw, yawT);
    this.throttleRate = Math.max(-1, Math.min(1, thr));
  }
}
