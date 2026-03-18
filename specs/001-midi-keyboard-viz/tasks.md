---
description: 'Task list for MIDI Keyboard Datasource Plugin'
---

# Tasks: MIDI Keyboard Datasource Plugin

**Input**: Design documents from `/specs/001-midi-keyboard-viz/`
**Prerequisites**: plan.md ✅ spec.md ✅ data-model.md ✅ research.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: TDD is MANDATORY per constitution Principle II. Test tasks appear before each
implementation block and MUST be observed failing before the corresponding implementation begins.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to
- All file paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Install new dependency, create directory structure, provision datasource for E2E.

- [ ] T001 Install `web-midi-test` dev dependency: `npm install --save-dev web-midi-test`
- [ ] T002 [P] Create source directories: `mkdir -p src/midi`
- [ ] T003 [P] Create test directories: `mkdir -p tests/__mocks__ tests/unit tests/e2e/fixtures provisioning/datasources`
- [ ] T004 [P] Create `provisioning/datasources/midi.yml` — provisioned MIDI datasource for E2E tests:
  ```yaml
  apiVersion: 1
  datasources:
    - name: MIDI
      type: tskarhed-midi-datasource
      access: proxy
      isDefault: false
  ```

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure-logic modules and test infrastructure that ALL user stories depend on.
No user story implementation may begin until this phase is complete.

**⚠️ CRITICAL**: Complete all tests in this phase before writing implementation code (TDD).

### 2a. Test Infrastructure

- [ ] T005 [P] Create `tests/__mocks__/web-midi-api.ts` — Jest global setup that installs
      `web-midi-test` on `navigator`. Must export `beforeEach`/`afterEach` hooks setting
      `WMT.midi = true` and calling `WMT.reset()`. Reference: `research.md` §7.
- [ ] T006 [P] Create `tests/e2e/fixtures/midi-mock.ts` — Playwright `injectMidiMock(page)`
      function that calls `page.addInitScript()` to override `navigator.requestMIDIAccess` with a
      fake implementation exposing `window.__midiMock.addInput(id, name)` and
      `window.__midiMock.fireMessage(deviceId, dataBytes[])`. Reference: `research.md` §7.

### 2b. Constants (write tests first)

- [ ] T007 [P] Write `tests/unit/constants.test.ts` — unit tests for:
  - `formatNoteName(60)` → `'C4'`; `formatNoteName(69)` → `'A4'`; `formatNoteName(0)` → `'C-1'`
  - `noteToFrequency(69)` → `440` (±0.001); `noteToFrequency(57)` → `220` (±0.001)
  - `GM1_DRUM_MAP[36]` → `'Bass Drum 1'`; `GM1_DRUM_MAP[42]` → `'Closed Hi-Hat'`
  - All 47 entries of `GM1_DRUM_MAP` are present (keys 35–81)
  - `GM1_DRUM_CHANNEL` → `10`; `GM1_DRUM_NOTE_MIN` → `35`; `GM1_DRUM_NOTE_MAX` → `81`
  - Verify tests FAIL before T008 is implemented
- [ ] T008 Create `src/constants.ts` — implement `GM1_DRUM_MAP`, `GM1_DRUM_CHANNEL`,
      `GM1_DRUM_NOTE_MIN/MAX`, `NOTE_NAMES`, `formatNoteName(noteNumber)`,
      `noteToFrequency(noteNumber)`. Exact values from `data-model.md` §Constants.
      Run `npm run test:ci` — T007 tests MUST pass.

### 2c. MIDI Message Parser (write tests first)

- [ ] T009 [P] Write `tests/unit/MidiMessageParser.test.ts` — unit tests for
      `parseMidiMessage(Uint8Array, timestamp)`:
  - `[0x90, 60, 100]` → `{ type: 'noteOn', channel: 1, data1: 60, data2: 100 }`
  - `[0x80, 60, 0]` → `{ type: 'noteOff', channel: 1, data1: 60, data2: 0 }`
  - `[0x90, 60, 0]` → `{ type: 'noteOff', channel: 1, ... }` (velocity-0 Note On = Note Off)
  - `[0x99, 36, 80]` → `{ type: 'noteOn', channel: 10, data1: 36, data2: 80 }`
  - `[0xB0, 7, 100]` → `{ type: 'controlChange', channel: 1, data1: 7, data2: 100 }`
  - `[0xC0, 0]` → `{ type: 'programChange', channel: 1, data1: 0, data2: 0 }`
  - `[0xF8]` → `{ type: 'clock', channel: 0, data1: 0, data2: 0 }`
  - `[0xF0, 0x41, 0xF7]` → `{ type: 'sysex', channel: 0 }`
  - Verify tests FAIL before T010 is implemented
