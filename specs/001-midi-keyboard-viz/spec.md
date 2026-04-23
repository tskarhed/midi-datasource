# Feature Specification: MIDI Keyboard Datasource Plugin

**Feature Branch**: `001-midi-keyboard-viz`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "Build a Grafana frontend datasource plugin which connects to the browser's MIDI API."

## Clarifications

### Session 2026-04-23

- Q: What is the expected DataFrame output format for all datasource modes? → A: Always time-series (timeline) format; Grafana can display the latest values using built-in panel/reduction options regardless of mode.
- Q: How should each mode's time-series output be structured, and is the mode selector retained? → A: Mode selector is retained. Raw events: one time-series row per MIDI message. Note states and Drums: streamed as State Timeline-compatible data (on/off transitions). All modes emit time-series DataFrames.
- Q: Are Notes/Drums/Timeline separate pipelines or views over the raw stream, and is Timeline a separate mode? → A: Notes and Drums are filtered+transformed views over the raw MIDI event stream (not independent pipelines). Timeline is NOT a separate mode — it is removed from the mode selector; Notes mode already emits State Timeline-compatible data, and Grafana's panel type handles the timeline view.
- Q: How should note/drum state be represented per time-series row, and does drum decay apply? → A: `Velocity` field = note/drum velocity on Note On, `null` on Note Off. No 200ms decay timer for drums — state is always driven by what the MIDI input sends (Note On activates, Note Off deactivates).
- Q: Should Notes and Drums modes emit long or wide DataFrame format? → A: Both — a format toggle in the query editor lets users switch per panel between long format (one row per event, requires "Partition by values" transform) and wide format (one field per note/drum name, no transform needed).
- Q: In wide format, should unchanged active notes carry forward their last velocity in each new row? → A: Yes — wide format is stateful: each emitted row represents the full current state of all known notes/drums. Active notes keep their last velocity until Note Off (null); multiple notes can be active in parallel and are all visible in the same row.
- Q: In what order should wide format columns appear? → A: Ascending MIDI note number order — Notes mode columns sorted C-1 (note 0) → G9 (note 127); Drums mode columns sorted by note number 35 → 81. Columns appear in pitch order regardless of which notes are played first.
- Q: In Notes mode, what audio plays when a channel 10 Note On arrives? → A: Drum sound only (percussive synthesis, not a pitched tone); channel 10 always triggers drum audio in both Notes and Drums modes.
- Q: In Drums mode, which channels trigger drum sounds and appear in the drums DataFrame? → A: All 16 MIDI channels — Drums mode is not restricted to channel 10; any channel's Note On/Off feeds the drum display and audio.
- Q: Can note range be obtained from the MIDI device, and should auto-range be kept? → A: Web MIDI API does not expose device note range; `noteRangeAuto` is removed — note range is always a fixed [noteRangeMin, noteRangeMax] configured by the user (default 36–84).
- Q: How should noteRangeMin/Max be set in the query editor? → A: Replace the two separate number inputs with a single `RangeSlider` component (two-handle slider).
- Q: In Notes mode wide format, what column order and pre-population apply? → A: Descending MIDI note number order (highest note first, e.g. C6 → C2 for default range); ALL columns for every note in [noteRangeMin, noteRangeMax] are pre-populated at subscription start, even before any note is played.
- Q: Should the same behaviors (descending order, pre-populated columns) apply to Drums mode wide format, and if so which columns? → A: Yes — Drums mode wide format pre-populates a 6-piece core kit in descending note order: 51 (Ride Cymbal 1), 49 (Crash Cymbal 1), 46 (Open Hi-Hat), 42 (Closed Hi-Hat), 38 (Acoustic Snare), 36 (Bass Drum 1). Drums outside this preset that are actually hit appear dynamically appended after the preset columns.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Raw MIDI Message Monitor (Priority: P1)

A musician or developer adds a panel to a Grafana dashboard, selects the MIDI datasource, picks
a MIDI input device in the panel's query editor, and views all incoming MIDI messages in
real-time as a scrolling table. Each row shows when the message arrived, its type (e.g.,
Note On, Note Off, Control Change), the channel, and the raw data values.

Different panels on the same dashboard can independently select different MIDI devices in their
own query editors, allowing a user to monitor two keyboards on the same dashboard if desired.

**Why this priority**: Raw message monitoring is the most universal use case — it works for any
MIDI device and message type, and is the safest story to implement first. It also serves as the
debugging baseline for all other stories.

**Independent Test**: Can be fully tested by connecting a MIDI keyboard, opening a Grafana
dashboard, adding a panel with the MIDI datasource, selecting a device in the panel query editor,
playing notes, and verifying that new rows appear in real-time with correct message type, channel,
and value columns.

