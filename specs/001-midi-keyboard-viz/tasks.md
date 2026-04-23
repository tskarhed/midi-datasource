---
description: 'Task list for MIDI Keyboard Datasource Plugin'
---

# Tasks: MIDI Keyboard Datasource Plugin

**Input**: Design documents from `/specs/001-midi-keyboard-viz/`
**Prerequisites**: plan.md ✅ spec.md ✅ data-model.md ✅ research.md ✅ contracts/ ✅ quickstart.md ✅

**Architecture** (from spec.md clarifications 2026-04-23):

- All modes emit **time-series DataFrames** (with a `Time` field)
- **Three query modes**: Raw, Notes, Drums — Timeline is NOT a separate mode
- Notes and Drums are **filtered+transformed views** over the raw MIDI event stream
- Notes mode emits State Timeline-compatible event streams (Note On → velocity, Note Off → null)
- Drums mode filters channel 10 only; state driven by MIDI Note On/Off (no 200ms decay timer)
- Notes and Drums support a **Long / Wide format toggle** in the query editor
- Wide format is **stateful**: each row carries current velocity for ALL active notes/drums
  (active notes carry forward their last velocity until Note Off → null)
- Wide format columns sorted by **ascending MIDI note number** (pitch order), regardless of play order

**Tests**: TDD is MANDATORY per constitution Principle II. Test tasks appear before each
implementation block and MUST be observed failing before the corresponding implementation begins.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- All file paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Install new dependency, create directory structure, update design docs to reflect
the clarified architecture, and provision the datasource for E2E tests.

- [x] T001 Install `web-midi-test` dev dependency: `npm install --save-dev web-midi-test`
- [x] T002 [P] Create source directories: `mkdir -p src/midi`
- [x] T003 [P] Create test directories: `mkdir -p tests/__mocks__ tests/unit tests/e2e/fixtures`
- [x] T004 [P] Create `provisioning/datasources/midi.yml` — provisioned MIDI datasource for E2E:
  ```yaml
  apiVersion: 1
  datasources:
    - name: MIDI
      type: tskarhed-midi-datasource
      access: proxy
      isDefault: false
  ```
- [x] T005 [P] Update `specs/001-midi-keyboard-viz/data-model.md` to reflect clarifications:
  - `MidiQueryMode = 'raw' | 'notes' | 'drums'` (remove `'timeline'`)
  - Add `format: 'long' | 'wide'` field to `MidiQuery` interface (default `'long'`)
  - Remove Drums 200ms decay from state machine diagram
  - Update Notes DataFrame schema: long format `[Time, NoteNumber, NoteName, Velocity|null]`
    and wide format `[Time, <NoteName columns> = Velocity|null]`
  - Update Drums DataFrame schema: long format `[Time, NoteNumber, DrumName, Velocity|null]`
    and wide format `[Time, <DrumName columns> = Velocity|null]`
  - Remove "Timeline Mode" DataFrame schema section; add note that Notes mode replaces it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure-logic modules and test infrastructure that ALL user stories depend on.
No user story implementation may begin until this phase is complete.

**⚠️ CRITICAL**: Write tests first; verify they FAIL before writing the corresponding implementation.

### 2a. Test Infrastructure

- [x] T006 [P] Create `tests/__mocks__/web-midi-api.ts` — Jest global setup that installs
      `web-midi-test` on `navigator`. Must export `beforeEach`/`afterEach` hooks setting
      `WMT.midi = true` and calling `WMT.reset()`. Reference: `research.md` §7.
- [x] T007 [P] Create `tests/e2e/fixtures/midi-mock.ts` — Playwright `injectMidiMock(page)`
      function that calls `page.addInitScript()` to override `navigator.requestMIDIAccess` with a
      fake implementation exposing `window.__midiMock.addInput(id, name)` and
      `window.__midiMock.fireMessage(deviceId, dataBytes[])`. Reference: `research.md` §7.

### 2b. Constants

- [x] T008 [P] Write `tests/unit/constants.test.ts` — unit tests for:
  - `formatNoteName(60)` → `'C4'`; `formatNoteName(69)` → `'A4'`; `formatNoteName(0)` → `'C-1'`
  - `noteToFrequency(69)` → `440` (±0.001); `noteToFrequency(57)` → `220` (±0.001)
  - `GM1_DRUM_MAP[36]` → `'Bass Drum 1'`; `GM1_DRUM_MAP[42]` → `'Closed Hi-Hat'`
  - All 47 entries of `GM1_DRUM_MAP` present (keys 35–81)
  - `GM1_DRUM_CHANNEL` → `10`; `GM1_DRUM_NOTE_MIN` → `35`; `GM1_DRUM_NOTE_MAX` → `81`
  - Verify tests FAIL before T009 is implemented