- [ ] T010 Create `src/midi/MidiMessageParser.ts` — implement `parseMidiMessage(data: Uint8Array,
timestamp: number): MidiMessage`. Handle all message types from `data-model.md` §MidiMessageType.
      Treat velocity-0 Note On as Note Off. Bounds-check all byte accesses.
      Run `npm run test:ci` — T009 tests MUST pass.

### 2d. MIDI Access Wrapper (write tests first)

- [ ] T011 [P] Write `tests/unit/MidiAccess.test.ts` — unit tests for `MidiAccessService`:
  - `listDevices()` returns array of `MidiDeviceInfo` from mock inputs
  - `subscribe(deviceId, callback)` registers `onmidimessage` on the correct `MIDIInput`
  - Callback receives parsed `MidiMessage` when `onmidimessage` fires with raw bytes
  - `subscribe()` returns an unsubscribe function that removes the listener
  - Calling unsubscribe removes only the one listener (other subscriptions on same device survive)
  - `onDeviceStateChange(cb)` fires `cb` when `MIDIAccess.onstatechange` fires
  - Verify tests FAIL before T012 is implemented
- [ ] T012 Create `src/midi/MidiAccess.ts` — implement `MidiAccessService` class that wraps
      `navigator.requestMIDIAccess()`. Methods: `init()`, `listDevices()`, `subscribe(deviceId,
callback)` (returns unsubscribe fn), `onDeviceStateChange(cb)`. Uses `MidiMessageParser`
      internally. Exposes `MidiAccessInterface` for DI (see `contracts/datasource-api.md`).
      Run `npm run test:ci` — T011 tests MUST pass.

### 2e. Audio Engine (write tests first)

- [ ] T013 [P] Write `tests/unit/AudioEngine.test.ts` — unit tests with mocked `AudioContext`:
  - `playNote(noteNumber, velocity)` creates an `OscillatorNode` + `GainNode`, calls `start()`
  - Frequency for note 60 is `~261.63Hz` (middle C); note 69 is `440Hz`
  - Gain for velocity 127 is `1.0`; velocity 64 is `~0.504`
  - `stopNote(noteNumber)` schedules gain ramp to 0 and calls `stop()`
  - `playDrum(noteNumber, velocity)` is called without throwing for notes 35–81
  - `playDrum(36, 100)` (kick) creates an oscillator with starting frequency ~150Hz
  - Verify tests FAIL before T014 is implemented
- [ ] T014 Create `src/midi/AudioEngine.ts` — implement `AudioEngine` class. Constructor accepts
      optional `AudioContext` for DI. Methods: `playNote(noteNumber, velocity)`, `stopNote(noteNumber)`,
      `playDrum(noteNumber, velocity)`. Note synthesis: triangle wave oscillator.
      Drum synthesis: kick=sine sweep, snare=noise+tone, hi-hat=noise burst, cymbal=metallic noise,
      generic=noise burst. Handle `AudioContext.state === 'suspended'` by storing a
      `pendingResume: boolean` flag. Full spec in `research.md` §5.

**Checkpoint**: Run `npm run test:ci` — all Phase 2 tests (T007, T009, T011, T013 groups) pass.
Foundation is ready. User story phases may now begin.

---

## Phase 3: User Story 1 — Raw MIDI Message Monitor (Priority: P1) 🎯 MVP

**Goal**: Device selector + mode selector in query editor; raw MIDI messages stream into a Table panel.

**Independent Test**: Open a Table panel with MIDI datasource, select a device, play notes —
rows appear with timestamp, type, channel, data1, data2, raw hex.

### Tests for US1 ⚠️ Write BEFORE implementation; verify they FAIL first

- [ ] T015 [P] [US1] Write `tests/unit/MidiDataSource.test.ts` — unit tests for foundational
      DataSource behaviour (all modes share this):
  - `filterQuery({ deviceId: '' })` → `false`
  - `filterQuery({ deviceId: 'dev-1', mode: 'raw' })` → `true`
  - `testDatasource()` → `{ status: 'success' }` when `navigator.requestMIDIAccess` resolves
  - `testDatasource()` → `{ status: 'error', message: contains 'Chrome or Edge' }` when
    `navigator.requestMIDIAccess` is `undefined`
  - `getDefaultQuery()` → matches `DEFAULT_QUERY` from `src/types.ts`
  - `query()` in raw mode emits initial empty DataFrame immediately on subscribe
  - `query()` in raw mode emits a DataFrame with one row when a MIDI message fires
  - Rolling buffer caps at 1000 rows (send 1001 messages, assert 1000 rows)
  - Verify tests FAIL before T022 is implemented
