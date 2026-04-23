import { DataSourcePlugin } from '@grafana/data';
import { MidiDataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { MidiQuery, MidiDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<MidiDataSource, MidiQuery, MidiDataSourceOptions>(MidiDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
