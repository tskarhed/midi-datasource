import { Page } from '@playwright/test';

/**
 * Inject a fake Web MIDI API into the page before Grafana loads.
 * Exposes window.__midiMock for test control:
 *   __midiMock.addInput(id, name)           — add a virtual MIDI input device
 *   __midiMock.fireMessage(deviceId, bytes) — fire a MIDI message on a device
 */
export async function injectMidiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface MidiInput {
      id: string;
      name: string;
      state: 'connected' | 'disconnected';
      onmidimessage: ((event: MIDIMessageEvent) => void) | null;
      onstatechange: ((event: MIDIConnectionEvent) => void) | null;
    }

    const inputs = new Map<string, MidiInput>();
    let accessInstances: Array<{ onstatechange: ((event: MIDIConnectionEvent) => void) | null }> = [];

    const midiMock = {
      addInput(id: string, name: string) {
        const input: MidiInput = { id, name, state: 'connected', onmidimessage: null, onstatechange: null };
        inputs.set(id, input);
        // Notify all MIDIAccess instances of state change
        accessInstances.forEach((acc) => {
          if (acc.onstatechange) {
            acc.onstatechange({ port: input } as unknown as MIDIConnectionEvent);
          }
        });
      },
      fireMessage(deviceId: string, dataBytes: number[]) {
        const input = inputs.get(deviceId);
        if (input && input.onmidimessage) {
          const data = new Uint8Array(dataBytes);
          input.onmidimessage({
            data,
            receivedTime: performance.now(),
            timeStamp: performance.now(),
          } as unknown as MIDIMessageEvent);
        }
      },
    };

    (window as unknown as Record<string, unknown>).__midiMock = midiMock;

    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: () =>
        Promise.resolve({
          inputs: {
            get: (id: string) => inputs.get(id),
            has: (id: string) => inputs.has(id),
            entries: () => inputs.entries(),
            keys: () => inputs.keys(),
            values: () => inputs.values(),
            forEach: (cb: (v: MidiInput, k: string) => void) => inputs.forEach(cb),
            size: inputs.size,
          } as unknown as ReadonlyMap<string, MIDIInput>,
          outputs: new Map(),
          onstatechange: null,
          _register(instance: { onstatechange: ((event: MIDIConnectionEvent) => void) | null }) {
            accessInstances.push(instance);
          },
        } as unknown as MIDIAccess),
      writable: true,
      configurable: true,
    });
  });
}