- [ ] T016 [P] [US1] Write `tests/e2e/query-editor.spec.ts` — E2E tests (with MIDI mock):
  - Device selector renders with label "MIDI Device"
  - Selector shows mock device names from `window.__midiMock`
  - Mode selector renders with options: Raw messages, Notes, Timeline, Drums
  - Selecting a device calls `onRunQuery` (panel refreshes)
  - No-device state shows info `Alert` with "Select a MIDI device"
  - Verify tests FAIL before T023 is implemented
- [ ] T017 [P] [US1] Write `tests/e2e/raw-messages.spec.ts` — E2E tests:
  - After selecting device + Raw mode, firing a Note On via `__midiMock.fireMessage` causes
    a new row in the Table panel within 2 seconds
  - Row contains correct values for Type="Note On", Channel=1, Data1=60, Data2=100
  - After 1001 messages, table has exactly 1000 rows
  - Verify tests FAIL before T023–T025 are implemented

### Implementation for US1

- [ ] T018 [P] [US1] Rewrite `src/types.ts` — replace scaffold content with `MidiQuery`,
      `MidiQueryMode`, `MidiDataSourceOptions`, `DEFAULT_QUERY`, `MidiMessage`, `MidiDeviceInfo`,
      `ActiveNote`, `NoteEvent`, `DrumHit` interfaces. Exact definitions from `data-model.md`.
- [ ] T019 [P] [US1] Simplify `src/components/ConfigEditor.tsx` — remove API key / path fields.
      Render a single `<p>` explaining that MIDI requires no configuration. Keep the component
      signature compatible with `DataSourcePluginOptionsEditorProps<MidiDataSourceOptions>`.
- [ ] T020 [US1] Rewrite `src/datasource.ts` as `MidiDataSource` — implements
      `DataSourceApi<MidiQuery, MidiDataSourceOptions>`. Constructor: instantiates `MidiAccessService`
      and `AudioEngine`; does NOT call any HTTP. Implement: `testDatasource()` (checks
      `navigator.requestMIDIAccess`), `getDefaultQuery()`, `filterQuery()`, `listDevices()`,
      `onDeviceStateChange()`. Implement `query()` returning `Observable<DataQueryResponse>` for raw
      mode only at this stage (notes/timeline/drums modes return empty DataFrame).
      Full contract in `contracts/datasource-api.md`.
- [ ] T021 [US1] Implement raw-mode DataFrame builder in `src/datasource.ts` — maintain
      `rawBuffers: Map<string, MidiMessage[]>` per deviceId; cap at 1000 rows newest-first;
      build DataFrame with fields `[Timestamp(time), Type(string), Channel(number), Data1(number),
Data2(number), Raw(string)]`. Exact schema from `data-model.md` §Raw Mode.
- [ ] T022 [US1] Rewrite `src/components/QueryEditor.tsx` — implement device selector (`Select`
      with async options from `datasource.listDevices()`) and mode selector (`Select` with static
      options). Call `onChange` + `onRunQuery` on each change. Show `Alert` when no device selected.
      Refresh device list on `onDeviceStateChange`. Full contract in `contracts/query-editor.md`.
- [ ] T023 [P] [US1] Update `src/module.ts` — replace `MyQuery/MyDataSourceOptions` imports with
      `MidiQuery/MidiDataSourceOptions`; replace `DataSource` import with `MidiDataSource`.
- [ ] T024 [US1] Run `npm run lint && npm run typecheck` — resolve all errors. Run
      `npm run test:ci` — T015 unit tests MUST pass. Run `npm run e2e` — T016+T017 tests MUST pass.

**Checkpoint**: US1 is independently functional. Build and verify in Grafana: add Table panel,
select MIDI device, play notes, confirm rows appear. Run `grafana-verifier` to confirm rendering.

---

## Phase 4: User Story 2 — Real-Time Note Visualization with Sound (Priority: P2)

**Goal**: Notes mode shows active notes table with velocity; sound plays on Note On.

**Independent Test**: Select Notes mode, play and hold a chord — rows appear for each held note
with velocity; sound plays; rows disappear on release.

