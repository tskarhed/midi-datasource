# Contract: QueryEditor Component

**Branch**: `001-midi-keyboard-viz` | **Date**: 2026-03-18

---

## Component Signature

```typescript
import { QueryEditorProps } from '@grafana/data';
import { MidiDataSource } from '../datasource';
import { MidiQuery, MidiDataSourceOptions } from '../types';

type Props = QueryEditorProps<MidiDataSource, MidiQuery, MidiDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props): JSX.Element;
```

---

## Required UI Elements (in order)

All elements use `@grafana/ui` components wrapped in `InlineField`/`InlineFieldRow`.

### 1. Device Selector

```
Label:   "MIDI Device"
Control: Select (async options, single-select)
Options: populated by datasource.listDevices() on mount and on MIDIAccess.onstatechange
Format:  { label: device.name, value: device.id }
Empty:   placeholder "Select a MIDI device..."
Loaded:  if no devices, option "No devices found — connect a MIDI device"
Behaviour: calls onChange({ ...query, deviceId: selected.value }) and onRunQuery()
```

### 2. Mode Selector

```
Label:   "Mode"
Control: Select (static options, single-select)
Options:
  { label: 'Raw messages', value: 'raw' }
  { label: 'Notes',        value: 'notes' }
  { label: 'Timeline',     value: 'timeline' }
  { label: 'Drums',        value: 'drums' }
Behaviour: calls onChange({ ...query, mode: selected.value }) and onRunQuery()
```

### 3. Note Range (Timeline mode only — hidden for raw/notes/drums)

```
Label:   "Note range"
Controls (shown when mode === 'timeline' && !noteRangeAuto):
  Input: min note (number, 0–127, label "Min note")
  Input: max note (number, 0–127, label "Max note")
Switch:
  Label: "Auto-expand range"
  Value: query.noteRangeAuto
  Behaviour: calls onChange({ ...query, noteRangeAuto: !query.noteRangeAuto })
             When toggled on, hides min/max inputs
```

### 4. Status / Error Display

```
When deviceId is empty:
  Alert severity="info"  text="Select a MIDI device above to start receiving data."

When browser lacks MIDI support (detected by datasource.testDatasource() returning error):
  Alert severity="error" text="Web MIDI API not supported. Use Chrome or Edge."

When selected device is disconnected:
  Alert severity="warning" text="MIDI device disconnected. Reconnect to resume."
```

---

## onChange / onRunQuery Protocol

- Every field change MUST call `onChange(updatedQuery)` synchronously.
- `onRunQuery()` MUST be called after each `onChange()` call (so Grafana re-executes the query).
- The component MUST NOT maintain local React state for query field values; use `query` prop as
  the single source of truth.

---

## MIDI Device List Refresh

The component MUST call `datasource.listDevices()`:

1. On initial mount (to populate the device dropdown)
2. Whenever the `MIDIAccess.onstatechange` event fires (a device is connected or disconnected)

To receive state-change notifications, the component registers a listener via the datasource's
`onDeviceStateChange(callback)` method and removes it on unmount.

---

## Accessibility

- All `InlineField` labels MUST have corresponding `id` props on their child controls.
- `Select` components MUST have `inputId` props matching the `htmlFor` of their label.
- The component MUST be fully keyboard-navigable (Select and Input already provide this via
  `@grafana/ui`).
