import { Observable, from } from 'rxjs';
import {
  CoreApp,
  CustomVariableSupport,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  LoadingState,
  MetricFindValue,
  addRow,
  createDataFrame,
} from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { getTemplateSrv } from '@grafana/runtime';
import { VariableQueryEditor } from './components/VariableQueryEditor';

import {
  MidiQuery,
  MidiDataSourceOptions,
  DEFAULT_QUERY,
  MidiMessage,
  MidiDeviceInfo,
  NoteEvent,
  DrumEvent,
} from './types';
import { MidiAccessService } from './midi/MidiAccess';
import { AudioEngine } from './midi/AudioEngine';
import { formatNoteName, GM1_DRUM_MAP, GM1_DRUM_CHANNEL } from './constants';

const RAW_BUFFER_MAX = 1000;

function messageTypeLabel(msg: MidiMessage): string {
  switch (msg.type) {
    case 'noteOn':
      return 'Note On';
    case 'noteOff':
      return 'Note Off';
    case 'controlChange':
      return 'Control Change';
    case 'programChange':
      return 'Program Change';
    case 'pitchBend':
      return 'Pitch Bend';
    case 'channelPressure':
      return 'Channel Pressure';
    case 'polyphonicPressure':
      return 'Poly Pressure';
    case 'sysex':
      return 'SysEx';
    case 'clock':
      return 'Clock';
    default:
      return 'Unknown';
  }
}