### Tests for US2 ⚠️ Write BEFORE implementation; verify they FAIL first

- [ ] T025 [P] [US2] Add notes-mode tests to `tests/unit/MidiDataSource.test.ts`:
  - Notes mode query emits empty DataFrame when no notes held
  - After Note On (note 60, vel 100): DataFrame has one row `{NoteNumber:60, NoteName:'C4', Velocity:100}`
  - After Note Off (note 60): DataFrame is empty again
  - Velocity-0 Note On treated as Note Off (row disappears)
  - Chord: three simultaneous Note Ons → three rows
  - Verify tests FAIL before T027 is implemented
- [ ] T026 [P] [US2] Add AudioEngine note tests to `tests/unit/AudioEngine.test.ts`:
  - `playNote` is called when a notes-mode query receives a Note On
  - `stopNote` is called when a notes-mode query receives a Note Off
  - Verify tests FAIL before T028 is implemented
- [ ] T027 [P] [US2] Write `tests/e2e/notes.spec.ts` — E2E tests:
  - Select Notes mode; fire Note On 60 via mock → row appears with NoteName="C4"
  - Fire Note Off 60 → row disappears
  - Fire two Note Ons simultaneously → two rows visible
  - Verify tests FAIL before T029 is implemented

### Implementation for US2

- [ ] T028 [US2] Implement notes-mode state and DataFrame builder in `src/datasource.ts` —
      maintain `activeNotes: Map<string, Map<number, ActiveNote>>` per deviceId; handle Note On
      (add to map), Note Off or velocity-0 Note On (remove from map); build DataFrame with fields
      `[NoteNumber(number), NoteName(string), Velocity(number)]`. Use `formatNoteName` from
      `src/constants.ts`. Exact schema from `data-model.md` §Notes Mode.
- [ ] T029 [US2] Wire `AudioEngine` into `query()` notes-mode handler in `src/datasource.ts` —
      call `audioEngine.playNote(msg.data1, msg.data2)` on Note On; call
      `audioEngine.stopNote(msg.data1)` on Note Off. Import `AudioEngine` and instantiate once in
      constructor.
- [ ] T030 [US2] Run `npm run lint && npm run typecheck && npm run test:ci` — T025+T026 MUST pass.
      Run `npm run e2e` — T027 MUST pass.

**Checkpoint**: US2 independently functional. Manual testing required:
complete audio checklist from `quickstart.md` §Manual Testing (pitch accuracy, dynamics, chord
playback, note-off fade). Run `grafana-verifier` for visual confirmation.

---

## Phase 5: User Story 3 — Piano Timeline View (Priority: P3)

**Goal**: Timeline mode emits long-format event stream; with "Partition by values" transform,
State Timeline panel shows piano-roll bars colored by velocity.

**Independent Test**: Select Timeline mode, play a sequence of notes with varying hold durations
— emit a long-format DataFrame; apply "Partition by values" on NoteName in a State Timeline
panel; each note shows as a velocity-colored bar spanning its hold duration.

### Tests for US3 ⚠️ Write BEFORE implementation; verify they FAIL first

- [ ] T031 [P] [US3] Add timeline-mode tests to `tests/unit/MidiDataSource.test.ts`:
  - After Note On (note 60, vel 80): one row `{NoteNumber:60, NoteName:'C4', Velocity:80}`
  - After Note Off (note 60): second row appended `{NoteNumber:60, NoteName:'C4', Velocity:null}`
  - Two events accumulate; both present in next emission
  - Note outside [noteRangeMin, noteRangeMax] when `noteRangeAuto=false` → NOT emitted
  - Note outside range when `noteRangeAuto=true` → IS emitted; range expands
  - Verify tests FAIL before T034 is implemented
- [ ] T032 [P] [US3] Write `tests/e2e/timeline.spec.ts` — E2E tests:
  - Select Timeline mode; fire Note On + Note Off sequence → two rows appear in response
  - Rows have correct NoteNumber, NoteName, Velocity fields
  - Setting noteRangeMin=60, noteRangeMax=72: note 48 fires → not in response data
  - Verify tests FAIL before T035 is implemented

### Implementation for US3

- [ ] T033 [US3] Add note-range controls to `src/components/QueryEditor.tsx` — show
      note-range section only when `query.mode === 'timeline'`. Include: `Switch` for
      `noteRangeAuto`, two `Input` fields for `noteRangeMin` and `noteRangeMax` (hidden when auto
      is on). Call `onChange` + `onRunQuery` on each change. Reference: `contracts/query-editor.md`.
