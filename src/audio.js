// Procedural sound: a four-cylinder thump, propeller wash and wind, all from
// oscillators and filtered noise. Nothing is loaded from disk.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(ctx.destination);

    // Engine: two detuned oscillators through a low-pass, amplitude-chopped by a
    // square LFO that stands in for the cylinders firing.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.engineFilter = lp;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.osc1.connect(mix);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    this.osc2.connect(g2).connect(mix);
    this.chop = ctx.createGain();
    this.chop.gain.value = 0.6;
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    this.lfo.connect(lfoGain).connect(this.chop.gain);
    mix.connect(this.chop).connect(lp).connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.lfo.start();

    // Noise source shared by prop wash and wind.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    this.prop = mkNoise('bandpass', 260, 0.8);
    this.wind = mkNoise('lowpass', 700, 0.5);

    // Little chime for gates.
    this.chimeGain = ctx.createGain();
    this.chimeGain.gain.value = 0.5;
    this.chimeGain.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  chime(n = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = n >= 99 ? [523, 659, 784, 1047] : [660, 880];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.4, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.6);
      o.connect(g).connect(this.chimeGain);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.7);
    });
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** rpm: propeller rpm (0..~350); airspeed in m/s. */
  update(rpm, airspeed, engineOn) {
    if (!this.ctx) return;
    const engineRpm = rpm * (1025 / 348);
    const firing = (engineRpm / 60) * 2; // 4-stroke, 4 cylinders
    const running = engineOn && rpm > 20;
    this.osc1.frequency.value = Math.max(20, firing);
    this.osc2.frequency.value = Math.max(20, firing * 2.01);
    this.lfo.frequency.value = Math.max(1, firing / 2);
    this.engineFilter.frequency.value = 250 + (rpm / 350) * 1400;
    this.engineGain.gain.value = running ? 0.12 + (rpm / 350) * 0.35 : 0;
    this.prop.g.gain.value = (rpm / 350) * 0.35;
    this.prop.f.frequency.value = 150 + (rpm / 350) * 350;
    this.wind.g.gain.value = Math.min(0.6, (airspeed / 25) ** 2 * 0.5);
    this.wind.f.frequency.value = 300 + airspeed * 40;
  }
}
