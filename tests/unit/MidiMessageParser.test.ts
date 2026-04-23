import { parseMidiMessage } from '../../src/midi/MidiMessageParser';

describe('parseMidiMessage', () => {
  const TS = 1000;

  it('parses Note On message', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 60, 100]), TS);
    expect(msg.type).toBe('noteOn');
    expect(msg.channel).toBe(1);
    expect(msg.data1).toBe(60);
    expect(msg.data2).toBe(100);
    expect(msg.timestamp).toBe(TS);
  });

  it('parses Note Off message (0x80)', () => {
    const msg = parseMidiMessage(new Uint8Array([0x80, 60, 0]), TS);
    expect(msg.type).toBe('noteOff');
    expect(msg.channel).toBe(1);
    expect(msg.data1).toBe(60);
    expect(msg.data2).toBe(0);
  });

  it('treats velocity-0 Note On as Note Off', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 60, 0]), TS);
    expect(msg.type).toBe('noteOff');
    expect(msg.channel).toBe(1);
    expect(msg.data1).toBe(60);
  });

  it('parses Note On on channel 10', () => {
    const msg = parseMidiMessage(new Uint8Array([0x99, 36, 80]), TS);
    expect(msg.type).toBe('noteOn');
    expect(msg.channel).toBe(10);
    expect(msg.data1).toBe(36);
    expect(msg.data2).toBe(80);
  });

  it('parses Control Change', () => {
    const msg = parseMidiMessage(new Uint8Array([0xb0, 7, 100]), TS);
    expect(msg.type).toBe('controlChange');
    expect(msg.channel).toBe(1);
    expect(msg.data1).toBe(7);
    expect(msg.data2).toBe(100);
  });

  it('parses Program Change', () => {
    const msg = parseMidiMessage(new Uint8Array([0xc0, 0]), TS);
    expect(msg.type).toBe('programChange');
    expect(msg.channel).toBe(1);
    expect(msg.data1).toBe(0);
    expect(msg.data2).toBe(0);
  });

  it('parses MIDI clock (0xF8)', () => {
    const msg = parseMidiMessage(new Uint8Array([0xf8]), TS);
    expect(msg.type).toBe('clock');
    expect(msg.channel).toBe(0);
    expect(msg.data1).toBe(0);
    expect(msg.data2).toBe(0);
  });

  it('parses SysEx message', () => {
    const msg = parseMidiMessage(new Uint8Array([0xf0, 0x41, 0xf7]), TS);
    expect(msg.type).toBe('sysex');
    expect(msg.channel).toBe(0);
  });

  it('includes the status byte', () => {
    const msg = parseMidiMessage(new Uint8Array([0x90, 60, 100]), TS);
    expect(msg.statusByte).toBe(0x90);
  });

  it('parses Note On on channel 16 (0x9F)', () => {
    const msg = parseMidiMessage(new Uint8Array([0x9f, 48, 64]), TS);
    expect(msg.type).toBe('noteOn');
    expect(msg.channel).toBe(16);
  });

  it('parses Pitch Bend (0xE0)', () => {
    const msg = parseMidiMessage(new Uint8Array([0xe0, 0, 64]), TS);
    expect(msg.type).toBe('pitchBend');
    expect(msg.channel).toBe(1);
  });

  it('handles out-of-bounds data bytes safely', () => {
    // Single byte message with missing data bytes - should not throw
    expect(() => parseMidiMessage(new Uint8Array([0x90]), TS)).not.toThrow();
  });
});
