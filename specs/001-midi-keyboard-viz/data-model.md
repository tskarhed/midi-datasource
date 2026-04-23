# Data Model: MIDI Keyboard Datasource Plugin

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-04-23 (updated)

---

## Query Types (stored per Grafana panel)

### MidiQueryMode

```typescript
export type MidiQueryMode = 'raw' | 'notes' | 'drums';
```

> **Note**: Timeline is NOT a separate mode. Notes mode emits State Timeline-compatible
> time-series DataFrames. Configure a State Timeline panel with "Partition by values" on
> `NoteName` to get a piano-roll view.

### MidiQueryFormat

```typescript
export type MidiQueryFormat = 'long' | 'wide';
```

- `'long'`: one row per event with NoteName/DrumName as a string field (requires
  "Partition by values" Grafana transform for State Timeline)
- `'wide'`: one column per note/drum name, value = Velocity | null (State Timeline native,
  no transform needed)
- Raw mode always uses long format regardless of this setting.

### MidiQuery (extends DataQuery from @grafana/schema)

```typescript
import { DataQuery } from '@grafana/schema';

export interface MidiQuery extends DataQuery {
  /** MIDI input device ID from MIDIAccess.inputs map. Empty string = no device selected. */
  deviceId: string;

  /** Display and data mode for this panel. */
  mode: MidiQueryMode;

  /**
   * Output DataFrame format for Notes and Drums modes.
   * Raw mode always uses long format regardless of this setting.
   * Default: 'long'
   */
  format: MidiQueryFormat;

  /**
   * Notes mode only: minimum MIDI note number to display (0–127).
   * Ignored when noteRangeAuto is true.
   * Default: 36 (C2)
   */
  noteRangeMin: number;

  /**
   * Notes mode only: maximum MIDI note number to display (0–127).
   * Ignored when noteRangeAuto is true.
   * Default: 84 (C6)
   */
  noteRangeMax: number;

  /**
   * Notes mode only: when true, expand the note range dynamically
   * as new notes are received rather than using noteRangeMin/Max.
   * Default: false
   */
  noteRangeAuto: boolean;
}

export const DEFAULT_QUERY: Partial<MidiQuery> = {
  deviceId: '',
  mode: 'raw',
  format: 'long',
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

### NoteEvent (for Notes mode)

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
   * null serialises to null in the DataFrame, which State Timeline treats as "state ended".
   */
  velocity: number | null;
}
```

### DrumEvent (for Drums mode)

```typescript
export interface DrumEvent {
  /** When this state change occurred (ms since epoch, for DataFrame time field) */
  timestamp: number;

  /** MIDI note number (0–127) */
  noteNumber: number;

  /** GM1 drum piece name, or "Unknown Drum (note NNN)" for out-of-map notes */
  drumName: string;

  /**
   * Velocity (1–127) on Note On; null on Note Off.
   * null serialises to null in the DataFrame, which State Timeline treats as "state ended".
   * State is driven entirely by MIDI input — no timer-based decay.
   */
  velocity: number | null;
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

### Notes Mode (Long format) — use with: State Timeline + "Partition by values" on NoteName

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Time         | time      | ms since epoch when state change occurred
NoteNumber   | number    | MIDI note number (0–127)
NoteName     | string    | Note name e.g. "C4", "D#5"
Velocity     | number    | Velocity (1–127) on Note On; null on Note Off
```

- One row per state-change event (Note On → velocity value, Note Off → null)
- When `noteRangeAuto=false`: only emit events for notes within [noteRangeMin, noteRangeMax]
- When `noteRangeAuto=true`: emit all events; range expands dynamically
- Full event history accumulated since subscription start; re-emitted on each new event
- **Panel setup**: "Partition by values" on `NoteName` → State Timeline piano-roll view

### Notes Mode (Wide format) — use with: State Timeline (native, no transform needed)

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Time         | time      | ms since epoch when state change occurred
<NoteName>   | number    | One column per distinct note seen; value = Velocity|null
```

- **Stateful**: each row carries the full current state — active notes retain their last velocity
  until Note Off (null); multiple notes active in parallel appear in the same row
- **Columns sorted by ascending MIDI note number** (pitch order, C-1=0 to G9=127), regardless
  of which notes were played first
- Example: Note On C4 vel=100, then Note On E4 vel=80 → row 1: `[t, C4=100, E4=null]`,
  row 2: `[t, C4=100, E4=80]` (C4 carried forward as still active)

### Drums Mode (Long format) — use with: State Timeline + "Partition by values" on DrumName

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Time         | time      | ms since epoch when state change occurred
NoteNumber   | number    | MIDI note number (channel 10 only)
DrumName     | string    | GM1 drum name or "Unknown Drum (note NNN)"
Velocity     | number    | Velocity (1–127) on Note On; null on Note Off
```

- One row per state-change event on channel 10 (Note On → velocity, Note Off → null)
- Filters channel 10 only; non-channel-10 messages are ignored
- Full event history accumulated since subscription start; re-emitted on each new event

### Drums Mode (Wide format) — use with: State Timeline (native, no transform needed)

```
Field name   | FieldType | Description
-------------|-----------|----------------------------------------------
Time         | time      | ms since epoch when state change occurred
<DrumName>   | number    | One column per distinct drum seen; value = Velocity|null
```

- **Stateful**: each row carries the full current state — active drums retain their last velocity
  until Note Off (null); multiple drums active in parallel appear in the same row
- **Columns sorted by ascending MIDI note number** (GM1 drum map order, note 35→81)

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

### Note Event Stream (per device, Notes mode)

```
  MIDI Note On (velocity > 0)  →  append NoteEvent { velocity }
  MIDI Note Off OR Note On (velocity = 0)  →  append NoteEvent { velocity: null }
```

State driven entirely by incoming MIDI messages. Full event history accumulated.

### Drum Event Stream (per device, Drums mode, channel 10 only)

```
  MIDI Note On ch10  →  append DrumEvent { velocity }
  MIDI Note Off ch10  →  append DrumEvent { velocity: null }
```

State driven entirely by incoming MIDI messages. No timer-based decay.

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
