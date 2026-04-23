import { noteToFrequency } from '../constants';

/**
 * Web Audio API synthesis for MIDI notes and drums.
 * Accepts optional AudioContext for dependency injection in tests.
 */
export class AudioEngine {
  private ctx: AudioContext | null;
  private activeOscillators: Map<number, { osc: OscillatorNode; gain: GainNode }> = new Map();
  /** True when AudioContext was suspended and audio playback is pending user gesture. */
  pendingResume = false;
  /** Called when audio is blocked by autoplay policy. */
  onAudioBlocked?: () => void;

  constructor(audioContext?: AudioContext) {
    if (audioContext) {
      this.ctx = audioContext;
    } else {
      const Ctor =
        (typeof window !== 'undefined' && window.AudioContext) ||
        (typeof window !== 'undefined' &&
          ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext | undefined));
      this.ctx = Ctor ? new Ctor() : null;
    }
  }

  /** Play a sustained pitched note (triangle wave). */
  playNote(noteNumber: number, velocity: number): void {
    if (!this.ctx) {
      return;
    }
    if (this.ctx!.state === 'suspended') {
      this.pendingResume = true;
      this.onAudioBlocked?.();
      return;
    }

    // Stop existing note with the same number if any
    this.stopNote(noteNumber);

    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();

    osc.type = 'triangle';
    osc.frequency.value = noteToFrequency(noteNumber);
    gain.gain.value = velocity / 127;

    osc.connect(gain);
    gain.connect(this.ctx!.destination);
    osc.start(this.ctx!.currentTime);

    this.activeOscillators.set(noteNumber, { osc, gain });
  }

  /** Stop a playing note with a short fade out. */
  stopNote(noteNumber: number): void {
    const entry = this.activeOscillators.get(noteNumber);
    if (!entry || !this.ctx) {
      return;
    }
    const { osc, gain } = entry;
    const now = this.ctx!.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.stop(now + 0.11);
    this.activeOscillators.delete(noteNumber);
  }

  /** Play a percussive drum sound based on GM1 note category. */
  playDrum(noteNumber: number, velocity: number): void {
    if (!this.ctx) {
      return;
    }
    if (this.ctx!.state === 'suspended') {
      this.pendingResume = true;
      this.onAudioBlocked?.();
      return;
    }

    const amp = velocity / 127;

    if (noteNumber === 35 || noteNumber === 36) {
      this.playKick(amp);
    } else if (noteNumber === 38 || noteNumber === 40) {
      this.playSnare(amp);
    } else if (noteNumber === 42 || noteNumber === 44) {
      this.playHiHat(amp, false);
    } else if (noteNumber === 46) {
      this.playHiHat(amp, true);
    } else if ([49, 51, 52, 57, 59].includes(noteNumber)) {
      this.playCymbal(amp);
    } else {
      this.playGenericDrum(amp);
    }
  }

  /** Resume a suspended AudioContext after user gesture. */
  async resumeContext(): Promise<void> {
    if (this.ctx) {
      await this.ctx!.resume();
    }
    this.pendingResume = false;
  }

  private playKick(amp: number): void {
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    const now = this.ctx!.currentTime;

    osc.type = 'sine';
    osc.frequency.value = 150;
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);
    gain.gain.value = amp;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx!.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  private playSnare(amp: number): void {
    const now = this.ctx!.currentTime;

    // Noise component
    const bufSize = this.ctx!.sampleRate * 0.1;
    const buffer = this.ctx!.createBuffer(1, bufSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;

    const gain = this.ctx!.createGain();
    gain.gain.value = amp * 0.8;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx!.destination);
    noise.start(now);
    noise.stop(now + 0.11);

    // Tone component
    const osc = this.ctx!.createOscillator();
    const oscGain = this.ctx!.createGain();
    osc.frequency.value = 200;
    oscGain.gain.value = amp * 0.3;
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(oscGain);
    oscGain.connect(this.ctx!.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  private playHiHat(amp: number, open: boolean): void {
    const now = this.ctx!.currentTime;
    const duration = open ? 0.3 : 0.04;

    const bufSize = Math.floor(this.ctx!.sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, bufSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gain = this.ctx!.createGain();
    gain.gain.value = amp * 0.5;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx!.destination);
    noise.start(now);
    noise.stop(now + duration + 0.01);
  }

  private playCymbal(amp: number): void {
    const now = this.ctx!.currentTime;
    const duration = 0.5;

    const bufSize = Math.floor(this.ctx!.sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, bufSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 5000;
    filter.Q.value = 0.5;

    const gain = this.ctx!.createGain();
    gain.gain.value = amp * 0.4;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx!.destination);
    noise.start(now);
    noise.stop(now + duration + 0.01);
  }

  private playGenericDrum(amp: number): void {
    const now = this.ctx!.currentTime;
    const duration = 0.08;

    const bufSize = Math.floor(this.ctx!.sampleRate * duration);
    const buffer = this.ctx!.createBuffer(1, bufSize, this.ctx!.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx!.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;

    const gain = this.ctx!.createGain();
    gain.gain.value = amp * 0.6;
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx!.destination);
    noise.start(now);
    noise.stop(now + duration + 0.01);
  }
}
