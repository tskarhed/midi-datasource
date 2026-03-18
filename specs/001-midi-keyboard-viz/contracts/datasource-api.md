# Contract: MidiDataSource API

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-03-18

This document defines the TypeScript interface contract for the MidiDataSource class. All methods
must conform to these signatures and behaviours.

---

## Class: MidiDataSource

```typescript
class MidiDataSource extends DataSourceApi<MidiQuery, MidiDataSourceOptions> {
  /**
   * Returns an Observable that streams DataFrames for the first target in options.targets.
   *
   * Behaviour per mode:
   * - 'raw':      emits the current rolling buffer on every MIDI message
   * - 'notes':    emits the current set of active notes on every Note On/Off
   * - 'timeline': emits the accumulated note event history on every Note On/Off
   * - 'drums':    emits the GM1 drum state table on every drum-channel Note On
   *               and after each 200ms decay timer fires
   *
   * The Observable MUST:
   * - Emit an initial DataFrame immediately on subscribe (may be empty)
   * - Call subscriber.next() within 100ms of each incoming MIDI message (FR-003)
   * - Clean up the MIDI listener and any timers in the teardown function
   * - Never call subscriber.error() for expected MIDI events; only for device errors
   *
   * @param options DataQueryRequest containing targets with MidiQuery objects
   * @returns Observable<DataQueryResponse>
   */
  query(options: DataQueryRequest<MidiQuery>): Observable<DataQueryResponse>;

  /**
   * Tests whether the browser supports the Web MIDI API.
   *
   * Returns success if navigator.requestMIDIAccess resolves successfully.
   * Returns error if:
   * - navigator.requestMIDIAccess is undefined (browser unsupported)
   * - The promise rejects (permission denied or hardware error)
   *
   * MUST NOT make any HTTP calls.
   */
  testDatasource(): Promise<TestDataSourceResponse>;

  /**
   * Returns the default query configuration for new panels.
   * MUST return DEFAULT_QUERY from types.ts.
   */
  getDefaultQuery(_app: CoreApp): Partial<MidiQuery>;

  /**
   * Returns false (preventing query execution) if deviceId is empty.
   * Returns true otherwise.
   */
  filterQuery(query: MidiQuery): boolean;

  /**
   * Returns the list of MIDI input devices currently detected by the browser.
   *
   * Calls navigator.requestMIDIAccess() on the first call and caches the MIDIAccess
   * object for subsequent calls. The cache is refreshed on onstatechange events.
   *
   * Resolves to an empty array if no devices are connected.
   * Rejects if requestMIDIAccess is unavailable or permission is denied.
   *
   * NOTE: This is a custom method (not part of DataSourceApi). The QueryEditor
   * calls it via props.datasource.listDevices().
   */
  listDevices(): Promise<MidiDeviceInfo[]>;
}
```

---

## testDatasource() Response Contract

| Condition                                  | status      | message                                                                   |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------- |
| `navigator.requestMIDIAccess` resolves     | `'success'` | `'Web MIDI API is available'`                                             |
| `navigator.requestMIDIAccess` is undefined | `'error'`   | `'Web MIDI API is not supported in this browser. Use Chrome or Edge.'`    |
| Permission denied                          | `'error'`   | `'MIDI access was denied. Please allow MIDI access in browser settings.'` |
| Unexpected error                           | `'error'`   | `'MIDI access error: <error message>'`                                    |

---

## Observable Emission Contract

### When does query() emit?

| Mode     | Emits when                                       | DataFrame content          |
| -------- | ------------------------------------------------ | -------------------------- |
| raw      | Any MIDI message from the selected device        | Full rolling buffer        |
| notes    | Any Note On or Note Off on the selected device   | All currently active notes |
| timeline | Any Note On or Note Off on the selected device   | Full event history         |
| drums    | Note On on channel 10 OR 200ms decay timer fires | Full GM1 drum state table  |

### Initial emission

The Observable MUST emit once immediately on subscribe with the current state (which will be
empty for a new subscription). This prevents Grafana from showing a loading spinner indefinitely.

---

## MIDI Mock Interface (for testing)

The DataSource accepts a `midiAccess` constructor parameter for dependency injection in tests.
This allows unit tests to inject a mock implementation without calling `requestMIDIAccess`.

```typescript
/** Subset of the Web MIDI API MIDIAccess interface used by MidiDataSource */
export interface MidiAccessInterface {
  inputs: Map<string, MidiInputInterface>;
  onstatechange: ((event: MIDIConnectionEvent) => void) | null;
}

export interface MidiInputInterface {
  id: string;
  name: string;
  state: MIDIPortDeviceState;
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
  onstatechange: ((event: MIDIConnectionEvent) => void) | null;
}
```

Production code calls `navigator.requestMIDIAccess()` and wraps the result in a class that
implements `MidiAccessInterface`. Tests inject a mock directly.
