# Data Model: MIDI Keyboard Datasource Plugin

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-03-18

---

## Query Types (stored per Grafana panel)

### MidiQueryMode

```typescript
export type MidiQueryMode = 'raw' | 'notes' | 'timeline' | 'drums';
```

### MidiQuery (extends DataQuery from @grafana/schema)

```typescript
import { DataQuery } from '@grafana/schema';

export interface MidiQuery extends DataQuery {
  /** MIDI input device ID from MIDIAccess.inputs map. Empty string = no device selected. */
  deviceId: string;

  /** Display and data mode for this panel. */
  mode: MidiQueryMode;

  /**
   * Timeline mode only: minimum MIDI note number to display (0–127).
   * Ignored when noteRangeAuto is true.
   * Default: 36 (C2)
   */
  noteRangeMin: number;

  /**
   * Timeline mode only: maximum MIDI note number to display (0–127).
   * Ignored when noteRangeAuto is true.
   * Default: 84 (C6)
   */
  noteRangeMax: number;

  /**
   * Timeline mode only: when true, expand the note range dynamically
   * as new notes are received rather than using noteRangeMin/Max.
   * Default: false
   */
  noteRangeAuto: boolean;
}

export const DEFAULT_QUERY: Partial<MidiQuery> = {
  deviceId: '',
  mode: 'raw',
  noteRangeMin: 36,
  noteRangeMax: 84,
  noteRangeAuto: false,
};
```

### MidiDataSourceOptions (no configuration needed)

```typescript
import { DataSourceJsonData } from '@grafana/data';

/** No datasource-level configuration. MIDI requires no credentials or server config. */
export interface MidiDataSourceOptions extends DataSourceJsonData {}
```

---

## MIDI Message Types (internal runtime model)

### MidiMessageType

```typescript
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
```

### MidiMessage (parsed from raw MIDI bytes)

```typescript
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
```

### MidiDeviceInfo (from MIDIAccess.inputs)

```typescript
export interface MidiDeviceInfo {
  /** MIDIInput.id — unique across the browser session */
  id: string;

  /** MIDIInput.name — human-readable device name */
  name: string;

  /** MIDIInput.state — 'connected' | 'disconnected' */
  state: MIDIPortDeviceState;
}
```

---

## Per-Device Runtime State (maintained by DataSource)

### ActiveNote (for Notes mode)

```typescript
export interface ActiveNote {
  /** MIDI note number (0–127) */
  noteNumber: number;

  /** Human-readable note name, e.g. "C4", "D#5" */
  noteName: string;

  /** Velocity at Note On (1–127). Never 0 (velocity-0 Note On is treated as Note Off). */
  velocity: number;

  /** Timestamp when Note On was received (performance.now()) */
  startTime: number;
}
```

### NoteEvent (for Timeline mode)

```typescript
export interface NoteEvent {
  /** When this state change occurred (ms since epoch, for DataFrame time field) */
  timestamp: number;

  /** MIDI note number (0–127) */
  noteNumber: number;

  /** Human-readable note name, e.g. "C4" */
  noteName: string;

  /**
   * Velocity (1–127) when the note was pressed; null when released.
   * Using velocity as the state value allows State Timeline to color bars by intensity.
   * null serialises to null in the DataFrame, which State Timeline treats as "state ended".
   */
  velocity: number | null;
}
```

### DrumHit (for Drums mode)

```typescript
export interface DrumHit {
  /** MIDI note number (35–81 for GM1 standard drums) */
  noteNumber: number;

  /** GM1 drum piece name, e.g. "Bass Drum 1", "Acoustic Snare" */
  drumName: string;

  /** Velocity at hit (1–127) */
  velocity: number;

  /** Timestamp when hit was received (performance.now()) */
  hitTime: number;
}
```

---

## DataFrame Schemas (what DataSource.query() returns per mode)

### Raw Mode — use with: Table panel

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Timestamp    | time      | ms since epoch (Date.now() at message receipt)
Type         | string    | Human-readable type: "Note On", "Note Off", etc.
Channel      | number    | MIDI channel 1–16
Data1        | number    | First data byte (note number or controller)
Data2        | number    | Second data byte (velocity or value)
Raw          | string    | Hex representation, e.g. "90 3C 64"
```

- One row per MIDI message, newest first
- Capped at 1000 rows; oldest dropped when limit reached
- Emitted: on every incoming MIDI message

### Notes Mode — use with: Table panel or custom visualization

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
NoteNumber   | number    | MIDI note number (0–127)
NoteName     | string    | Note name e.g. "C4", "D#5"
Velocity     | number    | Velocity at Note On (1–127)
```

- One row per currently active note (Note On received, Note Off not yet received)
- Empty DataFrame when no notes are active
- Emitted: on every Note On or Note Off that changes the active note set

