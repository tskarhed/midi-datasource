import { MidiDataSource } from '../../src/datasource';
import { DEFAULT_QUERY, MidiQuery } from '../../src/types';
import { WMT } from '../__mocks__/web-midi-api';
import { DataSourceInstanceSettings, CoreApp } from '@grafana/data';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getTemplateSrv: () => ({
    replace: (str: string) => str,
    getVariables: () => [],
  }),
}));

function makeSettings(): DataSourceInstanceSettings {
  return {
    id: 1,
    uid: 'test-uid',
    type: 'tskarhed-midi-datasource',
    name: 'Test MIDI',
    meta: {} as never,
    jsonData: {},
    access: 'proxy',
    url: '',
    readOnly: false,
  } as DataSourceInstanceSettings;
}

function makeQuery(overrides: Partial<MidiQuery> = {}): MidiQuery {
  return {
    refId: 'A',
    deviceId: '',
    mode: 'raw',
    format: 'long',
    noteRangeMin: 36,
    noteRangeMax: 84,
    noteRangeAuto: false,
    ...overrides,
  };
}

function makeRequest(target: MidiQuery) {
  return {
    targets: [target],
    requestId: '1',
    interval: '1s',
    intervalMs: 1000,
    maxDataPoints: 1000,
    range: { from: {} as never, to: {} as never, raw: { from: 'now-1h', to: 'now' } },
    scopedVars: {},
    timezone: 'UTC',
    app: 'dashboard',
    startTime: 0,
  } as never;
}

