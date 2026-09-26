// Paisaje sonoro generativo con Web Audio: un acorde ambiental que se abre con la floración
// y campanillas al pellizcar. No usa archivos de audio.

const CHIME_SCALE = [880, 987.77, 1108.73, 1318.51, 1479.98, 1760]; // La mayor pentatónica
const PAD_NOTES = [110, 164.81, 220, 277.18, 329.63, 493.88]; // La mayor con novena

export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  _build() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AudioCtx());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(4.5, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 0.6;
    const dry = ctx.createGain();
    dry.gain.value = 0.6;
    this.filter.connect(dry).connect(this.master);
    this.filter.connect(this.reverb);

    PAD_NOTES.forEach((frequency, i) => {
      const level = 0.055 / (1 + i * 0.25);
      const voice = ctx.createGain();
      voice.gain.value = level;
      // Cada voz respira a su propio ritmo lento
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.08;
      const depth = ctx.createGain();
      depth.gain.value = level * 0.8;
      lfo.connect(depth).connect(voice.gain);
      lfo.start();
      [-4, 4].forEach((cents, k) => {
        const osc = ctx.createOscillator();
        osc.type = k ? 'triangle' : 'sine';
        osc.frequency.value = frequency;
        osc.detune.value = cents;
        osc.connect(voice);
        osc.start();
      });
      voice.connect(this.filter);
    });
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  }

  async toggle() {
    return this.enabled ? this.disable() : this.enable();
  }

  async enable() {
    if (!this.ctx) this._build();
    await this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.5, t, 0.8);
    this.enabled = true;
    return true;
  }

  disable() {
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.3);
    }
    this.enabled = false;
    return false;
  }

  suspend(hidden) {
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else if (this.enabled) this.ctx.resume();
  }

  setMood(bloom, zoom) {
    if (!this.enabled) return;
    const cutoff = Math.min(3200, Math.max(250, 380 + bloom * 1500 + Math.log2(zoom) * 260));
    this.filter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.4);
  }

  _tone(frequency, peak, decay, type = 'sine') {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain);
    gain.connect(this.reverb);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }

  chime() {
    if (!this.enabled) return;
    const f = CHIME_SCALE[(Math.random() * CHIME_SCALE.length) | 0];
    this._tone(f, 0.07, 2.2);
    this._tone(f * 2, 0.02, 1.4);
  }

  shutter() {
    if (!this.enabled) return;
    this._tone(1760, 0.05, 0.5, 'triangle');
    this._tone(2637, 0.03, 0.8);
  }

  _noise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  // Barrido de frecuencia con envolvente: base de los efectos de ciencia ficción
  _sweep({ type = 'sine', from, to, peak, duration, filter = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      osc.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  _burst(duration, peak, cutoffFrom, cutoffTo) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = this._noise(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrom, t);
    filter.frequency.exponentialRampToValueAtTime(cutoffTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    noise.connect(filter).connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    noise.start(t);
  }

  // Supernova / Big Bang: impacto grave con cola de ruido
  boom() {
    if (!this.enabled) return;
    this._sweep({ from: 110, to: 28, peak: 0.35, duration: 1.8 });
    this._burst(2.2, 0.25, 2400, 60);
  }

  // Repulsor: descarga eléctrica descendente
  zap() {
    if (!this.enabled) return;
    this._sweep({ type: 'sawtooth', from: 1400, to: 160, peak: 0.08, duration: 0.35, filter: 2600 });
    this._burst(0.4, 0.12, 6000, 400);
  }

  // Hiperespacio: soplido ascendente
  whoosh() {
    if (!this.enabled) return;
    this._burst(1.4, 0.16, 300, 5000);
    this._sweep({ from: 60, to: 240, peak: 0.12, duration: 1.2 });
  }

  // Pitidos de interfaz holográfica
  beep(count = 2) {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) setTimeout(() => this._tone(1318.51 + i * 440, 0.035, 0.18, 'square'), i * 90);
  }
}