- [x] T009 Create `src/constants.ts` — implement `GM1_DRUM_MAP`, `GM1_DRUM_CHANNEL`,
      `GM1_DRUM_NOTE_MIN/MAX`, `NOTE_NAMES`, `formatNoteName(noteNumber)`,
      `noteToFrequency(noteNumber)`. Exact values from `data-model.md` §Constants.
      Run `npm run test:ci` — T008 tests MUST pass.

### 2c. MIDI Message Parser

- [x] T010 [P] Write `tests/unit/MidiMessageParser.test.ts` — unit tests for
      `parseMidiMessage(Uint8Array, timestamp)`:
  - `[0x90, 60, 100]` → `{ type: 'noteOn', channel: 1, data1: 60, data2: 100 }`
  - `[0x80, 60, 0]` → `{ type: 'noteOff', channel: 1, data1: 60, data2: 0 }`
  - `[0x90, 60, 0]` → `{ type: 'noteOff', channel: 1, ... }` (velocity-0 Note On = Note Off)
  - `[0x99, 36, 80]` → `{ type: 'noteOn', channel: 10, data1: 36, data2: 80 }`
  - `[0xB0, 7, 100]` → `{ type: 'controlChange', channel: 1, data1: 7, data2: 100 }`
  - `[0xF8]` → `{ type: 'clock', channel: 0, data1: 0, data2: 0 }`
  - `[0xF0, 0x41, 0xF7]` → `{ type: 'sysex', channel: 0 }`
  - Verify tests FAIL before T011 is implemented
- [x] T011 Create `src/midi/MidiMessageParser.ts` — implement `parseMidiMessage(data: Uint8Array,
timestamp: number): MidiMessage`. Handle all message types. Treat velocity-0 Note On as
      Note Off. Bounds-check all byte accesses.
      Run `npm run test:ci` — T010 tests MUST pass.

### 2d. MIDI Access Wrapper

- [x] T012 [P] Write `tests/unit/MidiAccess.test.ts` — unit tests for `MidiAccessService`:
  - `listDevices()` returns array of `MidiDeviceInfo` from mock inputs
  - `subscribe(deviceId, callback)` registers `onmidimessage` on the correct `MIDIInput`
  - Callback receives parsed `MidiMessage` when `onmidimessage` fires with raw bytes
  - `subscribe()` returns an unsubscribe function that removes the listener
  - Calling unsubscribe removes only the one listener (other subscriptions on same device survive)
  - `onDeviceStateChange(cb)` fires `cb` when `MIDIAccess.onstatechange` fires
  - Verify tests FAIL before T013 is implemented
- [x] T013 Create `src/midi/MidiAccess.ts` — implement `MidiAccessService` class wrapping
      `navigator.requestMIDIAccess()`. Methods: `init()`, `listDevices()`,
      `subscribe(deviceId, callback)` (returns unsubscribe fn), `onDeviceStateChange(cb)`.
      Uses `MidiMessageParser` internally. Exposes `MidiAccessInterface` for DI.
      Run `npm run test:ci` — T012 tests MUST pass.

### 2e. Audio Engine

- [x] T014 [P] Write `tests/unit/AudioEngine.test.ts` — unit tests with mocked `AudioContext`:
  - `playNote(noteNumber, velocity)` creates an `OscillatorNode` + `GainNode`, calls `start()`
  - Frequency for note 60 is `~261.63Hz`; note 69 is `440Hz`
  - Gain for velocity 127 is `1.0`; velocity 64 is `~0.504`
  - `stopNote(noteNumber)` schedules gain ramp to 0 and calls `stop()`
  - `playDrum(noteNumber, velocity)` does not throw for notes 35–81
  - `playDrum(36, 100)` (kick) creates an oscillator with starting frequency ~150Hz
  - Verify tests FAIL before T015 is implemented
