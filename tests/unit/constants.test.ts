import {
  formatNoteName,
  noteToFrequency,
  GM1_DRUM_MAP,
  GM1_DRUM_CHANNEL,
  GM1_DRUM_NOTE_MIN,
  GM1_DRUM_NOTE_MAX,
} from '../../src/constants';

describe('formatNoteName', () => {
  it('formats note 60 as C4 (middle C)', () => {
    expect(formatNoteName(60)).toBe('C4');
  });

  it('formats note 69 as A4', () => {
    expect(formatNoteName(69)).toBe('A4');
  });

  it('formats note 0 as C-1', () => {
    expect(formatNoteName(0)).toBe('C-1');
  });

  it('formats note 127 as G9', () => {
    expect(formatNoteName(127)).toBe('G9');
  });

  it('formats sharps correctly (note 61 = C#4)', () => {
    expect(formatNoteName(61)).toBe('C#4');
  });
});

describe('noteToFrequency', () => {
  it('returns 440Hz for A4 (note 69)', () => {
    expect(noteToFrequency(69)).toBeCloseTo(440, 3);
  });

  it('returns 220Hz for A3 (note 57)', () => {
    expect(noteToFrequency(57)).toBeCloseTo(220, 3);
  });

  it('returns ~261.63Hz for C4 (note 60)', () => {
    expect(noteToFrequency(60)).toBeCloseTo(261.626, 2);
  });
});

describe('GM1_DRUM_MAP', () => {
  it('maps note 36 to Bass Drum 1', () => {
    expect(GM1_DRUM_MAP[36]).toBe('Bass Drum 1');
  });

  it('maps note 42 to Closed Hi-Hat', () => {
    expect(GM1_DRUM_MAP[42]).toBe('Closed Hi-Hat');
  });

  it('maps note 35 to Bass Drum 2', () => {
    expect(GM1_DRUM_MAP[35]).toBe('Bass Drum 2');
  });

  it('maps note 38 to Acoustic Snare', () => {
    expect(GM1_DRUM_MAP[38]).toBe('Acoustic Snare');
  });

  it('has exactly 47 entries (notes 35–81)', () => {
    const keys = Object.keys(GM1_DRUM_MAP).map(Number);
    expect(keys.length).toBe(47);
  });

  it('covers all notes from 35 to 81', () => {
    for (let n = 35; n <= 81; n++) {
      expect(GM1_DRUM_MAP[n]).toBeDefined();
    }
  });
});

describe('GM1 constants', () => {
  it('GM1_DRUM_CHANNEL is 10', () => {
    expect(GM1_DRUM_CHANNEL).toBe(10);
  });

  it('GM1_DRUM_NOTE_MIN is 35', () => {
    expect(GM1_DRUM_NOTE_MIN).toBe(35);
  });

  it('GM1_DRUM_NOTE_MAX is 81', () => {
    expect(GM1_DRUM_NOTE_MAX).toBe(81);
  });
});
