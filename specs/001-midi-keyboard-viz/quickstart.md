# Quickstart: MIDI Keyboard Datasource Plugin

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-03-18

---

## Prerequisites

- **Browser**: Chrome or Edge (Web MIDI API required)
- **Node.js**: >= 22 (as specified in `package.json`)
- **Docker**: for running the local Grafana instance
- **MIDI device**: USB MIDI keyboard (for manual testing steps)

---

## Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the Grafana development server

```bash
npm run server
# Grafana runs at http://localhost:3000 (admin / admin)
```

### 3. Start the plugin in watch mode

```bash
npm run dev
# Webpack rebuilds on file save; reload Grafana to pick up changes
```

---

## Running Tests

### Unit tests (Jest)

```bash
npm run test          # watch mode (during development)
npm run test:ci       # single run, exits with pass/fail
```

Unit tests use `web-midi-test` to mock the Web MIDI API without a real device.

### TypeScript type checking

```bash
npm run typecheck     # equivalent to tsc --noEmit
```

### Lint

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint + Prettier auto-fix
```

### E2E tests (Playwright)

```bash
npm run server        # Grafana must be running first
npm run e2e
```

E2E tests inject a fake MIDI API via `page.addInitScript()` — no physical device needed.

### Full validation (run before any PR)

```bash
npm run lint && npm run typecheck && npm run test:ci && npm run build && npm run e2e
```

All four commands must exit with code 0.

---

## Adding the Plugin to a Dashboard (Development)

1. Open Grafana at http://localhost:3000 (admin / admin)
2. Go to **Connections → Data sources → Add new data source**
3. Search for **Midi-Datasource** and click to configure
4. Click **Save & test** — should show "Web MIDI API is available"
5. Create a new dashboard and add a panel
6. Select **Midi-Datasource** as the data source
7. In the query editor, select your MIDI device and a mode

---

## Panel Setup per Mode

### Raw Messages

1. Add panel → select **Table** visualization
2. Query editor: Mode = **Raw messages**
3. Play notes on your MIDI keyboard — rows appear in real-time

### Notes (Real-Time + Sound)

1. Add panel → select **Table** visualization (or any visualization that shows active rows)
2. Query editor: Mode = **Notes**
3. Play notes — each held note appears as a row; releasing removes it
4. Sound plays automatically; if no sound, click anywhere in the panel to unblock audio

### Piano Timeline

1. Add panel → select **State Timeline** visualization
2. Query editor: Mode = **Timeline**
3. Configure **Auto-expand range** or set manual note range (e.g., C3=48 to C6=84)
4. Add a **Transform** → **Partition by values** → partition field: `NoteName`
5. (Optional) In panel options, set color scheme to **From thresholds** and add thresholds at
   velocity values (e.g., 0=transparent, 64=blue, 127=bright blue) to show intensity
6. Play notes — each held note shows as a colored bar; release ends the bar

### Drums

1. Add panel → select **Table** visualization
2. Query editor: Mode = **Drums**
3. Hit drum pads on your MIDI device (or keyboard configured as drums on channel 10)
4. Drum piece names flash Active=true within 200ms of each hit

---

## Manual Testing Checklist

Run this checklist with a physical MIDI keyboard connected via USB.

### Audio (requires listening)

- [ ] **Note pitch accuracy**: Play C4 (note 60) — should sound like middle C
- [ ] **Velocity dynamics**: Play the same note softly and hard — louder at hard press
- [ ] **Chord audio**: Hold 3 notes simultaneously — all 3 sounds play concurrently
- [ ] **Note off**: Hold a note then release — sound fades within ~100ms
- [ ] **Drum kick** (note 36 on ch10): Short low thud
- [ ] **Drum snare** (note 38 on ch10): Sharp crack with noise
- [ ] **Hi-Hat closed** (note 42 on ch10): Very short high tick
- [ ] **Hi-Hat open** (note 46 on ch10): Longer metallic shimmer
- [ ] **Audio autoplay**: Open Grafana in a fresh browser tab, play a note before clicking —
      an "enable audio" prompt should appear; click it, then audio works

### MIDI Device Handling

- [ ] **Device list**: Open query editor — connected device appears in dropdown
- [ ] **Hot-plug**: Connect a MIDI device after page load — it appears in dropdown
- [ ] **Disconnect**: Unplug device while dashboard is open — "device disconnected" warning
      appears in affected panels; reconnecting shows "reconnect" option
- [ ] **Multi-device** (requires two devices): Configure two panels to different devices —
      each shows only its own device's messages

### Latency (SC-002 / SC-003: <50ms)

- [ ] **Visual latency**: Play a note and observe the table row / note highlight appear —
      should be near-instantaneous (imperceptible delay)
- [ ] **Audio latency**: Play a note and listen — audio should begin within one piano keypress
      worth of time (no noticeable lag)

### Browser Compatibility

- [ ] **Chrome**: All modes work, audio works
- [ ] **Edge**: All modes work, audio works
- [ ] **Firefox** (without extension): "Web MIDI API not supported" error shown in query editor

---

## Provisioning (for CI / E2E)

A provisioned datasource config is at `tests/provisioning/datasources/midi.yml`:

```yaml
apiVersion: 1
datasources:
  - name: MIDI
    type: tskarhed-midi-datasource
    access: proxy
    isDefault: false
```

E2E tests use `readProvisionedDataSource({ fileName: 'midi.yml' })` from `@grafana/plugin-e2e`.

---

## Troubleshooting

| Symptom                      | Likely cause                         | Fix                                      |
| ---------------------------- | ------------------------------------ | ---------------------------------------- |
| "Web MIDI API not supported" | Using Firefox without extension      | Switch to Chrome or Edge                 |
| Device dropdown empty        | No MIDI device connected             | Connect USB MIDI keyboard                |
| No sound                     | Browser autoplay blocked             | Click anywhere in the panel area         |
| No sound                     | AudioContext suspended               | Check browser site permissions for audio |
| Timeline shows no bars       | "Partition by values" not configured | Add transform as per panel setup above   |
| `npm run e2e` fails          | Grafana not running                  | Run `npm run server` first               |
| TypeScript errors            | Outdated `@grafana/data` types       | Run `npm install` to sync                |