- [x] T015 Create `src/midi/AudioEngine.ts` — implement `AudioEngine` class. Constructor accepts
      optional `AudioContext` for DI. Methods: `playNote(noteNumber, velocity)`,
      `stopNote(noteNumber)`, `playDrum(noteNumber, velocity)`, `resumeContext()`.
      Note synthesis: triangle wave oscillator. Drum synthesis: kick=sine sweep, snare=noise+tone,
      hi-hat=noise burst, cymbal=metallic noise, generic=noise burst.
      Store `pendingResume: boolean` flag when AudioContext is suspended. Full spec in `research.md` §5.

**Checkpoint**: Run `npm run test:ci` — all Phase 2 tests pass. Foundation ready.

---

## Phase 3: User Story 1 — Raw MIDI Message Monitor (Priority: P1) 🎯 MVP

**Goal**: Device selector + 3-mode selector in query editor; raw MIDI messages stream into a
Table panel as a time-series DataFrame.

**Independent Test**: Open a Table panel with MIDI datasource, select a device, select Raw mode,
play notes — rows appear with timestamp, type, channel, data1, data2, raw hex.

### Tests for US1 ⚠️ Write BEFORE implementation; verify they FAIL first

- [x] T016 [P] [US1] Write `tests/unit/MidiDataSource.test.ts` — unit tests for foundational
      DataSource behaviour:
  - `filterQuery({ deviceId: '' })` → `false`
  - `filterQuery({ deviceId: 'dev-1', mode: 'raw' })` → `true`
  - `testDatasource()` → `{ status: 'success' }` when `navigator.requestMIDIAccess` resolves
  - `testDatasource()` → `{ status: 'error', message: contains 'Chrome or Edge' }` when
    `navigator.requestMIDIAccess` is `undefined`
  - `getDefaultQuery()` → matches `DEFAULT_QUERY` from `src/types.ts`
  - `query()` in raw mode emits initial empty DataFrame immediately on subscribe
  - `query()` in raw mode emits a DataFrame with one row when a MIDI message fires
  - Rolling buffer caps at 1000 rows (send 1001 messages, assert 1000 rows)
  - Verify tests FAIL before T021 is implemented
- [x] T017 [P] [US1] Write `tests/e2e/query-editor.spec.ts` — E2E tests:
  - Device selector renders with label "MIDI Device"
  - Selector shows mock device names from `window.__midiMock`
  - Mode selector renders with exactly 3 options: Raw messages, Notes, Drums
  - Selecting a device calls `onRunQuery` (panel refreshes)
  - No-device state shows info `Alert` with "Select a MIDI device"
  - Verify tests FAIL before T023 is implemented
- [x] T018 [P] [US1] Write `tests/e2e/raw-messages.spec.ts` — E2E tests:
  - After selecting device + Raw mode, firing a Note On via `__midiMock.fireMessage` causes
    a new row in the Table panel within 2 seconds
  - Row contains correct values: Type="Note On", Channel=1, Data1=60, Data2=100
  - After 1001 messages, table has exactly 1000 rows
  - Verify tests FAIL before T021–T022 are implemented

### Implementation for US1

- [x] T019 [P] [US1] Rewrite `src/types.ts` — `MidiQueryMode = 'raw' | 'notes' | 'drums'`
      (no `'timeline'`); add `format: 'long' | 'wide'` to `MidiQuery`; update `DEFAULT_QUERY`
      (include `format: 'long'`); include `MidiMessage`, `MidiDeviceInfo`, `NoteEvent`, `DrumHit`
      interfaces. Exact definitions from updated `data-model.md`.
- [x] T020 [P] [US1] Simplify `src/components/ConfigEditor.tsx` — render a single `<p>`
      explaining MIDI requires no configuration. Keep component signature compatible with
      `DataSourcePluginOptionsEditorProps<MidiDataSourceOptions>`.
- [x] T021 [US1] Rewrite `src/datasource.ts` as `MidiDataSource` — implements
      `DataSourceApi<MidiQuery, MidiDataSourceOptions>`. Constructor: instantiates
      `MidiAccessService` and `AudioEngine`. Implement: `testDatasource()`, `getDefaultQuery()`,
      `filterQuery()`, `listDevices()`, `onDeviceStateChange()`. Implement `query()` returning
      `Observable<DataQueryResponse>` for raw mode only (notes/drums return empty DataFrame for now).
      Full contract in `contracts/datasource-api.md`.
