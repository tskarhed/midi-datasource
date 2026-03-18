# Research: MIDI Keyboard Datasource Plugin

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-03-18

---

## 1. Streaming Architecture

**Decision**: Return `Observable<DataQueryResponse>` from `query()` — no backend plugin required.

**Rationale**: The Web MIDI API is a browser-side API (`navigator.requestMIDIAccess`). There is no
server to push data from, so Grafana Live (which requires a Go backend) is inappropriate.
`DataSourceApi.query()` is typed as `Observable<DataQueryResponse> | Promise<DataQueryResponse>`.
Returning an Observable gives us real-time push semantics: each MIDI event calls
`subscriber.next({data:[...]})`. Grafana subscribes when the panel renders and unsubscribes on
panel unmount or query change — the Observable teardown handles listener cleanup.

**Alternatives considered**:

- _Grafana Live / backend plugin_: Requires a Go backend; no path for browser-to-server MIDI
  relay. Ruled out.
- _Polling with Promise_: 1–5s dashboard refresh interval violates SC-002/SC-003 (50ms). Ruled
  out.

---

## 2. Plugin Architecture — Pure Frontend, No Backend

**Decision**: Frontend-only plugin. Remove all `getBackendSrv`, `baseUrl`, and HTTP scaffolding
from `datasource.ts`. `testDatasource()` tests MIDI API availability instead of an HTTP endpoint.

**Implications**:

- `plugin.json` does NOT need `"backend": true` or `"streaming": true`
- `ConfigEditor` requires no credentials; can be minimal or empty
- `testDatasource()` calls `navigator.requestMIDIAccess()` to verify browser support

---

## 3. Device Selection — Per-Panel via Query Object

**Decision**: MIDI device selection lives in the `MidiQuery` object (`deviceId` field), not in
datasource config. The `QueryEditor` calls `props.datasource.listDevices()` to populate a
`Select` dropdown.

**Rationale**: FR-002 requires panels on the same dashboard to independently select different
devices. Storing `deviceId` in the per-panel query achieves this using standard Grafana patterns
— the DataSource instance is shared but subscriptions are per `deviceId`.

---

## 4. Observable-Based MIDI Subscription Pattern

**Pattern**:

```typescript
query(options: DataQueryRequest<MidiQuery>): Observable<DataQueryResponse> {
  return new Observable<DataQueryResponse>((subscriber) => {
    const target = options.targets[0];
    const unsubscribe = this.midiAccess.subscribe(target.deviceId, (msg) => {
      this.updateState(target, msg);
      if (target.mode === 'notes' || target.mode === 'drums') {
        this.audioEngine.play(target.mode, msg);
      }
      subscriber.next({ data: [this.buildDataFrame(target)] });
    });
    subscriber.next({ data: [this.buildDataFrame(target)] }); // emit initial state
    return () => unsubscribe();
  });
}
```

**Per-device in-memory state** maintained in the DataSource instance:

- `rawBuffers`: `Map<deviceId, MidiMessage[]>` — rolling 1000-message buffer
- `activeNotes`: `Map<deviceId, Map<noteNumber, ActiveNote>>` — currently held notes
- `noteEvents`: `Map<deviceId, NoteEvent[]>` — timeline state-change history
- `drumStates`: `Map<deviceId, Map<noteNumber, DrumHit>>` — hits with 200ms decay

---

## 5. Audio Synthesis — Web Audio API

