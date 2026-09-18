// Procedural sound: every cue is synthesized with WebAudio so there are no assets to
// license or load. Ambient water and rain loop quietly; one-shots are short and soft.
type Cue = 'cast' | 'splash' | 'bite' | 'hook' | 'catch' | 'legendary' | 'escape' | 'coin' | 'click' | 'toss' | 'wrong' | 'countdown' | 'pin' | 'chat' | 'bark' | 'lamp' | 'drop';
export class Harbourphone {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private reelOsc: OscillatorNode | null = null;
  private reelGain: GainNode | null = null;
  private lastCue = new Map<Cue, number>();
  enabled = false;
  volume = 0.7;
  // Browsers require a user gesture; call from a click/keydown handler.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }
  private startAmbient() {
    const ctx = this.ctx!;
    // Filtered noise as lapping water, slowly modulated.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const makeNoise = (freq: number, q: number, gainValue: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      return gain;
    };
    this.ambient = makeNoise(420, 0.6, 0.05);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.ambient.gain);
    lfo.start();
    this.rainGain = makeNoise(2400, 0.4, 0);
  }
  setWeather(rain: number, night: number) {
    if (!this.ctx || !this.rainGain || !this.ambient) return;
    this.rainGain.gain.setTargetAtTime(rain * 0.045, this.ctx.currentTime, 0.5);
    this.ambient.gain.setTargetAtTime(0.05 - night * 0.015, this.ctx.currentTime, 0.5);
  }
  // Reel tension hum: pitch follows how full the tension meter is.
  setReel(active: boolean, tension: number) {
    if (!this.ctx || !this.master) return;
    if (active && !this.reelOsc) {
      this.reelOsc = this.ctx.createOscillator();
      this.reelOsc.type = 'triangle';
      this.reelGain = this.ctx.createGain();
      this.reelGain.gain.value = 0;
      this.reelOsc.connect(this.reelGain).connect(this.master);
      this.reelOsc.start();
    }
    if (this.reelOsc && this.reelGain) {
      const t = this.ctx.currentTime;
      if (active) {
        this.reelOsc.frequency.setTargetAtTime(110 + tension * 220, t, 0.08);
        this.reelGain.gain.setTargetAtTime(0.025, t, 0.1);
      } else {
        this.reelGain.gain.setTargetAtTime(0, t, 0.08);
        const osc = this.reelOsc;
        this.reelOsc = null;
        setTimeout(() => osc.stop(), 300);
      }
    }
  }
  play(cue: Cue) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = performance.now();
    if (now - (this.lastCue.get(cue) ?? 0) < 60) return;
    this.lastCue.set(cue, now);
    const ctx = this.ctx,
      t = ctx.currentTime;
    const tone = (freq: number, start: number, length: number, type: OscillatorType = 'sine', gain = 0.12, slide = 0) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t + start);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + start + length);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(gain, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + length);
      osc.connect(g).connect(this.master!);
      osc.start(t + start);
      osc.stop(t + start + length + 0.02);
    };
    const noise = (start: number, length: number, freq: number, gain = 0.2) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter).connect(g).connect(this.master!);
      src.start(t + start);
    };
    switch (cue) {
      case 'cast':
        noise(0, 0.35, 1800, 0.12);
        tone(600, 0, 0.3, 'sine', 0.05, -400);
        break;
      case 'splash':
        noise(0, 0.4, 900, 0.22);
        tone(220, 0, 0.2, 'sine', 0.06, -120);
        break;
      case 'bite':
        tone(880, 0, 0.09, 'square', 0.08);
        tone(1320, 0.1, 0.12, 'square', 0.08);
        break;
      case 'hook':
        tone(330, 0, 0.12, 'triangle', 0.1, 180);
        break;
      case 'catch':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.1));
        noise(0, 0.3, 1200, 0.1);
        break;
      case 'legendary':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.11, 0.4, 'triangle', 0.11));
        tone(262, 0, 0.9, 'sine', 0.08);
        break;
      case 'escape':
        tone(400, 0, 0.35, 'sawtooth', 0.05, -250);
        noise(0, 0.25, 700, 0.1);
        break;
      case 'coin':
        tone(1200, 0, 0.08, 'square', 0.06);
        tone(1800, 0.08, 0.16, 'square', 0.06);
        break;
      case 'click':
        tone(700, 0, 0.05, 'triangle', 0.05);
        break;
      case 'toss':
        noise(0, 0.12, 2500, 0.08);
        tone(500, 0, 0.1, 'triangle', 0.05, 300);
        break;
      case 'wrong':
        tone(180, 0, 0.18, 'sawtooth', 0.06);
        break;
      case 'countdown':
        tone(660, 0, 0.1, 'square', 0.06);
        break;
      case 'pin':
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.3, 'sine', 0.09));
        break;
      case 'chat':
        tone(1046, 0, 0.06, 'sine', 0.04);
        break;
      case 'bark':
        // Two short yaps: a buzzy tone with a bandpassed puff of noise.
        tone(300, 0, 0.09, 'sawtooth', 0.07, 120);
        noise(0, 0.08, 900, 0.1);
        tone(340, 0.16, 0.09, 'sawtooth', 0.07, 100);
        noise(0.16, 0.08, 950, 0.1);
        break;
      case 'lamp':
        tone(520, 0, 0.14, 'sine', 0.07);
        tone(1040, 0, 0.1, 'sine', 0.03);
        break;
      case 'drop':
        // A disc dropping down the frame and landing.
        tone(700, 0, 0.12, 'triangle', 0.05, -400);
        noise(0.1, 0.06, 500, 0.12);
        break;
    }
  }
}
export const harbourphone = new Harbourphone();
