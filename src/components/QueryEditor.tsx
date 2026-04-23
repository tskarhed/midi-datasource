import React, { useEffect, useState } from 'react';
import { Alert, Combobox, Field, InlineField, InlineFieldRow, RangeSlider, type ComboboxOption } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { MidiDataSource } from '../datasource';
import { MidiDataSourceOptions, MidiDeviceInfo, MidiQuery, MidiQueryFormat, MidiQueryMode } from '../types';
import { formatNoteName } from '../constants';

type Props = QueryEditorProps<MidiDataSource, MidiQuery, MidiDataSourceOptions>;

const MODE_OPTIONS: Array<ComboboxOption<MidiQueryMode>> = [
  { label: 'Raw messages', value: 'raw' },
  { label: 'Notes', value: 'notes' },
  { label: 'Drums', value: 'drums' },
];

const FORMAT_OPTIONS: Array<ComboboxOption<MidiQueryFormat>> = [
  { label: 'Long', value: 'long' },
  { label: 'Wide', value: 'wide' },
];

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [midiSupported, setMidiSupported] = useState<boolean | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    return datasource.onAudioBlocked(() => setAudioBlocked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceDisconnected =
    !!query.deviceId &&
    (() => {
      const found = devices.find((d) => d.id === query.deviceId);
      return !found || found.state === 'disconnected';
    })();

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      datasource
        .listDevices()
        .then((list) => {
          if (cancelled) {
            return;
          }
          setDevices(list);
          setMidiSupported(true);
        })
        .catch(() => {
          if (!cancelled) {
            setMidiSupported(false);
          }
        });
    };

    refresh();
    const removeListener = datasource.onDeviceStateChange(refresh);

    return () => {
      cancelled = true;
      removeListener();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const variableOptions: Array<ComboboxOption<string>> = getTemplateSrv()
    .getVariables()
    .map((v) => ({ label: `$${v.name}`, value: `$${v.name}` }));

  const deviceOptions: Array<ComboboxOption<string>> = [
    ...variableOptions,
    ...(devices.length === 0
      ? [{ label: 'No devices found — connect a MIDI device', value: '' }]
      : devices.map((d) => ({ label: d.name, value: d.id }))),
  ];

  const selectedDevice = deviceOptions.find((o) => o.value === query.deviceId) ?? null;
  const selectedMode = MODE_OPTIONS.find((o) => o.value === query.mode) ?? MODE_OPTIONS[0];

  const handleDeviceChange = (selected: ComboboxOption<string>) => {
    onChange({ ...query, deviceId: selected.value });
    onRunQuery();
  };

  const handleModeChange = (selected: ComboboxOption<MidiQueryMode>) => {
    onChange({ ...query, mode: selected.value });
    onRunQuery();
  };

  const handleFormatChange = (selected: ComboboxOption<MidiQueryFormat>) => {
    onChange({ ...query, format: selected.value });
    onRunQuery();
  };

  const handleNoteRangeChange = (values?: number[]) => {
    if (!values) {
      return;
    }
    onChange({ ...query, noteRangeMin: values[0], noteRangeMax: values[1] });
    onRunQuery();
  };

  const handleEnableAudio = async () => {
    await datasource.audioEngine.resumeContext();
    setAudioBlocked(false);
  };

  if (midiSupported === false) {
    return (
      <Alert severity="error" title="Web MIDI API not supported">
        Web MIDI API not supported. Use Chrome or Edge.
      </Alert>
    );
  }

  return (
    <>
      <InlineFieldRow>
        <InlineField label="MIDI Device" htmlFor="query-editor-device">
          <Combobox<string>
            id="query-editor-device"
            options={deviceOptions}
            value={selectedDevice}
            onChange={handleDeviceChange}
            placeholder="Select a MIDI device..."
            width={32}
          />
        </InlineField>

        <InlineField label="Mode" htmlFor="query-editor-mode">
          <Combobox<MidiQueryMode>
            id="query-editor-mode"
            options={MODE_OPTIONS}
            value={selectedMode}
            onChange={handleModeChange}
            width={20}
          />
        </InlineField>
      </InlineFieldRow>

      {(query.mode === 'notes' || query.mode === 'drums') && (
        <InlineFieldRow>
          <InlineField label="Format" htmlFor="query-editor-format">
            <Combobox<MidiQueryFormat>
              id="query-editor-format"
              options={FORMAT_OPTIONS}
              value={FORMAT_OPTIONS.find((o) => o.value === query.format) ?? FORMAT_OPTIONS[0]}
              onChange={handleFormatChange}
              width={12}
            />
          </InlineField>
        </InlineFieldRow>
      )}

      {query.mode === 'notes' && query.format === 'wide' && (
        <Field
          label={`Note range: ${formatNoteName(query.noteRangeMin ?? 36)} – ${formatNoteName(query.noteRangeMax ?? 84)}`}
        >
          <RangeSlider
            min={0}
            max={127}
            step={1}
            value={[query.noteRangeMin ?? 36, query.noteRangeMax ?? 84]}
            onAfterChange={handleNoteRangeChange}
            formatTooltipResult={(v) => formatNoteName(v)}
          />
        </Field>
      )}

      {!query.deviceId && (
        <Alert severity="info" title="No device selected">
          Select a MIDI device above to start receiving data.
        </Alert>
      )}

      {deviceDisconnected && query.deviceId && (
        <Alert severity="warning" title="Device disconnected">
          MIDI device disconnected. Reconnect to resume.
        </Alert>
      )}

      {audioBlocked && (
        <Alert severity="info" title="Audio blocked" onClick={handleEnableAudio} style={{ cursor: 'pointer' }}>
          Click here to enable audio
        </Alert>
      )}
    </>
  );
}