- [ ] T034 [US3] Implement timeline-mode state and DataFrame builder in `src/datasource.ts` —
      maintain `noteEvents: Map<string, NoteEvent[]>` per deviceId. On Note On: append
      `{timestamp, noteNumber, noteName, velocity}`. On Note Off (or velocity-0 Note On):
      append `{timestamp, noteNumber, noteName, velocity: null}`. Filter by note range when
      `noteRangeAuto=false`. Emit full accumulated event list on each new event.
      Schema: `[Time(time), NoteNumber(number), NoteName(string), Velocity(number|null)]`
      from `data-model.md` §Timeline Mode.
- [ ] T035 [US3] Run `npm run lint && npm run typecheck && npm run test:ci` — T031 MUST pass.
      Run `npm run e2e` — T032 MUST pass.

**Checkpoint**: US3 independently functional. Manual verification: set up a State Timeline
panel with "Partition by values" transformation on NoteName; play notes and confirm colored
bars span hold durations. Run `grafana-verifier` for visual confirmation.

---

## Phase 6: User Story 4 — Drum Visualization with Sound (Priority: P4)

**Goal**: Drums mode shows GM1 drum state table; drum sounds play on channel-10 Note On.

**Independent Test**: Select Drums mode; send Note On on channel 10, note 36 → "Bass Drum 1"
row shows `Active=true`; percussive sound plays; after 200ms `Active` returns to false.

### Tests for US4 ⚠️ Write BEFORE implementation; verify they FAIL first

- [ ] T036 [P] [US4] Add drums-mode tests to `tests/unit/MidiDataSource.test.ts`:
  - Initial emit contains 47 rows (one per GM1 drum piece), all `Active=false`, `Velocity=0`
  - After Note On ch10 note 36: row for "Bass Drum 1" has `Active=true`, `Velocity=80`
  - After 200ms (mock timer): "Bass Drum 1" row returns to `Active=false`
  - Note On ch10 note 200 (unknown): appended row with `DrumName='Unknown Drum (note 200)'`
  - Note On ch1 note 36 (not channel 10): does NOT update drum state
  - Verify tests FAIL before T039 is implemented
- [ ] T037 [P] [US4] Add drums AudioEngine tests to `tests/unit/AudioEngine.test.ts`:
  - `playDrum(36, 100)` creates an oscillator (kick synthesis — starts ~150Hz)
  - `playDrum(42, 80)` does not throw (hi-hat closed)
  - `playDrum(99, 50)` does not throw (unknown drum, generic noise)
  - Verify tests FAIL before T040 is implemented
- [ ] T038 [P] [US4] Write `tests/e2e/drums.spec.ts` — E2E tests:
  - Select Drums mode; fire Note On ch10 note 36 via mock → row "Bass Drum 1" Active=true
  - After 200ms: "Bass Drum 1" Active=false
  - Unknown note 200 on ch10 → row "Unknown Drum (note 200)" appears
  - Verify tests FAIL before T039–T041 are implemented

### Implementation for US4

- [ ] T039 [US4] Implement drums-mode state and DataFrame builder in `src/datasource.ts` —
      maintain `drumStates: Map<string, Map<number, DrumHit>>` per deviceId. On Note On
      channel 10: record hit, set decay timer (200ms, uses `setTimeout`); on timer fire emit updated
      state. Build DataFrame with ALL GM1 notes 35–81 as rows (47 total), plus any unknown notes
      encountered. Fields: `[NoteNumber(number), DrumName(string), Velocity(number), Active(boolean)]`.
      Exact schema from `data-model.md` §Drums Mode.
- [ ] T040 [US4] Implement drum synthesis in `src/midi/AudioEngine.ts` — complete
      `playDrum(noteNumber, velocity)` method with drum-specific synthesis for note categories:
      kick (35–36), snare (38,40), hi-hat-closed (42,44), hi-hat-open (46), cymbal (49,51,52,57,59),
      generic (all others). Full synthesis spec in `research.md` §5.
- [ ] T041 [US4] Wire `AudioEngine` into `query()` drums-mode handler in `src/datasource.ts` —
      call `audioEngine.playDrum(msg.data1, msg.data2)` on Note On channel 10.
- [ ] T042 [US4] Run `npm run lint && npm run typecheck && npm run test:ci` — T036+T037 MUST pass.
      Run `npm run e2e` — T038 MUST pass.

