// DOM heads-up display.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      speed: $('hud-speed'),
      speedMph: $('hud-speed-mph'),
      alt: $('hud-alt'),
      throttle: $('hud-throttle'),
      throttleBar: $('hud-throttle-bar'),
      heading: $('hud-heading'),
      gates: $('hud-gates'),
      timer: $('hud-timer'),
      best: $('hud-best'),
      message: $('hud-message'),
      sub: $('hud-sub'),
      compass: $('compass-arrow'),
      compassDist: $('compass-dist'),
      intro: $('intro'),
      help: $('help'),
      flash: $('flash'),
      stall: $('hud-stall'),
      camera: $('hud-camera'),
      mute: $('hud-mute'),
      pause: $('pause'),
    };
    this.messageUntil = 0;
    this.lastDom = 0;
  }

  static fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }

  message(text, sub = '', duration = 3) {
    this.el.message.textContent = text;
    this.el.sub.textContent = sub;
    this.el.message.parentElement.classList.add('show');
    this.messageUntil = performance.now() / 1000 + duration;
  }

  flash() {
    this.el.flash.classList.remove('go');
    void this.el.flash.offsetWidth;
    this.el.flash.classList.add('go');
  }

  update(now, data) {
    if (now > this.messageUntil) this.el.message.parentElement.classList.remove('show');
    if (now - this.lastDom < 0.08) return;
    this.lastDom = now;
    const kmh = data.speed * 3.6;
    this.el.speed.textContent = kmh.toFixed(0);
    this.el.speedMph.textContent = `${(data.speed * 2.23694).toFixed(0)} mph`;
    this.el.alt.textContent = Math.max(0, data.agl).toFixed(0);
    this.el.throttle.textContent = `${Math.round(data.throttle * 100)}%`;
    this.el.throttleBar.style.width = `${Math.round(data.throttle * 100)}%`;
    const deg = Math.round((data.heading * 180) / Math.PI) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    this.el.heading.textContent = `${deg.toString().padStart(3, '0')}° ${dirs[Math.round(deg / 45) % 8]}`;
    this.el.gates.textContent = `${data.gate} / ${data.gateTotal}`;
    this.el.timer.textContent = Hud.fmtTime(data.time);
    this.el.best.textContent = data.best != null ? `best ${Hud.fmtTime(data.best)}` : '';
    this.el.stall.style.opacity = data.stall ? 1 : 0;
    if (data.compass != null) {
      this.el.compass.style.transform = `rotate(${data.compass}rad)`;
      this.el.compassDist.textContent = `${Math.round(data.compassDist)} m`;
      this.el.compass.parentElement.style.opacity = 1;
    } else {
      this.el.compass.parentElement.style.opacity = 0;
    }
    this.el.camera.textContent = data.cameraName;
    this.el.mute.textContent = data.muted ? 'muted (M)' : 'sound on (M)';
  }

  showIntro(show) {
    this.el.intro.classList.toggle('hidden', !show);
  }

  toggleHelp(force) {
    this.el.help.classList.toggle('hidden', force === undefined ? undefined : !force);
  }

  showPause(show) {
    this.el.pause.classList.toggle('hidden', !show);
  }
}
