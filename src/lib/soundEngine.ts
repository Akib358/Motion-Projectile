import { ProjectileType } from '../types/simulation';

class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private activeSource: AudioNode | null = null;
  private activeGain: GainNode | null = null;
  private enabled = true;
  private volume = 0.45;

  public setSettings(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (!enabled) {
      this.stopFlightLoop();
    } else if (this.activeGain && this.ctx) {
      this.activeGain.gain.setTargetAtTime(this.volume * 0.25, this.ctx.currentTime, 0.05);
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playLaunch(projectile: ProjectileType) {
    const ctx = this.ensureContext();
    if (!ctx || this.volume <= 0.01) return;

    this.stopFlightLoop();

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.exponentialRampToValueAtTime(this.volume * 0.35, now + 0.04);
    masterGain.connect(ctx.destination);

    if (projectile === 'rocket') {
      // Filtered noise roar + low rumble
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.1));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 1.4);

      noise.connect(filter);
      filter.connect(masterGain);
      noise.start(now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
      this.activeSource = noise;
      this.activeGain = masterGain;
    } else if (projectile === 'airplane') {
      // Twin-harmonic prop/turbine tone
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(148, now + 0.6);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);

      osc.connect(filter);
      filter.connect(masterGain);
      osc.start(now);
      osc.stop(now + 1.2);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.18);
      this.activeSource = osc;
      this.activeGain = masterGain;
    } else {
      // Crisp pneumatic impulse launch for ball / custom projectile
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);

      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      this.activeSource = osc;
      this.activeGain = masterGain;
    }
  }

  public playImpact(reachedDestination: boolean | null) {
    const ctx = this.ensureContext();
    if (!ctx || this.volume <= 0.01) return;
    this.stopFlightLoop();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    gain.connect(ctx.destination);

    // Impact thud
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(115, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    thud.connect(gain);
    thud.start(now);
    thud.stop(now + 0.2);

    // Subtle scientific completion chime
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(reachedDestination === false ? 392 : 523.25, now + 0.08);
    if (reachedDestination !== false) {
      chime.frequency.setValueAtTime(659.25, now + 0.18);
    }
    chimeGain.gain.setValueAtTime(0.001, now + 0.08);
    chimeGain.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.1);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now + 0.08);
    chime.stop(now + 0.44);
  }

  public stopFlightLoop() {
    if (this.activeSource && 'stop' in this.activeSource) {
      try {
        (this.activeSource as AudioScheduledSourceNode).stop();
      } catch {
        // already stopped
      }
    }
    this.activeSource = null;
    this.activeGain = null;
  }
}

export const soundEngine = new ProceduralSoundEngine();