- [x] T022 [US1] Implement raw-mode DataFrame builder in `src/datasource.ts` — maintain
      `rawBuffers: Map<string, MidiMessage[]>` per deviceId; cap at 1000 rows newest-first;
      build time-series DataFrame with fields
      `[Timestamp(time), Type(string), Channel(number), Data1(number), Data2(number), Raw(string)]`.
- [x] T023 [US1] Rewrite `src/components/QueryEditor.tsx` — device selector (`Select` with async
      options from `datasource.listDevices()`); mode selector (`Select` with 3 static options:
      Raw messages, Notes, Drums). Call `onChange` + `onRunQuery` on each change. Show `Alert`
      when no device selected. Refresh device list on `onDeviceStateChange`.
      Reference: `contracts/query-editor.md`.
- [x] T024 [P] [US1] Update `src/module.ts` — replace scaffold imports with `MidiQuery`,
      `MidiDataSourceOptions`, `MidiDataSource`.
- [x] T025 [US1] Run `npm run lint && npm run typecheck` — resolve all errors.
      Run `npm run test:ci` — T016 unit tests MUST pass.
      Run `npm run e2e` — T017+T018 MUST pass.

**Checkpoint**: US1 independently functional. Build and verify in Grafana: Table panel, device
selector, Raw mode, live rows.

---

## Phase 4: User Story 2 — Notes Mode with Sound and Timeline (Priority: P2)

**Goal**: Notes mode streams note on/off events as a time-series DataFrame (State Timeline-
compatible). Sound plays on Note On. Long/wide format toggle and optional note range filter.

**Independent Test**: Select Notes mode (long format); play and hold a chord — events stream with
`Velocity` set on Note On and `null` on Note Off. Configure a State Timeline panel with
"Partition by values" on NoteName to see piano-roll bars. Audio plays on Note On.

### Tests for US2 ⚠️ Write BEFORE implementation; verify they FAIL first

- [x] T026 [P] [US2] Add notes-mode tests to `tests/unit/MidiDataSource.test.ts`:
  - Notes mode (long format) emits empty DataFrame on subscribe
  - After Note On (note 60, vel 100): one row
    `{Time:t, NoteNumber:60, NoteName:'C4', Velocity:100}`
  - After Note Off (note 60): new row appended
    `{Time:t2, NoteNumber:60, NoteName:'C4', Velocity:null}`
  - Velocity-0 Note On treated as Note Off (null-velocity row appended)
  - Chord: three Note Ons → three accumulated rows with non-null velocity
  - Notes mode (wide format): one column per distinct NoteName seen; column value = Velocity|null
  - `noteRangeAuto=false`: note outside [noteRangeMin, noteRangeMax] NOT emitted
  - `noteRangeAuto=true`: all notes emitted regardless of range
  - Verify tests FAIL before T029 is implemented
- [x] T027 [P] [US2] Add AudioEngine notes tests to `tests/unit/AudioEngine.test.ts`:
  - `playNote` is called when notes-mode query receives a Note On
  - `stopNote` is called when notes-mode query receives a Note Off
  - Verify tests FAIL before T031 is implemented
- [x] T028 [P] [US2] Write `tests/e2e/notes.spec.ts` — E2E tests:
  - Select Notes mode; fire Note On note 60 → row with NoteName="C4", Velocity=100 appears
  - Fire Note Off note 60 → new row with Velocity=null appears
  - Fire two Note Ons simultaneously → two accumulated rows with non-null velocity
  - Verify tests FAIL before T029–T032 are implemented

### Implementation for US2

- [x] T029 [US2] Implement notes-mode event streaming in `src/datasource.ts` — maintain
      `noteEvents: Map<string, NoteEvent[]>` per deviceId. On Note On (vel > 0): append
      `{timestamp, noteNumber, noteName, velocity}`. On Note Off or velocity-0 Note On: append
      `{timestamp, noteNumber, noteName, velocity: null}`. Filter by note range when
      `noteRangeAuto=false`. Re-emit full accumulated event list on each new event.
      Long format schema: `[Time(time), NoteNumber(number), NoteName(string), Velocity(number|null)]`.
- [x] T030 [US2] Implement wide-format builder for notes in `src/datasource.ts` — when
      `query.format === 'wide'`, emit a time-series DataFrame where each distinct `NoteName`
      encountered is a separate field with its current `Velocity|null` and a `Time` field.
      Update on every new note event.
