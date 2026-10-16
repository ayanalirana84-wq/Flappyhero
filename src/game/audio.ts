// Procedural sound effects using the Web Audio API (no external assets).
// All sounds are synthesized on the fly. The AudioContext is created lazily
// on the first user gesture to satisfy browser autoplay policies.

type SfxName = "flap" | "score" | "hit" | "die" | "click";

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Call once from a user gesture so audio is unlocked.
  unlock() {
    this.ensure();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    glideTo?: number
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number) {
    const ctx = this.ensure();
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  play(name: SfxName) {
    switch (name) {
      case "flap":
        this.tone(420, 0.13, "square", 0.18, 720);
        break;
      case "score":
        this.tone(880, 0.09, "sine", 0.22);
        window.setTimeout(() => this.tone(1320, 0.12, "sine", 0.2), 70);
        break;
      case "hit":
        this.noise(0.18, 0.35);
        this.tone(180, 0.18, "square", 0.2, 90);
        break;
      case "die":
        this.tone(520, 0.5, "triangle", 0.22, 120);
        break;
      case "click":
        this.tone(660, 0.06, "square", 0.12);
        break;
    }
  }
}

export const sound = new SoundManager();
