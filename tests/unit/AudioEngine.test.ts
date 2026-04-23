import { AudioEngine } from '../../src/midi/AudioEngine';

// Mock AudioContext
class MockGainNode {
  gain = { value: 1, setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() };
  connect = jest.fn();
}

class MockOscillatorNode {
  frequency = { value: 440, setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() };
  type: OscillatorType = 'sine';
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
  onended = null;
  disconnect = jest.fn();
}

class MockBufferSourceNode {
  buffer = null;
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

class MockAudioBuffer {
  getChannelData = jest.fn().mockReturnValue(new Float32Array(4410));
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  sampleRate = 44100;

  createOscillator = jest.fn().mockImplementation(() => new MockOscillatorNode());
  createGain = jest.fn().mockImplementation(() => new MockGainNode());
  createBufferSource = jest.fn().mockImplementation(() => new MockBufferSourceNode());
  createBuffer = jest.fn().mockImplementation(() => new MockAudioBuffer());
  createBiquadFilter = jest.fn().mockImplementation(() => ({
    type: 'bandpass' as BiquadFilterType,
    frequency: { value: 1000 },
    Q: { value: 1 },
    connect: jest.fn(),
  }));
  destination = {};
  resume = jest.fn().mockResolvedValue(undefined);
}

describe('AudioEngine', () => {
  let ctx: MockAudioContext;
  let engine: AudioEngine;

  beforeEach(() => {
    ctx = new MockAudioContext();
    engine = new AudioEngine(ctx as unknown as AudioContext);
  });

  describe('playNote()', () => {
    it('creates an OscillatorNode and GainNode', () => {
      engine.playNote(60, 100);
      expect(ctx.createOscillator).toHaveBeenCalled();
      expect(ctx.createGain).toHaveBeenCalled();
    });

    it('calls start() on the oscillator', () => {
      engine.playNote(60, 100);
      const osc = ctx.createOscillator.mock.results[0].value as MockOscillatorNode;
      expect(osc.start).toHaveBeenCalled();
    });

    it('sets frequency for note 60 to ~261.63Hz', () => {
      engine.playNote(60, 100);
      const osc = ctx.createOscillator.mock.results[0].value as MockOscillatorNode;
      expect(osc.frequency.value).toBeCloseTo(261.626, 1);
    });

    it('sets frequency for note 69 to 440Hz', () => {
      engine.playNote(69, 100);
      const osc = ctx.createOscillator.mock.results[0].value as MockOscillatorNode;
      expect(osc.frequency.value).toBeCloseTo(440, 1);
    });

    it('sets gain to 1.0 for velocity 127', () => {
      engine.playNote(60, 127);
      const gain = ctx.createGain.mock.results[0].value as MockGainNode;
      expect(gain.gain.value).toBeCloseTo(1.0, 2);
    });

    it('sets gain to ~0.504 for velocity 64', () => {
      engine.playNote(60, 64);
      const gain = ctx.createGain.mock.results[0].value as MockGainNode;
      expect(gain.gain.value).toBeCloseTo(64 / 127, 2);
    });
  });

  describe('stopNote()', () => {
    it('schedules gain ramp and calls stop()', () => {
      engine.playNote(60, 100);
      engine.stopNote(60);
      const gain = ctx.createGain.mock.results[0].value as MockGainNode;
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    });

    it('does not throw when stopping a note that was not started', () => {
      expect(() => engine.stopNote(99)).not.toThrow();
    });
  });

  describe('playDrum()', () => {
    it('does not throw for any note in 35–81', () => {
      for (let n = 35; n <= 81; n++) {
        expect(() => engine.playDrum(n, 100)).not.toThrow();
      }
    });

    it('creates an oscillator for kick (note 36)', () => {
      engine.playDrum(36, 100);
      expect(ctx.createOscillator).toHaveBeenCalled();
      const osc = ctx.createOscillator.mock.results[0].value as MockOscillatorNode;
      // Kick starts at ~150Hz
      expect(osc.frequency.value).toBeCloseTo(150, 0);
    });

    it('does not throw for hi-hat closed (note 42)', () => {
      expect(() => engine.playDrum(42, 80)).not.toThrow();
    });

    it('does not throw for unknown drum note (note 99)', () => {
      expect(() => engine.playDrum(99, 50)).not.toThrow();
    });
  });

  describe('AudioContext suspended state', () => {
    it('sets pendingResume when context is suspended', () => {
      ctx.state = 'suspended';
      engine.playNote(60, 100);
      expect(engine.pendingResume).toBe(true);
    });

    it('resumeContext() calls ctx.resume()', async () => {
      ctx.state = 'suspended';
      engine.playNote(60, 100);
      await engine.resumeContext();
      expect(ctx.resume).toHaveBeenCalled();
    });

    it('resumeContext() clears pendingResume', async () => {
      ctx.state = 'suspended';
      engine.playNote(60, 100);
      ctx.state = 'running';
      await engine.resumeContext();
      expect(engine.pendingResume).toBe(false);
    });
  });
});