- [x] T031 [US2] Wire `AudioEngine` into `query()` notes-mode handler in `src/datasource.ts` —
      call `audioEngine.playNote(msg.data1, msg.data2)` on Note On;
      call `audioEngine.stopNote(msg.data1)` on Note Off.
- [x] T032 [US2] Add notes-mode controls to `src/components/QueryEditor.tsx` — show when
      `query.mode === 'notes'`:
      (a) `Select` format toggle `[{ label: 'Long', value: 'long' }, { label: 'Wide', value: 'wide' }]`
      (b) `Switch` for `noteRangeAuto`; `Input` fields for `noteRangeMin` / `noteRangeMax`
      (hidden when auto is on).
      Call `onChange` + `onRunQuery` on each change.
- [x] T033 [US2] Run `npm run lint && npm run typecheck && npm run test:ci` — T026+T027 MUST pass.
      Run `npm run e2e` — T028 MUST pass.

**Checkpoint**: US2 independently functional. Manual verification: State Timeline panel with
"Partition by values" on NoteName shows piano-roll bars. Audio plays and fades correctly.

---

## Phase 5: User Story 3 — Drums Mode with Sound (Priority: P3)

**Goal**: Drums mode filters channel-10 MIDI events and streams them as a time-series DataFrame.
Drum sounds play on Note On. Long/wide format toggle. State driven entirely by MIDI input.

**Independent Test**: Select Drums mode; send Note On ch10 note 36 → row with
DrumName="Bass Drum 1", Velocity=80; send Note Off → row with Velocity=null. Sound plays on hit.

### Tests for US3 ⚠️ Write BEFORE implementation; verify they FAIL first

- [x] T034 [P] [US3] Add drums-mode tests to `tests/unit/MidiDataSource.test.ts`:
  - Drums mode (long format) emits empty DataFrame on subscribe
  - After Note On ch10 note 36: row
    `{Time:t, NoteNumber:36, DrumName:'Bass Drum 1', Velocity:80}`
  - After Note Off ch10 note 36: new row
    `{Time:t2, NoteNumber:36, DrumName:'Bass Drum 1', Velocity:null}`
  - Note On ch10 note 200 (unknown): row with `DrumName='Unknown Drum (note 200)'`
  - Note On ch1 note 36 (not channel 10): NOT emitted
  - Drums mode (wide format): one column per DrumName, value = Velocity|null
  - Verify tests FAIL before T037 is implemented
- [x] T035 [P] [US3] Add drums AudioEngine tests to `tests/unit/AudioEngine.test.ts`:
  - `playDrum(36, 100)` creates an oscillator (kick synthesis, starts ~150Hz)
  - `playDrum(42, 80)` does not throw (hi-hat closed)
  - `playDrum(99, 50)` does not throw (unknown drum, generic noise)
  - Verify tests FAIL before T039 is implemented
- [x] T036 [P] [US3] Write `tests/e2e/drums.spec.ts` — E2E tests:
  - Select Drums mode; fire Note On ch10 note 36 → row "Bass Drum 1" Velocity=80 appears
  - Fire Note Off ch10 note 36 → new row with Velocity=null appears
  - Unknown note 200 on ch10 → row "Unknown Drum (note 200)" appears
  - Verify tests FAIL before T037–T040 are implemented

### Implementation for US3

- [x] T037 [US3] Implement drums-mode event streaming in `src/datasource.ts` — filter incoming
      messages to channel 10 only. On Note On ch10: look up `GM1_DRUM_MAP[noteNumber]` (or
      generate `"Unknown Drum (note NNN)"`); append `{timestamp, noteNumber, drumName, velocity}`.
      On Note Off ch10: append `{timestamp, noteNumber, drumName, velocity: null}`.
      Long format schema: `[Time(time), NoteNumber(number), DrumName(string), Velocity(number|null)]`.
      Re-emit full accumulated event list on each new event.
- [x] T038 [US3] Implement wide-format builder for drums in `src/datasource.ts` — when
      `query.format === 'wide'`, emit a time-series DataFrame where each distinct `DrumName`
      encountered is a separate field with its current `Velocity|null` and a `Time` field.
- [x] T039 [US3] Wire `AudioEngine` into `query()` drums-mode handler in `src/datasource.ts` —
      call `audioEngine.playDrum(msg.data1, msg.data2)` on Note On channel 10.
