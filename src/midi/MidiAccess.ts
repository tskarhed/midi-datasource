import type { MidiDeviceInfo, MidiMessage } from '../types';
import { parseMidiMessage } from './MidiMessageParser';

type MessageCallback = (msg: MidiMessage) => void;
type StateChangeCallback = () => void;

/**
 * Wraps the browser's Web MIDI API.
 * Manages device subscriptions and state-change notifications.
 */
export class MidiAccessService {
  private midiAccess: WebMidi.MIDIAccess | null = null;
  private initPromise: Promise<WebMidi.MIDIAccess> | null = null;
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  /** Map from deviceId to Set of registered message listeners */
  private listeners: Map<string, Set<MessageCallback>> = new Map();

  /** Initialise and cache the MIDIAccess object. Only calls requestMIDIAccess() once. */
  private init(): Promise<WebMidi.MIDIAccess> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = navigator.requestMIDIAccess().then((access) => {
      this.midiAccess = access;
      access.onstatechange = () => {
        this.stateChangeCallbacks.forEach((cb) => cb());
      };
      return access;
    });
    return this.initPromise;
  }

  /** Returns the list of currently connected MIDI input devices. */
  async listDevices(): Promise<MidiDeviceInfo[]> {
    const access = await this.init();
    const devices: MidiDeviceInfo[] = [];
    access.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name ?? `MIDI Device (${input.id})`,
        state: input.state,
      });
    });
    return devices;
  }

  /**
   * Subscribe to MIDI messages from a specific device.
   * @returns unsubscribe function
   */
  subscribe(deviceId: string, callback: MessageCallback): () => void {
    if (!this.listeners.has(deviceId)) {
      this.listeners.set(deviceId, new Set());
    }
    const set = this.listeners.get(deviceId)!;
    set.add(callback);

    if (this.midiAccess) {
      // Attach synchronously when MIDIAccess is already available
      const input = this.midiAccess.inputs.get(deviceId);
      if (input) {
        this.attachInputListener(input, deviceId);
      }
    } else {
      // Initialise first, then attach
      this.init().then((access) => {
        const input = access.inputs.get(deviceId);
        if (input) {
          this.attachInputListener(input, deviceId);
        }
      });
    }

    return () => {
      set.delete(callback);
    };
  }

  /** Register a callback to be notified when MIDI device state changes. */
  onDeviceStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    // Ensure MIDIAccess is initialised so onstatechange is set up
    this.init().catch(() => {});
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  private attachInputListener(input: WebMidi.MIDIInput, deviceId: string): void {
    input.onmidimessage = (event: WebMidi.MIDIMessageEvent) => {
      const callbacks = this.listeners.get(deviceId);
      if (!callbacks || callbacks.size === 0) {
        return;
      }
      const timestamp = performance.timeOrigin + (event.timeStamp ?? performance.now());
      const msg = parseMidiMessage(event.data as Uint8Array, timestamp);
      callbacks.forEach((cb) => cb(msg));
    };
  }
}