**Decision**: Use browser-native Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`).

**Note synthesis** (US2):

- Triangle wave oscillator; frequency = `440 * 2^((noteNumber - 69) / 12)` Hz
- Amplitude = `velocity / 127` via GainNode
- Note Off: exponential ramp to 0 over 100ms then `oscillator.stop()`

**Drum synthesis** (US4):

- Kick (35–36): Sine oscillator 150Hz → 50Hz sweep over 80ms
- Snare (38, 40): Band-pass filtered noise + 200Hz tone, 100ms
- Hi-Hat closed (42, 44): High-pass noise (>8kHz), 40ms
- Hi-Hat open (46): High-pass noise, 300ms
- Cymbal (49, 51, 52, 57, 59): Metallic noise, 500ms decay
- Generic: Band-pass noise, 80ms

**Autoplay policy**: If `AudioContext.state === 'suspended'` on first use, show an inline
`Alert` from `@grafana/ui` asking the user to click. Resume context on click.

---

## 6. State Timeline Data Format

**Decision**: Timeline mode returns a **long-format DataFrame** with columns
`(Time, NoteNumber, NoteName, State)`. Users apply the built-in Grafana **"Partition by values"**
transformation on the `NoteName` field to produce the wide format the State Timeline panel needs.

**Why long format (not pre-pivoted wide format)**:

- The datasource emits state-change events naturally as they happen (one row per event)
- Pre-pivoting to 128 note columns in the datasource is complex and wasteful
- Grafana's "Partition by values" transformation does this pivot reliably with zero extra code
- Users can further filter note ranges using Grafana's "Filter by value" transformation
- The datasource stays simple; transformation is configuration, not code

**Long-format output**:

```
Time(time) | NoteNumber(number) | NoteName(string) | State(string)
-----------|--------------------|-----------------|--------------
100ms      | 60                 | C4              | on
110ms      | 64                 | E4              | on
350ms      | 60                 | C4              | off
500ms      | 64                 | E4              | off
```

**User setup for State Timeline panel**:

1. Add panel → State Timeline visualization
2. Select MIDI datasource → Timeline mode
3. Add transformation: "Partition by values" → field: `NoteName`
4. State Timeline shows one swimlane per note, bars showing durations

**Null values**: When a note is released, we emit a row with `State = null` (not the string "off").
Grafana State Timeline treats null as "state ended" and closes the bar at that time.

---

## 7. Testing Strategy

### Unit Tests (Jest + web-midi-test)

**Library**: `web-midi-test` (npm package) mocks `navigator.requestMIDIAccess` in jsdom.
Provides `WMT.MidiSrc` for virtual input devices and `WMT.emit()` to fire MIDI events.

```typescript
import * as WMT from 'web-midi-test';
beforeEach(() => {
  WMT.midi = true;
});
afterEach(() => {
  WMT.reset();
});
```

**Testable with mocks**: message parsing, note name formatting, GM drum map, DataFrame building,
circular buffer, AudioEngine (with mocked AudioContext), MidiAccess subscribe/unsubscribe.

### E2E Tests (Playwright + @grafana/plugin-e2e)

Inject fake `navigator.requestMIDIAccess` via `page.addInitScript()` before Grafana loads.
Fire events from test context via `page.evaluate(() => window.__midiMock.fireMessage(...))`.

**Coverage**: device selector renders, mode selector renders, raw table populates, note display
updates, timeline emits rows, drum labels highlight. Audio playback is excluded from E2E.

### Manual Testing Required

| Scenario                                 | Why Manual                                  |
| ---------------------------------------- | ------------------------------------------- |
| Audio pitch accuracy (US2)               | Cannot assert sound output programmatically |
| Drum sound quality (US4)                 | Listening required                          |
| Real MIDI device latency (SC-002/SC-003) | Requires physical device                    |
| Hot-plug detection                       | Browser hardware event behaviour            |
| Autoplay policy prompt                   | Requires fresh browser session              |

---

## 8. @grafana/ui Components Needed

All query editor UI uses `@grafana/ui` only (no custom components needed):

- `Select` — device dropdown (async options) and mode dropdown
- `InlineField` / `InlineFieldRow` — consistent label layout
- `Switch` — "auto note range" toggle
- `Input` — manual note range min/max
- `Alert` — no MIDI support, device disconnected, audio blocked
- `Spinner` — while `requestMIDIAccess` resolves