**Acceptance Scenarios**:

1. **Given** one or more MIDI devices are connected to the computer, **When** the user opens the
   panel query editor, **Then** all available MIDI input devices are listed in a device selector.

2. **Given** two panels exist on the same dashboard each with the MIDI datasource, **When** the
   user selects a different device in each panel's query editor, **Then** each panel independently
   receives data from its own selected device.

3. **Given** a MIDI device is selected in a panel query, **When** the user plays a note,
   **Then** a new row appears in the message table within 100ms showing: timestamp, message type
   (e.g., "Note On"), MIDI channel number, note number, and velocity value.

4. **Given** messages are accumulating, **When** the table reaches 1000 rows, **Then** the
   oldest messages are removed so the table stays at a maximum of 1000 rows.

5. **Given** no MIDI device is connected, **When** the user opens the query editor, **Then** a
   clear message is shown explaining that no MIDI devices were detected and listing browser
   requirements.

6. **Given** a MIDI device is selected and the user stops playing, **When** no new messages
   arrive, **Then** the existing table rows remain visible without disappearing.

---

### User Story 2 - Real-Time Note Visualization with Sound Playback (Priority: P2)

A musician selects the MIDI datasource in a panel, picks a device and the "Notes" display mode
in the query editor, and sees a live view of the notes currently being played. Each note's
visual intensity reflects how hard the key was pressed (velocity). At the same time, the browser
plays back a pitched sound for each note. When a key is released the visualization and sound stop.

**Why this priority**: Real-time note feedback is the primary musical use case and delivers
immediate value. The live intensity view and simultaneous sound together distinguish this from a
plain message log.

**Independent Test**: Can be fully tested by selecting the "Notes" mode in the panel query,
playing individual notes and chords, and verifying that: (a) correct note names are highlighted
with intensity proportional to velocity, (b) a pitched sound is heard within 50ms of key press,
and (c) highlights and sound stop when keys are released.

**Acceptance Scenarios**:

1. **Given** the "Notes" mode is selected in the panel query, **When** a note is played,
   **Then** the corresponding note name is highlighted with visual intensity proportional to
   velocity (soft press = dim, hard press = bright).

2. **Given** a note is played on a non-channel-10 channel, **When** the Note On message is
   received, **Then** a pitched sound for that note plays within 50ms. **Given** a Note On
   arrives on channel 10 (GM percussion channel) in Notes mode, **Then** a drum sound (not a
   pitched tone) plays within 50ms.

3. **Given** a note is being held, **When** the corresponding Note Off message is received,
   **Then** the note highlight disappears and the sound fades out.

4. **Given** multiple notes are played simultaneously (chord), **When** all Note On messages are
   received, **Then** all active notes are highlighted concurrently and all sounds play together.

5. **Given** a Note On message with velocity 0 is received, **When** it arrives, **Then** it is
   treated as Note Off: the highlight disappears and no sound plays.

---

### ~~User Story 3 - Piano Timeline View~~ _(removed — superseded by clarification 2026-04-23)_

> **Removed**: "Timeline" is no longer a separate query mode. Notes mode emits State
> Timeline-compatible time-series data (note on/off transitions); the State Timeline panel type
> in Grafana handles the timeline view. The note-range filter (formerly US3) is retained as an
> optional filter within Notes mode.

---

### User Story 4 - Drum Hit Visualization with Sound Playback (Priority: P4)

A drummer selects the "Drums" display mode in a panel query. The plugin detects drum-related MIDI
messages following the General MIDI drum standard, displays each hit as a labelled drum piece
(e.g., "Bass Drum 1", "Acoustic Snare", "Closed Hi-Hat"), and plays back a percussive sound for
each hit. The display shows which pieces are currently active with a brief visual decay.

**Why this priority**: Drum visualization is a specialized use case requiring GM drum mapping and
percussive synthesis. It is placed last because it is the most complex story and is independent
of the pitched-note stories.

**Independent Test**: Can be fully tested by selecting "Drums" mode and sending MIDI Note On
messages on **any channel** using GM drum note numbers (e.g., note 36 = Bass Drum, note 38 = Snare),
and verifying that: (a) the correct drum piece name is highlighted, (b) a percussive sound plays
within 50ms, and (c) the highlight clears on Note Off.

**Acceptance Scenarios**:

1. **Given** the "Drums" mode is selected and a MIDI message arrives on **any channel** with
   a recognized note number, **When** the Note On is received, **Then** the corresponding drum
   piece label is highlighted.