function toHex(msg: MidiMessage): string {
  return [msg.statusByte, msg.data1, msg.data2].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

class MidiVariableSupport extends CustomVariableSupport<MidiDataSource, DataQuery, MidiQuery, MidiDataSourceOptions> {
  editor = VariableQueryEditor;

  constructor(private ds: MidiDataSource) {
    super();
  }

  query(_request: DataQueryRequest<DataQuery>): Observable<DataQueryResponse> {
    return from(
      this.ds.listDevices().then((devices) => ({
        data: [
          createDataFrame({
            fields: [
              { name: 'text', type: FieldType.string, values: devices.map((d) => d.name) },
              { name: 'value', type: FieldType.string, values: devices.map((d) => d.id) },
            ],
          }),
        ],
      }))
    );
  }
}

export class MidiDataSource extends DataSourceApi<MidiQuery, MidiDataSourceOptions> {
  readonly midiAccess: MidiAccessService;
  readonly audioEngine: AudioEngine;

  private rawBuffers = new Map<string, MidiMessage[]>();
  private noteEvents = new Map<string, NoteEvent[]>();
  private drumEvents = new Map<string, DrumEvent[]>();

  private stateChangeListeners = new Set<() => void>();
  private audioBlockedListeners = new Set<() => void>();

  constructor(instanceSettings: DataSourceInstanceSettings<MidiDataSourceOptions>) {
    super(instanceSettings);
    this.midiAccess = new MidiAccessService();
    this.audioEngine = new AudioEngine();
    this.midiAccess.onDeviceStateChange(() => {
      this.stateChangeListeners.forEach((cb) => cb());
    });
    this.audioEngine.onAudioBlocked = () => {
      this.audioBlockedListeners.forEach((cb) => cb());
    };
    this.variables = new MidiVariableSupport(this);
  }

  onAudioBlocked(callback: () => void): () => void {
    this.audioBlockedListeners.add(callback);
    return () => {
      this.audioBlockedListeners.delete(callback);
    };
  }

  getDefaultQuery(_app: CoreApp): Partial<MidiQuery> {
    return DEFAULT_QUERY;
  }

  filterQuery(query: MidiQuery): boolean {
    return !!query.deviceId;
  }

  async testDatasource() {
    if (!navigator.requestMIDIAccess) {
      return {
        status: 'error',
        message: 'Web MIDI API is not supported in this browser. Use Chrome or Edge.',
      };
    }
    try {
      await navigator.requestMIDIAccess();
      return { status: 'success', message: 'Web MIDI API is available' };
    } catch (err) {
      const msg = String(err);
      if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('security')) {
        return {
          status: 'error',
          message: 'MIDI access was denied. Please allow MIDI access in browser settings.',
        };
      }
      return { status: 'error', message: `MIDI access error: ${msg}` };
    }
  }

  async listDevices(): Promise<MidiDeviceInfo[]> {
    return this.midiAccess.listDevices();
  }

  async metricFindQuery(_query: string): Promise<MetricFindValue[]> {
    const devices = await this.midiAccess.listDevices();
    return devices.map((d) => ({ text: d.name, value: d.id }));
  }

  onDeviceStateChange(callback: () => void): () => void {
    this.stateChangeListeners.add(callback);
    return () => {
      this.stateChangeListeners.delete(callback);
    };
  }

  query(options: DataQueryRequest<MidiQuery>): Observable<DataQueryResponse> {
    return new Observable<DataQueryResponse>((subscriber) => {
      const target = options.targets[0];
      const deviceId = getTemplateSrv().replace(target?.deviceId ?? '', options.scopedVars);

      if (!deviceId) {
        subscriber.next({ data: [] });
        return () => {};
      }

      const resolvedTarget = { ...target, deviceId };
      this.ensureDeviceState(deviceId);

      const emit = () => {
        if (!subscriber.closed) {
          subscriber.next({ data: [this.buildDataFrame(resolvedTarget)], state: LoadingState.Streaming });
        }
      };

      emit(); // initial state

      const unsubscribe = this.midiAccess.subscribe(deviceId, (msg) => {
        this.handleMessage(resolvedTarget, msg);

        // Audio playback
        if (target.mode === 'notes') {
          if (msg.channel === GM1_DRUM_CHANNEL) {
            // Channel 10 always plays drum sounds, even in notes mode
            if (msg.type === 'noteOn') {
              this.audioEngine.playDrum(msg.data1, msg.data2);
            }
          } else {
            if (msg.type === 'noteOn') {
              this.audioEngine.playNote(msg.data1, msg.data2);
            } else if (msg.type === 'noteOff') {
              this.audioEngine.stopNote(msg.data1);
            }
          }
        } else if (target.mode === 'drums') {
          // All channels accepted in drums mode
          if (msg.type === 'noteOn') {
            this.audioEngine.playDrum(msg.data1, msg.data2);
          }
        }

        emit();
      });

      return () => {
        unsubscribe();
      };
    });
  }

  // ---- State management ----

  private ensureDeviceState(deviceId: string): void {
    if (!this.rawBuffers.has(deviceId)) {
      this.rawBuffers.set(deviceId, []);
    }
    if (!this.noteEvents.has(deviceId)) {
      this.noteEvents.set(deviceId, []);
    }
    if (!this.drumEvents.has(deviceId)) {
      this.drumEvents.set(deviceId, []);
    }
  }

  private handleMessage(target: MidiQuery, msg: MidiMessage): void {
    const { deviceId, mode } = target;

    switch (mode) {
      case 'raw':
        this.handleRaw(deviceId, msg);
        break;
      case 'notes':
        this.handleNotes(target, msg);
        break;
      case 'drums':
        this.handleDrums(deviceId, msg);
        break;
    }
  }

  private handleRaw(deviceId: string, msg: MidiMessage): void {
    const buf = this.rawBuffers.get(deviceId)!;
    buf.unshift(msg);
    if (buf.length > RAW_BUFFER_MAX) {
      buf.length = RAW_BUFFER_MAX;
    }
  }

  private handleNotes(target: MidiQuery, msg: MidiMessage): void {
    if (msg.type !== 'noteOn' && msg.type !== 'noteOff') {
      return;
    }
    const { deviceId, noteRangeMin, noteRangeMax } = target;
    const noteNumber = msg.data1;

    if (noteNumber < noteRangeMin || noteNumber > noteRangeMax) {
      return;
    }

    const events = this.noteEvents.get(deviceId)!;
    events.push({
      timestamp: Date.now(),
      noteNumber,
      noteName: formatNoteName(noteNumber),
      velocity: msg.type === 'noteOn' ? msg.data2 : null,
    });
  }

  private handleDrums(deviceId: string, msg: MidiMessage): void {
    if (msg.type !== 'noteOn' && msg.type !== 'noteOff') {
      return;
    }

    const noteNumber = msg.data1;
    const drumName = GM1_DRUM_MAP[noteNumber] ?? `Unknown Drum (note ${noteNumber})`;
    const events = this.drumEvents.get(deviceId)!;

    events.push({
      timestamp: Date.now(),
      noteNumber,
      drumName,
      velocity: msg.type === 'noteOn' ? msg.data2 : null,
    });
  }

  // ---- DataFrame builders ----

  buildDataFrame(target: MidiQuery): DataFrame {
    switch (target.mode) {
      case 'raw':
        return this.buildRawFrame(target.deviceId, target.refId);
      case 'notes':
        return target.format === 'wide'
          ? this.buildNotesWideFrame(target.deviceId, target.refId, target.noteRangeMin, target.noteRangeMax)
          : this.buildNotesLongFrame(target.deviceId, target.refId);
      case 'drums':
        return target.format === 'wide'
          ? this.buildDrumsWideFrame(target.deviceId, target.refId)
          : this.buildDrumsLongFrame(target.deviceId, target.refId);
    }
  }

  private buildRawFrame(deviceId: string, refId: string): DataFrame {
    const buf = this.rawBuffers.get(deviceId) ?? [];
    const frame = createDataFrame({
      refId,
      fields: [
        { name: 'Timestamp', type: FieldType.time, values: [] },
        { name: 'Type', type: FieldType.string, values: [] },
        { name: 'Channel', type: FieldType.number, values: [] },
        { name: 'Data1', type: FieldType.number, values: [] },
        { name: 'Data2', type: FieldType.number, values: [] },
        { name: 'Raw', type: FieldType.string, values: [] },
      ],
    });
    for (const msg of buf) {
      addRow(frame, [msg.timestamp, messageTypeLabel(msg), msg.channel, msg.data1, msg.data2, toHex(msg)]);
    }
    return frame;
  }

  private buildNotesLongFrame(deviceId: string, refId: string): DataFrame {
    const events = this.noteEvents.get(deviceId) ?? [];
    const frame = createDataFrame({
      refId,
      fields: [
        { name: 'Time', type: FieldType.time, values: [] },
        { name: 'NoteNumber', type: FieldType.number, values: [] },
        { name: 'NoteName', type: FieldType.string, values: [] },
        { name: 'Velocity', type: FieldType.number, values: [] },
      ],
    });
    for (const event of events) {
      addRow(frame, [event.timestamp, event.noteNumber, event.noteName, event.velocity]);
    }
    return frame;
  }

  private buildNotesWideFrame(deviceId: string, refId: string, noteRangeMin: number, noteRangeMax: number): DataFrame {
    const events = this.noteEvents.get(deviceId) ?? [];

    // Pre-populate ALL notes in [noteRangeMin, noteRangeMax] in descending order (highest first).
    const allNoteNames: string[] = [];
    for (let n = noteRangeMax; n >= noteRangeMin; n--) {
      allNoteNames.push(formatNoteName(n));
    }

    const frame = createDataFrame({
      refId,
      fields: [
        { name: 'Time', type: FieldType.time, values: [] },
        ...allNoteNames.map((name) => ({ name, type: FieldType.number, values: [] })),
      ],
    });

    // Stateful: carry forward last known velocity for every active note.
    const currentState = new Map<string, number | null>();
    for (const event of events) {
      currentState.set(event.noteName, event.velocity);
      const row: Array<number | null> = [event.timestamp];
      for (const name of allNoteNames) {
        row.push(currentState.get(name) ?? null);
      }
      addRow(frame, row);
    }

    return frame;
  }

  private buildDrumsLongFrame(deviceId: string, refId: string): DataFrame {
    const events = this.drumEvents.get(deviceId) ?? [];
    const frame = createDataFrame({
      refId,
      fields: [
        { name: 'Time', type: FieldType.time, values: [] },
        { name: 'NoteNumber', type: FieldType.number, values: [] },
        { name: 'DrumName', type: FieldType.string, values: [] },
        { name: 'Velocity', type: FieldType.number, values: [] },
      ],
    });
    for (const event of events) {
      addRow(frame, [event.timestamp, event.noteNumber, event.drumName, event.velocity]);
    }
    return frame;
  }

  private buildDrumsWideFrame(deviceId: string, refId: string): DataFrame {
    const events = this.drumEvents.get(deviceId) ?? [];

    // 6-piece core kit preset, pre-populated in descending note order.
    const PRESET: Array<[number, string]> = [
      [51, 'Ride Cymbal 1'],
      [49, 'Crash Cymbal 1'],
      [46, 'Open Hi-Hat'],
      [42, 'Closed Hi-Hat'],
      [38, 'Acoustic Snare'],
      [36, 'Bass Drum 1'],
    ];
    const presetNotes = new Set(PRESET.map(([n]) => n));
    const presetNames = PRESET.map(([, name]) => name);

    // Any drums outside the preset that have been seen, sorted descending.
    const extraMap = new Map<number, string>();
    for (const e of events) {
      if (!presetNotes.has(e.noteNumber) && !extraMap.has(e.noteNumber)) {
        extraMap.set(e.noteNumber, e.drumName);
      }
    }
    const extraNames = [...extraMap.entries()].sort((a, b) => b[0] - a[0]).map(([, name]) => name);

    const allNames = [...presetNames, ...extraNames];

    const frame = createDataFrame({
      refId,
      fields: [
        { name: 'Time', type: FieldType.time, values: [] },
        ...allNames.map((name) => ({ name, type: FieldType.number, values: [] })),
      ],
    });

    // Stateful: carry forward last known velocity for every active drum.
    const currentState = new Map<string, number | null>();
    for (const event of events) {
      currentState.set(event.drumName, event.velocity);
      const row: Array<number | null> = [event.timestamp];
      for (const name of allNames) {
        row.push(currentState.get(name) ?? null);
      }
      addRow(frame, row);
    }

    return frame;
  }
}
