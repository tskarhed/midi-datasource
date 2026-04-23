import type { MidiMessage, MidiMessageType } from '../types';

/**
 * Parse raw MIDI bytes into a structured MidiMessage.
 * Treats velocity-0 Note On (0x9n, data2=0) as Note Off per MIDI spec.
 * Safe for short/malformed messages (missing data bytes default to 0).
 */
export function parseMidiMessage(data: Uint8Array, timestamp: number): MidiMessage {
  const statusByte = data[0] ?? 0;
  const data1 = data[1] ?? 0;
  const data2 = data[2] ?? 0;

  const highNibble = statusByte & 0xf0;
  const channel = (statusByte & 0x0f) + 1; // convert 0-indexed to 1-indexed

  let type: MidiMessageType;

  if (statusByte >= 0xf0) {
    // System messages — no channel
    switch (statusByte) {
      case 0xf0:
        type = 'sysex';
        break;
      case 0xf8:
        type = 'clock';
        break;
      default:
        type = 'unknown';
    }
    return { timestamp, statusByte, type, channel: 0, data1: 0, data2: 0 };
  }

  switch (highNibble) {
    case 0x80:
      type = 'noteOff';
      break;
    case 0x90:
      // Velocity-0 Note On is treated as Note Off
      type = data2 === 0 ? 'noteOff' : 'noteOn';
      break;
    case 0xa0:
      type = 'polyphonicPressure';
      break;
    case 0xb0:
      type = 'controlChange';
      break;
    case 0xc0:
      type = 'programChange';
      break;
    case 0xd0:
      type = 'channelPressure';
      break;
    case 0xe0:
      type = 'pitchBend';
      break;
    default:
      type = 'unknown';
  }

  return { timestamp, statusByte, type, channel, data1, data2 };
}