2. **Given** a drum note is triggered, **When** the Note On is received, **Then** a percussive
   sound appropriate for that drum piece plays within 50ms.

3. ~~**Given** a drum hit is displayed, **When** 200ms have elapsed, **Then** the highlight fades
   automatically.~~ _(removed — state is driven by MIDI Note Off, not a timer)_

4. **Given** multiple drum pieces are hit in rapid succession, **When** each Note On is received,
   **Then** each drum piece highlights independently without interfering with others.

5. **Given** a note number on any channel does not match any GM drum mapping, **When** it
   arrives in Drums mode, **Then** it is shown as "Unknown Drum (note NNN)" rather than silently ignored.

---

### Edge Cases

- What happens when the browser does not support MIDI access (e.g., Firefox without extension)?
  → A clear, actionable error message is shown with browser compatibility information.
- What happens when a selected MIDI device is disconnected while the plugin is active?
  → The panel detects disconnection and shows a reconnect prompt without crashing the dashboard.
- What happens when a MIDI device sends messages at very high rate (e.g., 1000+ messages/second)?
  → The table is rate-limited to keep the UI responsive; excess messages are dropped and a
  visible counter shows how many were skipped.
- What if the browser's audio is blocked by autoplay policy?
  → The plugin shows a one-time prompt asking the user to interact with the page to enable audio.
- What if the piano timeline receives a Note On but the corresponding Note Off never arrives
  (e.g., device disconnected while a key is held)?
  → The bar is capped at the point of disconnection and visually marked as incomplete.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The panel query editor MUST list all MIDI input devices detected by the browser so
  the user can select which device a panel listens to.
- **FR-002**: Each panel MUST independently select its own MIDI input device in its query editor;
  different panels on the same dashboard MAY select different devices.
- **FR-003**: The datasource MUST receive MIDI messages from the device selected in each panel's
  query in real-time.
- **FR-004**: The raw message view MUST display each incoming MIDI message as a table row with
  columns: timestamp, message type, channel, data byte 1, data byte 2.
- **FR-005**: The raw message table MUST retain a maximum of 1000 rows, removing the oldest rows
  when the limit is reached.
- **FR-006**: The real-time note view MUST display currently active notes with visual intensity
  proportional to velocity (0–127).
- **FR-007**: The real-time note view MUST play a **pitched** sound for each non-channel-10 Note On
  and a **drum** sound (percussive synthesis) for each channel-10 Note On; the corresponding
  Note Off (or velocity-0 Note On) stops the sound in both cases.
