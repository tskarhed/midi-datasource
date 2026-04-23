/**
 * Jest global setup for Web MIDI API mocking using web-midi-test.
 * This file is loaded via setupFilesAfterEnv in jest.config.js and installs
 * the WMT mock on navigator.requestMIDIAccess before each test.
 */
import * as WMT from 'web-midi-test';

beforeEach(() => {
  WMT.midi = true;
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: WMT.requestMIDIAccess.bind(WMT),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  WMT.midi = false;
  try {
    // Remove the mock so tests that check for absence of MIDI work
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch {
    // ignore errors from environments that don't allow property redefinition
  }
});

export { WMT };