describe('MidiDataSource', () => {
  let ds: MidiDataSource;

  beforeEach(() => {
    ds = new MidiDataSource(makeSettings());
  });

  // ===== Foundation =====
  describe('filterQuery()', () => {
    it('returns false when deviceId is empty', () => {
      expect(ds.filterQuery(makeQuery({ deviceId: '' }))).toBe(false);
    });

    it('returns true when deviceId is set', () => {
      expect(ds.filterQuery(makeQuery({ deviceId: 'dev-1', mode: 'raw' }))).toBe(true);
    });
  });

  describe('testDatasource()', () => {
    it('returns success when requestMIDIAccess resolves', async () => {
      const result = await ds.testDatasource();
      expect(result.status).toBe('success');
    });

    it('returns error when requestMIDIAccess is undefined', async () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const result = await ds.testDatasource();
      expect(result.status).toBe('error');
      expect(result.message).toMatch(/Chrome or Edge/);
    });
  });

  describe('getDefaultQuery()', () => {
    it('returns DEFAULT_QUERY values', () => {
      const q = ds.getDefaultQuery(CoreApp.Dashboard);
      expect(q).toMatchObject(DEFAULT_QUERY);
    });
  });

  // ===== US1: Raw mode =====
  describe('query() — raw mode', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Test Piano');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('emits initial empty DataFrame immediately on subscribe', (done) => {
      const obs = ds.query(makeRequest(makeQuery({ deviceId, mode: 'raw' })));
      obs.subscribe({
        next: (response) => {
          expect(response.data).toHaveLength(1);
          done();
        },
      });
    });

    it('emits a DataFrame row when a MIDI message fires', (done) => {
      let emitCount = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'raw' }))).subscribe({
        next: (response) => {
          emitCount++;
          if (emitCount === 2) {
            expect(response.data[0].length).toBe(1);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]);
    });

    it('caps the rolling buffer at 1000 rows', (done) => {
      let lastEmit: import('@grafana/data').DataQueryResponse | null = null;
      let emitCount = 0;

      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'raw' }))).subscribe({
        next: (response) => {
          lastEmit = response;
          emitCount++;
          if (emitCount === 1002) {
            expect(lastEmit!.data[0].length).toBe(1000);
            sub.unsubscribe();
            done();
          }
        },
      });

      for (let i = 0; i < 1001; i++) {
        src.emit([0x90, 60, 100]);
      }
    });
  });

  // ===== US2: Notes mode =====
  describe('query() — notes mode (long format)', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Notes Piano');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('emits empty DataFrame on subscribe', (done) => {
      const obs = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' })));
      obs.subscribe({
        next: (response) => {
          expect(response.data[0].length).toBe(0);
          done();
        },
      });
    });

    it('appends a row with velocity on Note On', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 2) {
            const frame = response.data[0];
            expect(frame.length).toBe(1);
            const noteNames = frame.fields.find((f: { name: string }) => f.name === 'NoteName')?.values;
            expect(noteNames?.[0]).toBe('C4');
            const velocities = frame.fields.find((f: { name: string }) => f.name === 'Velocity')?.values;
            expect(velocities?.[0]).toBe(100);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // Note On C4 vel 100
    });

    it('appends null-velocity row on Note Off', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            expect(frame.length).toBe(2);
            const velocities = frame.fields.find((f: { name: string }) => f.name === 'Velocity')?.values;
            expect(velocities?.[1]).toBeNull();
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // Note On
      src.emit([0x80, 60, 0]); // Note Off
    });

    it('treats velocity-0 Note On as Note Off (null-velocity row)', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            const velocities = frame.fields.find((f: { name: string }) => f.name === 'Velocity')?.values;
            expect(velocities?.[1]).toBeNull();
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // Note On
      src.emit([0x90, 60, 0]); // Velocity-0 Note On = Note Off
    });

    it('accumulates three rows for a chord', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 4) {
            expect(response.data[0].length).toBe(3);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]);
      src.emit([0x90, 64, 80]);
      src.emit([0x90, 67, 90]);
    });

    it('filters notes outside range', (done) => {
      const target = makeQuery({ deviceId, mode: 'notes', noteRangeMin: 60, noteRangeMax: 72 });
      let count = 0;
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          count++;
          if (count === 2) {
            expect(response.data[0].length).toBe(0); // note 48 outside range
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 48, 80]); // note 48 outside [60,72]
    });
  });

  describe('query() — notes mode (wide format)', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Wide Piano');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('emits one column per distinct note name seen', (done) => {
      const target = makeQuery({ deviceId, mode: 'notes', format: 'wide' });
      let count = 0;
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            const fieldNames = frame.fields.map((f: { name: string }) => f.name);
            expect(fieldNames).toContain('C4');
            expect(fieldNames).toContain('E4');
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // C4
      src.emit([0x90, 64, 80]); // E4
    });

    it('orders columns by descending MIDI note number (highest note first)', (done) => {
      const target = makeQuery({ deviceId, mode: 'notes', format: 'wide', noteRangeMin: 60, noteRangeMax: 64 });
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          const frame = response.data[0];
          const fieldNames = frame.fields.map((f: { name: string }) => f.name);
          const c4idx = fieldNames.indexOf('C4'); // note 60
          const e4idx = fieldNames.indexOf('E4'); // note 64
          expect(e4idx).toBeGreaterThan(0); // exists (after Time)
          expect(c4idx).toBeGreaterThan(e4idx); // E4 (64) before C4 (60) in descending order
          done();
        },
      });
      sub.unsubscribe(); // initial emit is synchronous; sub is assigned before this line
      // No need to play notes — columns are pre-populated from range
    });

    it('pre-populates all columns in the note range on initial subscribe', (done) => {
      const target = makeQuery({ deviceId, mode: 'notes', format: 'wide', noteRangeMin: 60, noteRangeMax: 62 });
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          const frame = response.data[0];
          const fieldNames = frame.fields.map((f: { name: string }) => f.name);
          // All 3 notes in [60, 62] should be columns even before any note is played
          expect(fieldNames).toContain('D4'); // note 62
          expect(fieldNames).toContain('C#4'); // note 61
          expect(fieldNames).toContain('C4'); // note 60
          expect(frame.length).toBe(0); // no rows yet — no notes played
          done();
        },
      });
      sub.unsubscribe(); // initial emit is synchronous; sub is assigned before this line
    });

    it('carries forward active note velocities so parallel notes are visible in the same row', (done) => {
      const target = makeQuery({ deviceId, mode: 'notes', format: 'wide' });
      let count = 0;
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            // Row 0 (C4 on): C4=100, E4=null (E4 not yet seen)
            // Row 1 (E4 on): C4=100 (still active, carried forward), E4=80
            const c4 = frame.fields.find((f: { name: string }) => f.name === 'C4')?.values;
            const e4 = frame.fields.find((f: { name: string }) => f.name === 'E4')?.values;
            expect(c4?.[0]).toBe(100);
            expect(e4?.[0]).toBeNull(); // E4 not yet seen
            expect(c4?.[1]).toBe(100); // C4 still active — carried forward
            expect(e4?.[1]).toBe(80);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // C4
      src.emit([0x90, 64, 80]); // E4
    });
  });

  // ===== US3: Drums mode =====
  describe('query() — drums mode (long format)', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Drums Kit');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('emits empty DataFrame on subscribe', (done) => {
      const obs = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' })));
      obs.subscribe({
        next: (response) => {
          expect(response.data[0].length).toBe(0);
          done();
        },
      });
    });

    it('appends a row with velocity on ch10 Note On', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 2) {
            const frame = response.data[0];
            expect(frame.length).toBe(1);
            const drumNames = frame.fields.find((f: { name: string }) => f.name === 'DrumName')?.values;
            expect(drumNames?.[0]).toBe('Bass Drum 1');
            const velocities = frame.fields.find((f: { name: string }) => f.name === 'Velocity')?.values;
            expect(velocities?.[0]).toBe(80);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x99, 36, 80]); // Note On ch10 note 36 (Bass Drum 1)
    });

    it('appends null-velocity row on ch10 Note Off', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            expect(frame.length).toBe(2);
            const velocities = frame.fields.find((f: { name: string }) => f.name === 'Velocity')?.values;
            expect(velocities?.[1]).toBeNull();
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x99, 36, 80]); // Note On ch10
      src.emit([0x89, 36, 0]); // Note Off ch10
    });

    it('uses "Unknown Drum (note NNN)" for out-of-range notes', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 2) {
            const frame = response.data[0];
            const names = frame.fields.find((f: { name: string }) => f.name === 'DrumName')?.values as string[];
            expect(names.some((n) => n.includes('Unknown Drum') && n.includes('34'))).toBe(true);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x99, 34, 80]); // note 34, below GM1 map range (35-81)
    });

    it('emits a DrumEvent for Note On on non-channel-10 (any channel accepted)', (done) => {
      let count = 0;
      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' }))).subscribe({
        next: (response) => {
          count++;
          if (count === 2) {
            const frame = response.data[0];
            const drumNames = frame.fields.find((f: { name: string }) => f.name === 'DrumName')?.values;
            expect(drumNames?.[0]).toBe('Bass Drum 1');
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 36, 80]); // Note On ch1 (not ch10) — now accepted in drums mode
    });
  });

  // ===== Audio routing: channel 10 in notes mode, all-channel drums =====
  describe('audio routing — channel 10 in notes mode', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Audio Routing');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('calls playDrum (not playNote) for channel 10 Note On in notes mode', (done) => {
      const playNoteSpy = jest.spyOn(ds.audioEngine, 'playNote');
      const playDrumSpy = jest.spyOn(ds.audioEngine, 'playDrum');

      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (_response) => {
          if (playDrumSpy.mock.calls.length > 0) {
            expect(playDrumSpy).toHaveBeenCalledWith(36, 80);
            expect(playNoteSpy).not.toHaveBeenCalled();
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x99, 36, 80]); // Note On ch10 note 36
    });

    it('calls playNote (not playDrum) for non-channel-10 Note On in notes mode', (done) => {
      const playNoteSpy = jest.spyOn(ds.audioEngine, 'playNote');
      const playDrumSpy = jest.spyOn(ds.audioEngine, 'playDrum');

      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'notes' }))).subscribe({
        next: (_response) => {
          if (playNoteSpy.mock.calls.length > 0) {
            expect(playNoteSpy).toHaveBeenCalledWith(60, 100);
            expect(playDrumSpy).not.toHaveBeenCalled();
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 60, 100]); // Note On ch1 note 60
    });

    it('calls playDrum for Note On on any channel in drums mode', (done) => {
      const playDrumSpy = jest.spyOn(ds.audioEngine, 'playDrum');

      const sub = ds.query(makeRequest(makeQuery({ deviceId, mode: 'drums' }))).subscribe({
        next: (_response) => {
          if (playDrumSpy.mock.calls.length > 0) {
            expect(playDrumSpy).toHaveBeenCalledWith(36, 80);
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x90, 36, 80]); // Note On ch1 (non-drum channel)
    });
  });

  describe('query() — drums mode (wide format)', () => {
    let src: InstanceType<typeof WMT.MidiSrc>;
    let deviceId: string;

    beforeEach(async () => {
      src = new WMT.MidiSrc('Wide Drums');
      src.connect();
      const devices = await ds.listDevices();
      deviceId = devices[0].id;
    });

    afterEach(() => {
      src.disconnect();
    });

    it('emits one column per distinct drum name seen', (done) => {
      const target = makeQuery({ deviceId, mode: 'drums', format: 'wide' });
      let count = 0;
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          count++;
          if (count === 3) {
            const frame = response.data[0];
            const fieldNames = frame.fields.map((f: { name: string }) => f.name);
            expect(fieldNames).toContain('Bass Drum 1');
            expect(fieldNames).toContain('Acoustic Snare');
            sub.unsubscribe();
            done();
          }
        },
      });
      src.emit([0x99, 36, 80]); // Bass Drum 1
      src.emit([0x99, 38, 100]); // Acoustic Snare
    });

    it('pre-populates 6-piece core kit preset on initial subscribe in descending order', (done) => {
      const target = makeQuery({ deviceId, mode: 'drums', format: 'wide' });
      const sub = ds.query(makeRequest(target)).subscribe({
        next: (response) => {
          const frame = response.data[0];
          const fieldNames = frame.fields.map((f: { name: string }) => f.name);
          // All 6 preset drums should be columns even before any drum is hit
          expect(fieldNames).toContain('Ride Cymbal 1');
          expect(fieldNames).toContain('Crash Cymbal 1');
          expect(fieldNames).toContain('Open Hi-Hat');
          expect(fieldNames).toContain('Closed Hi-Hat');
          expect(fieldNames).toContain('Acoustic Snare');
          expect(fieldNames).toContain('Bass Drum 1');
          // Descending: Ride (51) before Bass Drum (36)
          expect(fieldNames.indexOf('Ride Cymbal 1')).toBeLessThan(fieldNames.indexOf('Bass Drum 1'));
          expect(frame.length).toBe(0); // no rows yet
          done();
        },
      });
      sub.unsubscribe(); // initial emit is synchronous; sub is assigned before this line
    });
  });
});
