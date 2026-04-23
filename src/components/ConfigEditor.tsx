import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MidiDataSourceOptions } from '../types';

type Props = DataSourcePluginOptionsEditorProps<MidiDataSourceOptions>;

export function ConfigEditor(_props: Props) {
  return (
    <p>
      MIDI datasource requires no configuration. Connect a MIDI device and configure it per-panel in the query editor.
    </p>
  );
}