**Checkpoint**: US4 independently functional. Manual testing required: complete drums section
of audio checklist from `quickstart.md` (kick, snare, hi-hat, cymbal sound quality).
Run `grafana-verifier` for visual confirmation.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates, documentation, and verification across all user stories.

- [ ] T043 Add audio-blocked `Alert` to `src/components/QueryEditor.tsx` — when `AudioEngine`
      has `pendingResume=true` (context suspended), render an `Alert` with `severity="info"` and
      text "Click here to enable audio" with an `onClick` handler that calls
      `audioEngine.resumeContext()`.
- [ ] T044 [P] Add device-disconnected handling to `src/datasource.ts` — when
      `MIDIAccess.onstatechange` fires with a disconnected device, call all registered
      `onDeviceStateChange` listeners so `QueryEditor` can show the disconnected `Alert`.
- [ ] T045 [P] Implement `AudioEngine.resumeContext()` in `src/midi/AudioEngine.ts` —
      calls `audioContext.resume()` and clears `pendingResume` flag.
- [ ] T046 [P] Run complete validation: `npm run lint && npm run typecheck && npm run test:ci &&
npm run build` — all MUST exit 0. Fix any remaining errors.
- [ ] T047 Run `npm run e2e` — all E2E tests (T016+T017+T027+T032+T038) MUST pass.
- [ ] T048 [P] Run `grafana-verifier` against `http://localhost:3000` and verify all four query
      modes render correctly: Raw (Table), Notes (Table), Timeline (State Timeline with transform),
      Drums (Table). Attach screenshots to PR description.
- [ ] T049 Complete manual testing checklist from `quickstart.md` §Manual Testing with a
      physical MIDI keyboard. Document results in PR description. All checklist items must be checked.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001–T004) — blocks ALL user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 3 completion (needs datasource + AudioEngine wired)
- **US3 (Phase 5)**: Depends on Phase 3 completion (needs datasource + QueryEditor)
- **US4 (Phase 6)**: Depends on Phase 3 completion (needs datasource; independent of US2/US3)
- **Polish (Phase 7)**: Depends on US1–US4 complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P2)**: After US1 — needs `MidiDataSource` and `AudioEngine` from Phase 3
- **US3 (P3)**: After US1 — needs `MidiDataSource` and `QueryEditor` from Phase 3
- **US4 (P4)**: After US1 — can run in parallel with US2/US3 if staffed

### Within Each User Story

- Tests MUST be written AND verified failing before implementation starts (TDD — constitution §II)
- Within tests: unit and E2E tests marked [P] can be written in parallel
- Within implementation: tasks marked [P] can be executed in parallel

### Parallel Opportunities

**Phase 2** parallel sets:

```
Set A (infrastructure): T005, T006 (different files)
Set B (tests): T007, T009, T011, T013 (different files, all depend on T005)
Set C (impls): T008, T010, T012, T014 (each depends on its own tests only)
```

**Phase 3** parallel sets:

```
Set A (tests): T015, T016, T017 (different files)
Set B (impl):  T018, T019 (different files, no cross-deps)
T023 (module.ts) — parallel with T019
```

**Phase 6** parallel sets:

```
Set A (tests): T036, T037, T038 (different files)
Set B (impl):  T039, T040 (different files; T041 depends on both)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T014) — all tests passing
3. Complete Phase 3: US1 (T015–T024)
4. **STOP and VALIDATE**: Confirm raw message table works in Grafana with a real MIDI device
5. Demonstrate to user: device dropdown, mode selector, live table rows

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Phase 3 → US1 (raw table): Table panel shows live MIDI messages
3. Phase 4 → US2 (notes + sound): Note rows + audio playback
4. Phase 5 → US3 (timeline): Piano roll via State Timeline panel
5. Phase 6 → US4 (drums + sound): Drum hit display + audio
6. Phase 7 → Polish + full verification

### Parallel Team Strategy

With two developers after Phase 2:

- Developer A: US2 (Phase 4) — note synthesis and audio
- Developer B: US3 (Phase 5) — timeline range controls
- US4 (Phase 6) — whoever finishes first

---

## Notes

- [P] tasks = different files, no incomplete dependencies — safe to run in parallel
- [Story] label maps each task to a user story for traceability
- TDD is mandatory per Constitution Principle II: MUST see tests fail before implementing
- Each story phase is independently completable and demonstrable
- Verify tests fail before implementing — commit test files before implementation files
- Run `grafana-verifier` after every user story's Checkpoint
- Sound playback (US2, US4) and latency (SC-002/SC-003) require a physical MIDI device