- [x] T040 [US3] Extend format toggle in `src/components/QueryEditor.tsx` to show when
      `query.mode === 'drums'` (same Long/Wide `Select` as Notes mode).
      Call `onChange` + `onRunQuery` on change.
- [x] T041 [US3] Run `npm run lint && npm run typecheck && npm run test:ci` — T034+T035 MUST pass.
      Run `npm run e2e` — T036 MUST pass.

**Checkpoint**: US3 independently functional. Manual verification: drum hits stream correctly;
audio plays correctly (kick, snare, hi-hat, cymbal).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, audio UX, device reconnection handling, and full verification.

- [x] T042 Add audio-blocked `Alert` to `src/components/QueryEditor.tsx` — when `AudioEngine`
      has `pendingResume=true`, render `Alert` with `severity="info"` text
      "Click here to enable audio" and an `onClick` handler calling `audioEngine.resumeContext()`.
- [x] T043 [P] Add device-disconnected handling to `src/datasource.ts` — when
      `MIDIAccess.onstatechange` fires with a disconnected device, call all registered
      `onDeviceStateChange` listeners so `QueryEditor` shows the disconnected `Alert`.
- [x] T044 [P] Run complete validation:
      `npm run lint && npm run typecheck && npm run test:ci && npm run build` — all MUST exit 0.

### Clarification 2026-04-23: Channel routing for audio and drums mode

- [x] T048 [P] Add unit tests to `tests/unit/MidiDataSource.test.ts` for new channel-routing behaviour:
  - Notes mode + ch10 Note On → `audioEngine.playDrum` called (not `playNote`)
  - Notes mode + ch10 Note Off → neither `stopNote` nor `playDrum` called
  - Notes mode + ch1 Note On → `audioEngine.playNote` called (unchanged)
  - Drums mode + ch1 Note On (note 36) → DrumEvent appended and `audioEngine.playDrum` called
  - Drums mode + ch5 Note On (note 42) → DrumEvent appended
  - Verify tests FAIL before T049 is implemented
- [x] T049 Update `src/datasource.ts` — implement spec clarifications:
  - In `query()` audio handler: when `mode === 'notes'` and `msg.channel === GM1_DRUM_CHANNEL`,
    call `playDrum` on Note On (not `playNote`); for all other channels keep existing `playNote`/`stopNote`
  - In `query()` audio handler: when `mode === 'drums'`, remove `&& msg.channel === GM1_DRUM_CHANNEL`
    guard — play drum sound for Note On on any channel
  - In `handleDrums()`: remove `if (msg.channel !== GM1_DRUM_CHANNEL) return` guard — all channels
    feed the drums DataFrame
- [x] T050 [P] Run `npm run lint && npm run typecheck && npm run test:ci` — all MUST exit 0.

### Clarification 2026-04-23: Wide format ordering, pre-population, range slider

- [ ] T051 [P] Update unit tests in `tests/unit/MidiDataSource.test.ts`:
  - Remove `noteRangeAuto=true` test (feature removed)
  - Update range filter test: remove `noteRangeAuto` from `makeQuery` call
  - Update wide format ordering test: now descending (E4 index < C4 index)
  - Add test: Notes wide format pre-populates all columns in range on initial subscribe
  - Add test: Drums wide format pre-populates 6-piece preset on initial subscribe
  - Verify tests FAIL before T052–T054 are implemented
- [ ] T052 Update `src/types.ts` — remove `noteRangeAuto: boolean` from `MidiQuery`; remove
      from `DEFAULT_QUERY`; update comments on `noteRangeMin`/`noteRangeMax`.
- [ ] T053 Update `src/datasource.ts`:
  - `handleNotes()`: remove `noteRangeAuto` check; always filter by [noteRangeMin, noteRangeMax]
  - `buildDataFrame()`: pass `noteRangeMin`/`noteRangeMax` to `buildNotesWideFrame`
  - `buildNotesWideFrame(deviceId, refId, noteRangeMin, noteRangeMax)`: pre-populate ALL notes
    from noteRangeMax down to noteRangeMin (descending); carry forward velocity from events
  - `buildDrumsWideFrame()`: pre-populate 6-piece preset (51→49→46→42→38→36) with null velocity;
    append any non-preset drums seen in events (descending by note number) after preset
