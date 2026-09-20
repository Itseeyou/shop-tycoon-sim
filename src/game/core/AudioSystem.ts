export interface ListenerState {
  x: number;
  z: number;
  yaw: number;
}

export type SoundName =
  | "footstep"
  | "door"
  | "checkout"
  | "scan"
  | "pickup"
  | "place"
  | "ui"
  | "uiBack"
  | "error"
  | "notify"
  | "money"
  | "arrive"
  | "leave";

interface PlayOptions {
  position?: { x: number; z: number };
  volume?: number;
  rate?: number;
}

/**
 * Fully synthesised audio engine built on the Web Audio API.
 *
 * No binary assets are shipped: every sound is generated from oscillators and
 * shaped noise, and panning is derived from the camera-relative direction of
 * the source so effects still read as positional.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambient: { source: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;

  private listener: ListenerState = { x: 0, z: 0, yaw: 0 };
  private musicTimer = 0;
  private musicStep = 0;
  private chatterTimer = 4;
  private started = false;

  sfxEnabled = true;
  musicEnabled = true;
  ambientEnabled = true;

  /** Must be called from a user gesture; safe to call repeatedly. */
  init(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);

      this.noise = this.createNoiseBuffer(2);
      this.started = true;
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setListener(state: ListenerState): void {
    this.listener = state;
  }

  dispose(): void {
    this.ambient?.source.stop();
    this.ambient?.lfo.stop();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.started = false;
  }

  // ---------------------------------------------------------------- internals

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      // Brown-ish noise: warmer and less harsh than pure white noise.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private panNode(position?: { x: number; z: number }): StereoPannerNode | null {
    if (!this.ctx) return null;
    const panner = this.ctx.createStereoPanner();
    if (position) {
      const dx = position.x - this.listener.x;
      const dz = position.z - this.listener.z;
      // Right vector of the camera in XZ (yaw 0 looks down -Z).
      const rx = Math.cos(this.listener.yaw);
      const rz = -Math.sin(this.listener.yaw);
      const right = dx * rx + dz * rz;
      const dist = Math.hypot(dx, dz) || 1;
      panner.pan.value = Math.max(-1, Math.min(1, (right / dist) * 0.75));
    }
    panner.connect(this.sfxBus!);
    return panner;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    destination: AudioNode,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private burst(
    duration: number,
    cutoff: number,
    gain: number,
    destination: AudioNode,
    delay = 0,
    q = 1,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const env = ctx.createGain();
    const start = ctx.currentTime + delay;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(destination);
    src.start(start);
    src.stop(start + duration + 0.05);
  }

  // ------------------------------------------------------------------ public

  play(name: SoundName, options: PlayOptions = {}): void {
    if (!this.started || !this.sfxEnabled) return;
    this.resume();
    const ctx = this.ctx;
    if (!ctx) return;
    const panner = this.panNode(options.position);
    if (!panner) return;
    const vol = options.volume ?? 1;
    const rate = options.rate ?? 1;

    switch (name) {
      case "footstep": {
        this.burst(0.09, 420 * rate, 0.16 * vol, panner, 0, 0.8);
        this.tone(120 * rate, 0.07, "sine", 0.05 * vol, panner);
        break;
      }
      case "door": {
        this.tone(880, 0.16, "sine", 0.09 * vol, panner);
        this.tone(1320, 0.24, "sine", 0.06 * vol, panner, 0.09);
        break;
      }
      case "scan": {
        this.tone(2100 * rate, 0.06, "square", 0.05 * vol, panner);
        break;
      }
      case "checkout": {
        this.tone(1568, 0.09, "triangle", 0.09 * vol, panner);
        this.tone(2093, 0.12, "triangle", 0.08 * vol, panner, 0.1);
        this.tone(1046, 0.5, "sine", 0.07 * vol, panner, 0.22);
        break;
      }
      case "money": {
        this.tone(1318, 0.08, "triangle", 0.08 * vol, panner);
        this.tone(1760, 0.16, "triangle", 0.07 * vol, panner, 0.07);
        break;
      }
      case "pickup": {
        this.tone(180 * rate, 0.1, "sine", 0.12 * vol, panner);
        this.burst(0.08, 900, 0.08 * vol, panner);
        break;
      }
      case "place": {
        this.tone(140 * rate, 0.12, "sine", 0.14 * vol, panner);
        this.burst(0.1, 620, 0.09 * vol, panner);
        break;
      }
      case "ui": {
        this.tone(1320, 0.05, "sine", 0.05 * vol, panner);
        break;
      }
      case "uiBack": {
        this.tone(760, 0.06, "sine", 0.05 * vol, panner);
        break;
      }
      case "error": {
        this.tone(220, 0.18, "sawtooth", 0.05 * vol, panner);
        this.tone(165, 0.26, "sawtooth", 0.045 * vol, panner, 0.08);
        break;
      }
      case "notify": {
        this.tone(1046, 0.18, "sine", 0.06 * vol, panner);
        this.tone(1568, 0.4, "sine", 0.05 * vol, panner, 0.14);
        break;
      }
      case "arrive": {
        this.tone(520 * rate, 0.1, "triangle", 0.05 * vol, panner);
        break;
      }
      case "leave": {
        this.tone(330 * rate, 0.16, "triangle", 0.04 * vol, panner);
        break;
      }
      default:
        break;
    }
  }

  private startAmbient(): void {
    const ctx = this.ctx!;
    if (!this.ambientEnabled || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
    lfo.start();
    this.ambient = { source, lfo };
  }

  /** Advanced every frame: procedural music and idle customer chatter. */
  update(dt: number, chatting: boolean): void {
    if (!this.started || !this.ctx) return;
    if (this.musicEnabled) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.musicTimer = 1.5;
        this.playMusicStep();
      }
    }
    if (chatting) {
      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0) {
        this.chatterTimer = 3 + Math.random() * 6;
        const pan = Math.random() * 2 - 1;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan * 0.6;
        panner.connect(this.sfxBus!);
        const base = 240 + Math.random() * 120;
        this.tone(base, 0.14, "triangle", 0.025, panner);
        this.tone(base * 1.4, 0.1, "triangle", 0.018, panner, 0.12);
      }
    }
  }

  private playMusicStep(): void {
    if (!this.ctx) return;
    // Calm, near-monochrome progression — matches the minimal art direction.
    const chords = [
      [220, 277.18, 329.63],
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [196, 246.94, 329.63],
    ];
    const chord = chords[this.musicStep % chords.length];
    this.musicStep += 1;
    for (const freq of chord) {
      this.tone(freq, 2.6, "sine", 0.05, this.musicBus!);
    }
    if (this.musicStep % 4 === 0) {
      this.tone(chord[0] / 2, 3.4, "sine", 0.05, this.musicBus!);
    }
  }
}
