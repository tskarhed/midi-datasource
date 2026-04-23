import React from 'react';
import { InlineLabel } from '@grafana/ui';

/** No-config editor: the variable always lists all connected MIDI devices. */
export function VariableQueryEditor() {
  return <InlineLabel>Lists all connected MIDI input devices.</InlineLabel>;
}
