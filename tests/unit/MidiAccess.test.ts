import { MidiAccessService } from '../../src/midi/MidiAccess';
import { WMT } from '../__mocks__/web-midi-api';

describe('MidiAccessService', () => {
  let service: MidiAccessService;

  beforeEach(() => {
    service = new MidiAccessService();
  });

  describe('listDevices()', () => {
    it('returns empty array when no devices connected', async () => {
      const devices = await service.listDevices();
      expect(devices).toEqual([]);
    });

    it('returns connected devices', async () => {
      const src = new WMT.MidiSrc('Test Piano');
      src.connect();

      const devices = await service.listDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].name).toBe('Test Piano');
      expect(devices[0].id).toBeDefined();
      expect(devices[0].state).toBe('connected');

      src.disconnect();
    });

    it('returns id and name for each device', async () => {
      const src = new WMT.MidiSrc('My Keyboard');
      src.connect();

      const devices = await service.listDevices();
      const device = devices[0];
      expect(typeof device.id).toBe('string');
      expect(typeof device.name).toBe('string');

      src.disconnect();
    });
  });

  describe('subscribe()', () => {
    it('registers onmidimessage on the correct device', async () => {
      const src = new WMT.MidiSrc('Piano');
      src.connect();

      const devices = await service.listDevices();
      const deviceId = devices[0].id;

      const callback = jest.fn();
      service.subscribe(deviceId, callback);

      src.emit([0x90, 60, 100]); // Note On
      expect(callback).toHaveBeenCalledTimes(1);

      src.disconnect();
    });

    it('callback receives parsed MidiMessage', async () => {
      const src = new WMT.MidiSrc('Piano');
      src.connect();

      const devices = await service.listDevices();
      const deviceId = devices[0].id;

      const callback = jest.fn();
      service.subscribe(deviceId, callback);

      src.emit([0x90, 64, 80]); // Note On, note 64, velocity 80

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'noteOn',
          channel: 1,
          data1: 64,
          data2: 80,
        })
      );

      src.disconnect();
    });

    it('returns an unsubscribe function', async () => {
      const src = new WMT.MidiSrc('Piano');
      src.connect();

      const devices = await service.listDevices();
      const deviceId = devices[0].id;

      const callback = jest.fn();
      const unsubscribe = service.subscribe(deviceId, callback);

      unsubscribe();
      src.emit([0x90, 60, 100]);

      expect(callback).not.toHaveBeenCalled();

      src.disconnect();
    });

    it('unsubscribing one listener does not affect others', async () => {
      const src = new WMT.MidiSrc('Piano');
      src.connect();

      const devices = await service.listDevices();
      const deviceId = devices[0].id;

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = service.subscribe(deviceId, callback1);
      service.subscribe(deviceId, callback2);

      unsubscribe1();
      src.emit([0x90, 60, 100]);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);

      src.disconnect();
    });
  });

  describe('onDeviceStateChange()', () => {
    it('fires callback when MIDIAccess.onstatechange fires', async () => {
      const callback = jest.fn();
      service.onDeviceStateChange(callback);

      // Trigger init to get MIDIAccess
      await service.listDevices();

      // Connect a new device - this fires onstatechange
      const src = new WMT.MidiSrc('New Device');
      src.connect();

      // Give event time to propagate
      await new Promise((r) => setTimeout(r, 10));

      expect(callback).toHaveBeenCalled();

      src.disconnect();
    });
  });
});
