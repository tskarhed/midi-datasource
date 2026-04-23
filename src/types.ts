import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export type MidiQueryMode = 'raw' | 'notes' | 'drums';

export type MidiQueryFormat = 'long' | 'wide';

export interface MidiQuery extends DataQuery {
  /** MIDI input device ID from MIDIAccess.inputs map. Empty string = no device selected. */
  deviceId: string;

  /** Display and data mode for this panel. */
  mode: MidiQueryMode;

  /**
   * Output DataFrame format for Notes and Drums modes.
   * - 'long': one row per event with NoteName/DrumName as a string field (requires
   *   "Partition by values" Grafana transform for State Timeline)
   * - 'wide': one column per note/drum name, value = Velocity | null (State Timeline native)
   * Raw mode always uses long format regardless of this setting.
   * Default: 'long'
   */
  format: MidiQueryFormat;

  /**
   * Notes mode only: minimum MIDI note number to display (0–127).
   * Default: 36 (C2)
   */
  noteRangeMin: number;

  /**
   * Notes mode only: maximum MIDI note number to display (0–127).
   * Default: 84 (C6)
   */
  noteRangeMax: number;
}

export const DEFAULT_QUERY: Partial<MidiQuery> = {
  deviceId: '',
  mode: 'raw',
  format: 'long',
  noteRangeMin: 36,
  noteRangeMax: 84,
};

/** No datasource-level configuration. MIDI requires no credentials or server config. */
export interface MidiDataSourceOptions extends DataSourceJsonData {}

export type MidiMessageType =
  | 'noteOn'
  | 'noteOff'
  | 'controlChange'
  | 'programChange'
  | 'pitchBend'
  | 'channelPressure'
  | 'polyphonicPressure'
  | 'sysex'
  | 'clock'
  | 'unknown';

export interface MidiMessage {
  /** Browser performance.now() timestamp in milliseconds */
  timestamp: number;

  /** Raw status byte (first byte of MIDI message) */
  statusByte: number;

  /** Parsed message type */
  type: MidiMessageType;

  /**
   * MIDI channel (1–16). 0 for system messages (sysex, clock).
   * Channel 10 (1-indexed) is the GM percussion channel.
   */
  channel: number;

  /** First data byte: note number (0–127) or controller number */
  data1: number;

  /** Second data byte: velocity (0–127) or controller value. 0 for single-byte messages. */
  data2: number;
}

export interface MidiDeviceInfo {
  /** MIDIInput.id — unique across the browser session */
  id: string;

  /** MIDIInput.name — human-readable device name */
  name: string;

  /** MIDIInput.state — 'connected' | 'disconnected' */
  state: WebMidi.MIDIPortDeviceState;
}

export interface NoteEvent {
  /** When this state change occurred (ms since epoch) */
  timestamp: number;
  noteNumber: number;
  noteName: string;
  /**
   * Velocity (1–127) when pressed; null when released.
   * null serialises to null in the DataFrame, treated as "state ended" by State Timeline.
   */
  velocity: number | null;
}

export interface DrumEvent {
  /** When this state change occurred (ms since epoch) */
  timestamp: number;
  noteNumber: number;
  drumName: string;
  /**
   * Velocity (1–127) on Note On; null on Note Off.
   * null serialises to null in the DataFrame, treated as "state ended" by State Timeline.
   */
  velocity: number | null;
}
