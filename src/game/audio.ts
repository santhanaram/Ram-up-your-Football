/** Synthesised match sound: kicks, whistle, net, posts and a living crowd */
export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture (browsers block audio until then) */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    // Brown-ish noise: smoother, more like a distant crowd than white hiss
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    this.startCrowd();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private startCrowd() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 520;
    band.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.18;
    src.connect(band).connect(this.crowdGain).connect(this.master!);
    src.start();
  }

  /** 0 = quiet midfield, 1 = attack in the box */
  setExcitement(x: number) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdGain.gain.setTargetAtTime(0.16 + x * 0.22, this.ctx.currentTime, 0.4);
  }

  private burst(freq: number, q: number, peak: number, attack: number, decay: number, sweepTo?: number) {
    if (!this.ctx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + attack + decay + 0.05);
  }

  private tone(type: OscillatorType, from: number, to: number, peak: number, dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Boot on ball; harder strikes are deeper and louder */
  kick(power: number) {
    const p = Math.min(1, power / 30);
    this.tone('triangle', 170 - p * 60, 40, 0.35 + p * 0.45, 0.09 + p * 0.08);
    this.burst(1800, 1.5, 0.12 + p * 0.25, 0.003, 0.05);
  }

  header() {
    this.tone('sine', 140, 60, 0.4, 0.12);
  }

  tackle() {
    this.burst(400, 1, 0.3, 0.005, 0.12);
  }

  whistle(blasts = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < blasts; i++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 2750;
        lfo.frequency.value = 38;
        lfoGain.gain.value = 120;
        lfo.connect(lfoGain).connect(o.frequency);
        const g = ctx.createGain();
        const len = blasts > 1 && i === blasts - 1 ? 0.7 : 0.3;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        g.gain.setValueAtTime(0.22, t + len - 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g).connect(this.master!);
        o.start(t);
        lfo.start(t);
        o.stop(t + len + 0.02);
        lfo.stop(t + len + 0.02);
      }, i * 380);
    }
  }

  net() {
    this.burst(3000, 0.8, 0.25, 0.01, 0.35, 900);
  }

  post() {
    this.tone('square', 900, 700, 0.12, 0.4);
    this.tone('sine', 1320, 1250, 0.18, 0.6);
    this.ooh();
  }

  /** Crowd reaction to a near miss or a save */
  ooh() {
    this.burst(380, 1.2, 0.5, 0.25, 1.1, 260);
  }

  cheer() {
    this.burst(650, 0.7, 0.9, 0.15, 2.8);
    this.burst(1400, 0.9, 0.35, 0.2, 2.2);
  }
}
