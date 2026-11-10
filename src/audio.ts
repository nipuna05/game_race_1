/** All the game's sound, made with WebAudio (no sound files): music, button sounds, the engine, wind, tyres, sirens, fights and pick-ups.
 *  Browsers only allow sound after the first click or key press, so start() is called from the first input. */
export type Track = 'menu' | 'race' | null;
const KEY = 'bikerace.audio.v1';
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  ctx: AudioContext | null = null;
  vol = { master: 0.8, music: 0.5, sfx: 0.9 };
  private master!: GainNode; private musicG!: GainNode; private sfxG!: GainNode; private noise!: AudioBuffer;
  private eng1!: OscillatorNode; private eng2!: OscillatorNode; private engGain!: GainNode; private engOn = false; private base = 60; private slope = 3.5;
  private windG!: GainNode; private skidG!: GainNode; private sirGain!: GainNode;
  private want: Track = null; private track: Track = null; private timer = 0; private step = 0; private next = 0;

  constructor() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k of ['master', 'music', 'sfx'] as const) if (typeof v[k] === 'number') this.vol[k] = Math.max(0, Math.min(1, v[k])); } catch { /* defaults */ }
  }
  setVol(k: 'master' | 'music' | 'sfx', v: number) {
    this.vol[k] = v; try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch { /* ignore */ }
    if (this.ctx) this.applyVol();
  }
  private applyVol() { const t = this.ctx!.currentTime; this.master.gain.setTargetAtTime(this.vol.master, t, 0.03); this.musicG.gain.setTargetAtTime(this.vol.music * 0.9, t, 0.03); this.sfxG.gain.setTargetAtTime(this.vol.sfx, t, 0.03); }

  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') void this.ctx.resume(); return; }
    const c = this.ctx = new AudioContext();
    this.master = c.createGain(); this.musicG = c.createGain(); this.sfxG = c.createGain();
    this.musicG.connect(this.master); this.sfxG.connect(this.master); this.master.connect(c.destination); this.applyVol();
    // one second of white noise, reused for wind, tyres, hi-hats, hits
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // engine: two oscillators through a low-pass filter
    this.eng1 = c.createOscillator(); this.eng1.type = 'sawtooth'; this.eng2 = c.createOscillator(); this.eng2.type = 'square'; this.engGain = c.createGain(); this.engGain.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; const g2 = c.createGain(); g2.gain.value = 0.5;
    this.eng1.connect(lp); this.eng2.connect(g2).connect(lp); lp.connect(this.engGain).connect(this.sfxG); this.eng1.start(); this.eng2.start();
    // wind and tyre noise
    this.windG = this.loopNoise('highpass', 900, 0.7); this.skidG = this.loopNoise('bandpass', 1900, 2.5);
    // police siren
    const sir = c.createOscillator(); sir.type = 'square'; this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 1.6; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg).connect(sir.frequency); sir.frequency.value = 900;
    sir.connect(this.sirGain).connect(this.sfxG); sir.start(); lfo.start();
    this.music(this.want);
  }
  private loopNoise(type: BiquadFilterType, f: number, q: number): GainNode {
    const c = this.ctx!, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0;
    src.connect(fl).connect(g).connect(this.sfxG); src.start(); return g;
  }

  // ---------- engine ----------
  /** Engine note for a bike: small engines buzz high, big engines rumble low. */
  setBike(cc: number) { this.base = Math.max(34, 108 - cc * 0.052); this.slope = 2.2 + (1 - cc / 1400) * 2.2; }
  engine(on: boolean) { this.engOn = on; if (!on && this.ctx) { const t = this.ctx.currentTime; this.engGain.gain.setTargetAtTime(0, t, 0.1); this.windG.gain.setTargetAtTime(0, t, 0.1); this.skidG.gain.setTargetAtTime(0, t, 0.1); this.sirGain.gain.setTargetAtTime(0, t, 0.1); } }
  update(speed: number, boosting: boolean, siren: number, skid: number) {
    if (!this.ctx || !this.engOn) return;
    const t = this.ctx.currentTime, sp = Math.abs(speed), f = this.base + sp * this.slope + (boosting ? 22 : 0);
    this.eng1.frequency.setTargetAtTime(f, t, 0.05); this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engGain.gain.setTargetAtTime(0.05 + Math.min(1, sp / 40) * 0.08, t, 0.1);
    this.windG.gain.setTargetAtTime(Math.pow(Math.min(1, sp / 60), 2) * 0.16, t, 0.15);
    this.skidG.gain.setTargetAtTime(skid * 0.09, t, 0.05);
    this.sirGain.gain.setTargetAtTime(siren * 0.025, t, 0.2);
  }

  // ---------- small building blocks ----------
  private tone(type: OscillatorType, f: number, t: number, dur: number, gain: number, dest: AudioNode, slideTo?: number, lp?: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = o; if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); out = fl; }
    out.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  private hit(t: number, dur: number, gain: number, type: BiquadFilterType, f: number, dest: AudioNode, q = 0.8) {
    const c = this.ctx!, s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------- buttons and effects ----------
  ui(kind: 'click' | 'hover' | 'tab' | 'start' | 'back' | 'select') {
    if (!this.ctx) return; const t = this.ctx.currentTime, d = this.sfxG;
    if (kind === 'hover') this.tone('sine', 1500, t, 0.03, 0.035, d);
    else if (kind === 'click') this.tone('square', 760, t, 0.07, 0.09, d, 1100, 4000);
    else if (kind === 'select') { this.tone('triangle', 660, t, 0.08, 0.12, d); this.tone('triangle', 990, t + 0.06, 0.1, 0.1, d); }
    else if (kind === 'tab') this.tone('triangle', 520, t, 0.09, 0.1, d, 700);
    else if (kind === 'back') this.tone('triangle', 480, t, 0.1, 0.1, d, 300);
    else { this.tone('sawtooth', 110, t, 0.7, 0.14, d, 880, 2500); this.hit(t, 0.6, 0.15, 'highpass', 1500, d); this.tone('square', 880, t + 0.55, 0.25, 0.08, d); }
  }
  thump(strength: number) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.tone('triangle', 140, t, 0.3, Math.min(0.4, 0.05 + strength * 0.02), this.sfxG, 40); this.hit(t, 0.18, Math.min(0.3, 0.05 + strength * 0.015), 'lowpass', 1200, this.sfxG);
  }
  punch() { if (!this.ctx) return; const t = this.ctx.currentTime; this.hit(t, 0.12, 0.35, 'bandpass', 900, this.sfxG, 1.2); this.tone('sine', 190, t, 0.14, 0.3, this.sfxG, 70); }
  fall() {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.thump(14);
    this.hit(t + 0.05, 0.9, 0.18, 'bandpass', 1400, this.sfxG, 1.5); this.tone('sawtooth', 220, t, 0.8, 0.07, this.sfxG, 50, 900);
  }
  loot() { if (!this.ctx) return; const t = this.ctx.currentTime; [660, 880, 1320, 1760].forEach((f, i) => this.tone('square', f, t + i * 0.06, 0.12, 0.07, this.sfxG, undefined, 5000)); }
  pad() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sawtooth', 200, t, 0.5, 0.1, this.sfxG, 1100, 3000); this.hit(t, 0.5, 0.12, 'highpass', 2000, this.sfxG); }
  beep(high: boolean) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone('sine', high ? 880 : 440, t, 0.25, 0.14, this.sfxG); }
  fanfare() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, t + i * 0.14, 0.3, 0.08, this.sfxG, undefined, 4000)); }

  // ---------- music: a small step sequencer (16th notes) ----------
  music(track: Track) {
    this.want = track; if (!this.ctx) return;
    if (track === this.track) return;
    this.track = track; window.clearInterval(this.timer); this.timer = 0;
    if (!track) return;
    this.step = 0; this.next = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }
  private schedule() {
    const c = this.ctx!; if (!this.track) return;
    const bpm = this.track === 'race' ? 138 : 98, sixteenth = 60 / bpm / 4;
    while (this.next < c.currentTime + 0.2) { this.play(this.step, this.next, sixteenth); this.next += sixteenth; this.step++; }
  }
  private play(step: number, t: number, sx: number) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, race = this.track === 'race', d = this.musicG;
    const root = [45, 41, 48, 43][bar], tri = bar === 0 ? [0, 3, 7] : [0, 4, 7];
    const kick = () => { this.tone('sine', 150, t, 0.18, race ? 0.38 : 0.28, d, 42); };
    if (race) {
      if (s % 4 === 0) kick();
      if (s === 4 || s === 12) this.hit(t, 0.14, 0.14, 'bandpass', 1800, d, 0.7);
      this.hit(t, s % 4 === 2 ? 0.1 : 0.03, s % 4 === 2 ? 0.07 : 0.035, 'highpass', 7000, d);
      if (s % 2 === 0) this.tone('sawtooth', mtof(root - 12 + (s % 8 === 6 ? 7 : 0)), t, sx * 1.8, 0.11, d, undefined, 520);
      if (s % 2 === 0 || s === 7 || s === 15) this.tone('square', mtof(root + 12 + tri[(s >> 1) % 3] + ((s >> 1) % 4 >= 2 ? 12 : 0)), t, sx * 1.5, 0.035, d, undefined, 2800);
      if (s === 0) for (const i of tri) this.tone('triangle', mtof(root + 12 + i), t, sx * 15, 0.03, d);
    } else {
      if (s === 0 || s === 8) kick();
      if (s % 4 === 2) this.hit(t, 0.04, 0.03, 'highpass', 7500, d);
      if (s === 12) this.hit(t, 0.12, 0.07, 'bandpass', 1500, d, 0.7);
      if (s % 4 === 0) this.tone('sawtooth', mtof(root), t, sx * 3, 0.11, d, undefined, 420);
      if (s % 2 === 0) this.tone('triangle', mtof(root + 24 + tri[(s >> 1) % 3] - (((s >> 1) % 4) >= 2 ? 12 : 0)), t, sx * 2.4, 0.045, d, undefined, 3000);
      if (s === 0) for (const i of tri) this.tone('triangle', mtof(root + 12 + i), t, sx * 15.5, 0.045, d);
    }
  }
}