### Timeline Mode — use with: State Timeline panel + "Partition by values" transformation

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Time         | time      | ms since epoch when state change occurred
NoteNumber   | number    | MIDI note number (0–127)
NoteName     | string    | Note name e.g. "C4"
Velocity     | number    | Velocity (1–127) on Note On; null on Note Off
```

- One row per state-change event (Note On → velocity value, Note Off → null)
- When noteRangeAuto=false: only emit events for notes within [noteRangeMin, noteRangeMax]
- When noteRangeAuto=true: emit all events; range expands dynamically
- Accumulated since subscription start; the full event history is re-emitted on each new event
- **Panel setup required**:
  1. Add "Partition by values" transformation, partition field = `NoteName`
  2. State Timeline maps velocity values to a color gradient (0=transparent, 127=fully opaque)
  3. Optionally add "Filter by value" transformation to constrain the visible note range

### Drums Mode — use with: Table panel or custom visualization

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
NoteNumber   | number    | MIDI note number (35–81)
DrumName     | string    | GM1 drum name e.g. "Bass Drum 1"
Velocity     | number    | Velocity at last hit (1–127), or 0 if inactive
Active       | boolean   | true within 200ms decay window after hit
```

- One row per GM1 drum piece in the map (47 standard rows, notes 35–81)
- Unknown note numbers on channel 10 (outside 35–81): appended as extra rows with
  `DrumName = "Unknown Drum (note NNN)"`
- Emitted: on every drum-channel Note On, and when each 200ms decay timer fires

---

## Constants

### GM1 Drum Map (full)

```typescript
export const GM1_DRUM_MAP: Readonly<Record<number, string>> = {
  35: 'Bass Drum 2',
  36: 'Bass Drum 1',
  37: 'Side Stick',
  38: 'Acoustic Snare',
  39: 'Hand Clap',
  40: 'Electric Snare',
  41: 'Low Floor Tom',
  42: 'Closed Hi-Hat',
  43: 'High Floor Tom',
  44: 'Pedal Hi-Hat',
  45: 'Low Tom',
  46: 'Open Hi-Hat',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash Cymbal 1',
  50: 'High Tom',
  51: 'Ride Cymbal 1',
  52: 'Chinese Cymbal',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash Cymbal',
  56: 'Cowbell',
  57: 'Crash Cymbal 2',
  58: 'Vibraslap',
  59: 'Ride Cymbal 2',
  60: 'Hi Bongo',
  61: 'Low Bongo',
  62: 'Mute Hi Conga',
  63: 'Open Hi Conga',
  64: 'Low Conga',
  65: 'High Timbale',
  66: 'Low Timbale',
  67: 'High Agogo',
  68: 'Low Agogo',
  69: 'Cabasa',
  70: 'Maracas',
  71: 'Short Whistle',
  72: 'Long Whistle',
  73: 'Short Guiro',
  74: 'Long Guiro',
  75: 'Claves',
  76: 'Hi Wood Block',
  77: 'Low Wood Block',
  78: 'Mute Cuica',
  79: 'Open Cuica',
  80: 'Mute Triangle',
  81: 'Open Triangle',
} as const;

/** MIDI channel (1-indexed) used for percussion in General MIDI */
export const GM1_DRUM_CHANNEL = 10;

/** Note number range for standard GM1 drum pieces */
export const GM1_DRUM_NOTE_MIN = 35;
export const GM1_DRUM_NOTE_MAX = 81;
```

### Note Name Mapping

```typescript
/** Chromatic note names using sharps (MIDI standard) */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Convert MIDI note number to human-readable name.
 * Middle C = note 60 = "C4".
 */
export function formatNoteName(noteNumber: number): string {
  const octave = Math.floor(noteNumber / 12) - 1;
  const name = NOTE_NAMES[noteNumber % 12];
  return `${name}${octave}`;
}

/**
 * Convert MIDI note number to frequency in Hz (equal temperament, A4=440Hz).
 */
export function noteToFrequency(noteNumber: number): number {
  return 440 * Math.pow(2, (noteNumber - 69) / 12);
}
```

---

## State Transitions

### Note State Machine (per device, per note number)

```
        Note On (velocity > 0)
  IDLE ─────────────────────────► ACTIVE
   ▲                                 │
   │    Note Off OR                  │
   │    Note On (velocity = 0)       │
   └─────────────────────────────────┘
```

### Drum Hit State Machine (per device, per note number)

```
        Note On received
  IDLE ────────────────────────► ACTIVE (200ms decay timer starts)
   ▲                                 │
   │    200ms elapsed                │
   │    OR Note Off received         │
   └─────────────────────────────────┘
```

### Device Connection State

```
  CONNECTED ── onstatechange (disconnected) ──► DISCONNECTED
      ▲                                               │
      │    onstatechange (connected)                  │
      └───────────────────────────────────────────────┘
```

---

## Validation Rules

- `deviceId` MUST be a non-empty string matching a `MIDIInput.id` before subscribing
- `noteRangeMin` MUST be in [0, 126] and strictly less than `noteRangeMax`
- `noteRangeMax` MUST be in [1, 127] and strictly greater than `noteRangeMin`
- MIDI status byte MUST be in [0x80, 0xFF]; data bytes MUST be in [0, 127]
- Velocity-0 Note On (status byte 0x9n, data2=0) MUST be treated as Note Off
- Raw buffer MUST NOT exceed 1000 rows; discard oldest on overflow
