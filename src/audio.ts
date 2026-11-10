/** Small WebAudio engine: bike engine note, siren and a crash thump. Starts on the first key press (browsers require that). */
export class Sound {
  ctx: AudioContext | null = null; eng!: OscillatorNode; engGain!: GainNode; sir!: OscillatorNode; sirGain!: GainNode; lfo!: OscillatorNode;
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const c = this.ctx = new AudioContext();
    this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.engGain = c.createGain(); this.engGain.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    this.eng.connect(lp).connect(this.engGain).connect(c.destination); this.eng.start();
    this.sir = c.createOscillator(); this.sir.type = 'square'; this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 1.6; const lg = c.createGain(); lg.gain.value = 260; this.lfo.connect(lg).connect(this.sir.frequency); this.sir.frequency.value = 900;
    this.sir.connect(this.sirGain).connect(c.destination); this.sir.start(); this.lfo.start();
  }
  update(speed: number, boosting: boolean, siren: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 55 + Math.abs(speed) * 4.2 + (boosting ? 25 : 0);
    this.eng.frequency.setTargetAtTime(f, t, 0.05); this.engGain.gain.setTargetAtTime(0.05 + Math.min(1, Math.abs(speed) / 40) * 0.07, t, 0.1);
    this.sirGain.gain.setTargetAtTime(siren * 0.025, t, 0.2);
  }
  thump(strength: number) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(140, c.currentTime); o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.3);
    g.gain.setValueAtTime(Math.min(0.4, 0.05 + strength * 0.02), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.4);
  }
  beep(high: boolean) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = high ? 880 : 440; g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.3);
  }
}