- [ ] T054 Update `src/components/QueryEditor.tsx`:
  - Add `RangeSlider` to `@grafana/ui` import
  - Remove `Switch` from import (no longer needed)
  - Remove `handleNoteRangeAutoChange`, `handleNoteRangeMinChange`, `handleNoteRangeMaxChange`
  - Add `handleNoteRangeChange = (values: number[]) => onChange({ ...query, noteRangeMin: values[0], noteRangeMax: values[1] })`
  - Replace the `Switch` + two `Input` block with a single `RangeSlider` (min=0, max=127, step=1)
- [ ] T055 [P] Run `npm run lint && npm run typecheck && npm run test:ci` — all MUST exit 0.

- [ ] T045 Run `npm run e2e` — all E2E tests (T017+T018+T028+T036) MUST pass.
- [ ] T046 [P] Run `grafana-verifier` against `http://localhost:3000` and verify all three query
      modes render correctly:
      Raw (Table panel), Notes (State Timeline + "Partition by values" on NoteName),
      Drums (State Timeline or Table). Attach screenshots to PR description.
- [ ] T047 Complete manual testing checklist from `quickstart.md` §Manual Testing with a
      physical MIDI keyboard. Document results in PR description. All checklist items must be checked.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks ALL user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 3 completion (needs MidiDataSource + AudioEngine)
- **US3 (Phase 5)**: Depends on Phase 3 completion (can run fully in parallel with US2)
- **Polish (Phase 6)**: Depends on US1–US3 complete

### Parallel Opportunities

**Phase 2** parallel sets:

```
Set A (infrastructure): T006, T007 (different files)
Set B (tests): T008, T010, T012, T014 (different files, all depend on T006)
Set C (impls): T009, T011, T013, T015 (each depends only on its own test set)
```

**Phase 3** parallel sets:

```
Set A (tests):  T016, T017, T018 (different files)
Set B (impl):   T019, T020, T024 (different files, no cross-deps)
T021 → T022 → T023 (sequential within datasource.ts and QueryEditor)
```

**Phase 4 + 5** parallel (after Phase 3):

```
US2: T026, T027, T028 (tests) → T029, T030, T031 (impl) → T032 (QE) → T033
US3: T034, T035, T036 (tests) → T037, T038, T039 (impl) → T040 (QE) → T041
(US2 and US3 fully independent — different state maps and event streams)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T015) — all tests passing
3. Complete Phase 3: US1 (T016–T025)
4. **STOP and VALIDATE**: Confirm raw message table works in Grafana with a real MIDI device
5. Demonstrate: device dropdown, 3-mode selector, live table rows in Raw mode

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → US1 (raw table): Table panel shows live MIDI messages
3. Phase 4 → US2 (notes + sound): Note event stream → piano-roll via State Timeline + audio
4. Phase 5 → US3 (drums + sound): Drum event stream + audio
5. Phase 6 → Polish + full verification

### Parallel Team Strategy

With two developers after Phase 3:

- Developer A: US2 (Phase 4) — notes event streaming, long/wide format, audio wiring
- Developer B: US3 (Phase 5) — drums event streaming, long/wide format, audio wiring

---

## Notes

- [P] tasks = different files, no incomplete dependencies — safe to run in parallel
- [Story] label maps each task to a user story for traceability
- TDD is mandatory per Constitution Principle II — MUST see tests fail before implementing
- **Timeline is NOT a mode**: Notes mode emits State Timeline-compatible time-series data;
  configure a State Timeline panel with "Partition by values" on `NoteName` for piano-roll view
- **No drum decay timer**: Drums mode responds to actual MIDI Note Off; `Velocity = null`
  after Note Off, exactly like Notes mode
- **Long/Wide format toggle**: applies to Notes and Drums modes; Raw mode always uses long format
- **Wide format stateful**: each emitted row carries current velocity for ALL known notes/drums;
  active notes keep their last velocity until Note Off (null); multiple notes visible in same row
- **Wide format column order**: sorted by ascending MIDI note number (C-1=0 → G9=127 for Notes;
  note 35 → 81 for Drums); order is independent of which notes were played first
- **Channel 10 audio routing**: in Notes mode, channel 10 Note On → `playDrum()` (not `playNote()`);
  pitched audio only plays for non-channel-10 notes
- **Drums mode channel scope**: all 16 MIDI channels accepted; channel 10 is not a filter
- Sound playback (US2, US3) requires a physical MIDI device for latency testing (SC-002/SC-003)