- ~~**FR-008**: The piano timeline view MUST display each note as a horizontal lane with a bar
  representing the held duration, scrolling forward in real-time.~~ _(removed — Timeline is not
  a separate mode; handled by Grafana's State Timeline panel configured against Notes mode output)_
- **FR-009**: Notes mode MUST support a configurable note range [noteRangeMin, noteRangeMax] set
  via a **RangeSlider** (two-handle slider) in the query editor; default range is [36, 84]
  (C2–C6). Notes outside the range MUST be excluded from the output. _(The `noteRangeAuto`
  option is removed — the Web MIDI API does not expose device note range.)_
- **FR-010**: The drum visualization view MUST map incoming messages on **any MIDI channel** to
  named drum pieces using the GM1 drum note map (notes 35–81); Drums mode is not restricted to
  the GM drum channel (channel 10).
- **FR-011**: The drum visualization MUST play a percussive sound for each recognized drum hit
  within 50ms of message receipt.
- ~~**FR-012**: Drum hit highlights MUST automatically fade after 200ms in the absence of a
  Note Off message.~~ _(removed — drum state is driven entirely by MIDI input: Note On
  activates, Note Off deactivates; no decay timer)_
- **FR-013**: The datasource MUST detect when a selected MIDI device disconnects and display a
  reconnection prompt in the affected panel without crashing the dashboard.
- **FR-014**: When the browser does not support MIDI access, the datasource MUST display an
  actionable error message with browser compatibility information.
- **FR-015**: Sound playback MUST function using only browser-native capabilities — no external
  audio service or server-side component is required.
- **FR-016**: Three query modes (Raw, Notes, Drums) MUST be independently selectable in the
  panel query editor. _(Timeline is not a mode — it is a Grafana panel type used with Notes
  mode output.)_
- **FR-017**: The datasource MUST emit time-series DataFrames (each containing a `Time` field) for
  all query modes; display differences between modes are achieved through Grafana panel
  configuration (e.g., "Last value" reduction, "Partition by values" transform) rather than
  different DataFrame schemas.
- **FR-018**: For Notes and Drums modes, the query editor MUST expose a **format toggle**
  (`Long` / `Wide`) that controls the DataFrame shape: Long format emits one row per event with
  a `NoteName`/`DrumName` string field plus `Velocity`; Wide format emits one field per
  note/drum name with `Velocity` as the value — each row MUST carry forward the current velocity
  for ALL active notes/drums so multiple simultaneous notes are visible in the same row. An
  active note/drum retains its last velocity until a Note Off (null) is received.
  **Notes mode wide format**: columns MUST be ordered **descending** by MIDI note number (highest
  first); ALL columns for every note in [noteRangeMin, noteRangeMax] MUST be pre-populated at
  subscription start with `null` velocity, even before any note is played.
  **Drums mode wide format**: columns MUST be pre-populated with the 6-piece core kit preset in
  descending note order — 51 (Ride Cymbal 1), 49 (Crash Cymbal 1), 46 (Open Hi-Hat), 42 (Closed
  Hi-Hat), 38 (Acoustic Snare), 36 (Bass Drum 1) — with `null` velocity at subscription start;
  any drum hit outside this preset MUST be appended dynamically after the preset columns.
  Raw mode always uses long format.

### Key Entities

- **MIDI Device**: A detected MIDI input device with a name, device ID, capability information
  (e.g., note range if reported), and connection status (connected / disconnected).
- **MIDI Message**: A single received MIDI event with: timestamp, message type, channel number
  (1–16), and up to two data bytes (e.g., note number and velocity).
- **Note**: An active pitched note with: note number (0–127), note name (e.g., "C4"), velocity
  (0–127), and state (on / off).
- ~~**Note Duration**: A note event used by the piano timeline with: note number, start timestamp,
  and end timestamp (or "open" if Note Off has not yet been received).~~ _(removed — Timeline is
  not a separate mode; Notes mode time-series covers this via State Timeline panel)_
- **Drum Hit**: A drum event mapped to a named GM1 drum piece with: note number, drum name,
  velocity, and state (on / off, driven by MIDI Note On / Note Off).
- **Query**: A panel query with fields: `deviceId` (string), `mode` (`raw` | `notes` | `drums`),
  `format` (`long` | `wide`, applies to Notes and Drums modes), and `noteRangeMin` /
  `noteRangeMax` (Notes mode only; defaults 36–84; set via RangeSlider; `noteRangeAuto` removed).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can select a MIDI device in a panel query and see raw incoming messages in
  the table within 2 seconds.
- **SC-002**: Note On events are reflected in the real-time note visualization and audio playback
  within 50ms of the MIDI message being received.
- **SC-003**: Drum hits are reflected in the drum visualization and audio playback within 50ms
  of message receipt.
- **SC-004**: The raw message table remains interactive (scrollable, readable) at sustained input
  rates of up to 200 MIDI messages per second.
- **SC-005**: The piano timeline correctly displays note durations for sequences where notes
  overlap, with each note in its own lane and durations accurate to within 10ms.
- **SC-006**: All four display modes operate simultaneously on the same Grafana dashboard —
  potentially across panels connected to different MIDI devices — without interfering with each
  other.
- **SC-007**: A first-time user can connect a MIDI keyboard and see messages within 5 minutes,
  guided only by the plugin's in-panel prompts.
- **SC-008**: The plugin functions entirely in the browser with no server-side component or
  internet connection required after initial page load.

## Assumptions

- The browser's MIDI access capability must be available; currently supported natively in Chrome
  and Edge. Firefox and Safari are out of scope unless the user installs a browser extension.
- Device selection is per-panel via the query editor; one datasource instance serves all panels,
  each of which independently selects its device.
- Drum note names follow the General MIDI (GM1) standard: notes 35–81 map to standard drum names.
  In Drums mode, messages on **any channel** are accepted and mapped to drum names. Channel 10
  is the conventional GM percussion channel but is not the sole accepted channel in Drums mode.
  In Notes mode, channel 10 Note On triggers drum audio (not a pitched sound).
- Sound playback for notes uses a simple pitched tone to represent pitch and velocity; a full
  instrument simulation (e.g., realistic piano samples) is out of scope.
- Sound playback for drums uses synthesized percussive sounds; sample-based drum sounds are out
  of scope.
- The plugin operates in real-time streaming mode; historical playback or persistent recording of
  MIDI sessions across browser reloads is out of scope.
- A "velocity 0 Note On" message is treated as a Note Off, consistent with the MIDI standard.
- The piano timeline scrolls continuously in real-time and is not a static or historical playback
  view.
- All query modes emit time-series DataFrames (with a `Time` field); Grafana's built-in panel
  options and transformations are used to control what is displayed, avoiding mode-specific
  non-time-series DataFrame schemas.
