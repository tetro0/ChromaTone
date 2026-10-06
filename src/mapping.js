/**
 * ChromaTone — the shared colour <-> sound mapping.
 *
 * This module is the single source of truth for how a colour relates to a
 * note. It is deliberately pure: no DOM, no Web Audio, no Tone.js, no canvas.
 * That is what lets Direction 1 (draw -> sound) and Direction 2 (sound ->
 * draw) call the *same* functions, one forward and one inverted, so the two
 * can never drift apart.
 *
 * Every exported transform that has an inverse ships both halves, and
 * mapping.test.js asserts the round-trips.
 */

/* ------------------------------------------------------------- constants */

/** The colour wheel is divided into twelve 30-degree steps. */
export const HUE_STEPS = 12;

/**
 * Hue -> pitch class, walking the CIRCLE OF FIFTHS.
 *
 * This is the heart of the design: adjacent hues are a perfect fifth apart,
 * so neighbouring colours are harmonically related. Drawing something random
 * still tends to sound pleasant, which is the whole point.
 *
 *   index 0 -> red -> C, then up a fifth each step: G D A E B F# C# G# D# A# F
 */
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** Semitone offsets for each selectable scale. */
export const SCALES = {
  majorPentatonic: { label: "Major pentatonic", offsets: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: "Minor pentatonic", offsets: [0, 3, 5, 7, 10] },
  major: { label: "Major", offsets: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Minor (natural)", offsets: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: "Dorian", offsets: [0, 2, 3, 5, 7, 9, 10] },
  blues: { label: "Blues", offsets: [0, 3, 5, 6, 7, 10] },
  chromatic: { label: "Chromatic", offsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const DEFAULT_SCALE = "majorPentatonic";

/** Direction 1 maps lightness onto three octaves (the brief's "clamped"). */
export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 4;
export const OCTAVE_COUNT = OCTAVE_MAX - OCTAVE_MIN + 1;

/** Brush sizes, in canvas pixels, and the note length each one plays. */
export const BRUSH_SIZES = {
  thin: { label: "Thin", radius: 2, duration: 0.08 },
  medium: { label: "Medium", radius: 7, duration: 0.35 },
  thick: { label: "Thick", radius: 16, duration: 1.1 },
};

/** Instruments offered in the Direction 1 toolbar. */
export const INSTRUMENTS = {
  piano: { label: "Piano", pitched: true },
  guitar: { label: "Guitar", pitched: true },
  bass: { label: "Bass", pitched: true },
  drums: { label: "Drums", pitched: false },
};

/**
 * Drum voices, chosen by hue instead of by pitch. Twelve hue steps land on
 * six pieces, so each piece covers two adjacent steps.
 */
export const DRUM_PIECES = ["kick", "snare", "closedHat", "openHat", "clap", "tom"];

/** Low volumes are treated as silence rather than very quiet notes. */
export const VELOCITY_FLOOR = 0.04;

/* ------------------------------------------------------------ primitives */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Wrap any hue, including negatives and values past 360, into [0, 360). */
export function wrapHue(hue) {
  return ((hue % 360) + 360) % 360;
}

/** Convert an `#rrggbb` (or `#rgb`) string to an {r, g, b} triple. */
export function hexToRgb(hex) {
  if (typeof hex !== "string") throw new TypeError("hexToRgb expects a string");
  let body = hex.trim().replace(/^#/, "");
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(body)) throw new RangeError(`not a hex colour: ${hex}`);
  const int = parseInt(body, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Convert {r, g, b} (0-255) to {h: 0-360, s: 0-100, l: 0-100}. */
export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  // A grey pixel has no hue at all; report 0 rather than NaN.
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;

  return { h: wrapHue(h * 60), s: s * 100, l: l * 100 };
}

/** Convenience: hex straight to HSL. */
export function hexToHsl(hex) {
  return rgbToHsl(hexToRgb(hex));
}

/* ------------------------------------------- hue <-> pitch class (fifths) */

/**
 * Hue (0-360) -> pitch class (0-11), walking the circle of fifths.
 * Red (0 degrees) is C; each 30-degree step is another fifth.
 */
export function hueToPitchClass(hue) {
  const slice = Math.floor(wrapHue(hue) / (360 / HUE_STEPS));
  return CIRCLE_OF_FIFTHS[slice % HUE_STEPS];
}

/**
 * Pitch class (0-11) -> the hue at the *start* of its slice.
 * Exact inverse of hueToPitchClass for the values it produces.
 */
export function pitchClassToHue(pitchClass) {
  if (!Number.isFinite(pitchClass)) {
    throw new RangeError(`pitch class must be a finite number, got ${pitchClass}`);
  }
  const pc = ((Math.round(pitchClass) % 12) + 12) % 12;
  const slice = CIRCLE_OF_FIFTHS.indexOf(pc);
  // indexOf always finds a hit because CIRCLE_OF_FIFTHS is a permutation,
  // but guard anyway so a bad input cannot silently return -1 * 30.
  if (slice === -1) throw new RangeError(`pitch class out of range: ${pitchClass}`);
  return slice * (360 / HUE_STEPS);
}

/* ---------------------------------------------- lightness <-> octave band */

/** Lightness (0-100) -> an octave index 0..2 (0 = lowest of the three). */
export function lightnessToOctaveIndex(lightness) {
  const l = clamp(lightness, 0, 100) / 100;
  return clamp(Math.floor(l * OCTAVE_COUNT), 0, OCTAVE_COUNT - 1);
}

/** Octave index -> the lightness at the centre of that band, 0-100. */
export function octaveIndexToLightness(index) {
  const i = clamp(Math.round(index), 0, OCTAVE_COUNT - 1);
  return ((i + 0.5) / OCTAVE_COUNT) * 100;
}

/** Octave index -> real octave number (2, 3 or 4). */
export function octaveIndexToOctave(index) {
  return OCTAVE_MIN + clamp(Math.round(index), 0, OCTAVE_COUNT - 1);
}

/* ------------------------------------------------- velocity <-> opacity */

/** Velocity (0-1) -> stroke opacity (0-1). Identity today, named for intent. */
export function velocityToOpacity(velocity) {
  return clamp(velocity, 0, 1);
}

/** Stroke opacity (0-1) -> velocity (0-1). */
export function opacityToVelocity(opacity) {
  return clamp(opacity, 0, 1);
}

/* --------------------------------------------------- brush <-> duration */

/** Brush key ("thin" | "medium" | "thick") -> note duration in seconds. */
export function brushToDuration(brush) {
  const entry = BRUSH_SIZES[brush];
  if (!entry) throw new RangeError(`unknown brush: ${brush}`);
  return entry.duration;
}

/** Brush key -> radius in canvas pixels. */
export function brushToRadius(brush) {
  const entry = BRUSH_SIZES[brush];
  if (!entry) throw new RangeError(`unknown brush: ${brush}`);
  return entry.radius;
}

/** Note duration -> the brush closest to it. Used when singing draws strokes. */
export function durationToBrush(duration) {
  let best = "medium";
  let bestDelta = Infinity;
  for (const [key, entry] of Object.entries(BRUSH_SIZES)) {
    const delta = Math.abs(entry.duration - duration);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = key;
    }
  }
  return best;
}

/* ------------------------------------------------------ scale constraint */

/**
 * Snap a pitch class to the nearest note of the scale, so nothing lands out
 * of key. Returns a pitch class (0-11), not an offset.
 */
export function quantiseToScale(pitchClass, scaleKey = DEFAULT_SCALE) {
  const scale = SCALES[scaleKey];
  if (!scale) throw new RangeError(`unknown scale: ${scaleKey}`);
  const root = ((Math.round(pitchClass) % 12) + 12) % 12;

  let best = scale.offsets[0];
  let bestDistance = Infinity;
  for (const offset of scale.offsets) {
    // Distance around the 12-tone circle, so C# can snap down to C.
    const raw = Math.abs(root - offset) % 12;
    const distance = Math.min(raw, 12 - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = offset;
    }
  }
  return best;
}

/* ------------------------------------------------ note assembly (shared) */

/** MIDI number for a pitch class in a given octave. C4 is MIDI 60. */
export function pitchClassToMidi(pitchClass, octave) {
  const pc = ((Math.round(pitchClass) % 12) + 12) % 12;
  return (octave + 1) * 12 + pc;
}

/** MIDI number -> the octave it sits in. */
export function midiToOctave(midi) {
  return Math.floor(midi / 12) - 1;
}

/** MIDI number -> a pitch class 0-11. */
export function midiToPitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

/**
 * Direction 2 needs the inverse: which octave band does this MIDI note fall
 * in, relative to the three we offer? Notes outside the range clamp.
 */
export function midiToOctaveIndex(midi) {
  return clamp(midiToOctave(midi) - OCTAVE_MIN, 0, OCTAVE_COUNT - 1);
}

/** MIDI number -> "C4", "F#3" and so on. */
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function midiToName(midi) {
  return NOTE_NAMES[midiToPitchClass(midi)] + midiToOctave(midi);
}

/** Frequency (Hz) of a MIDI note, A4 = 440 Hz. */
export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ------------------------------------------- the Direction 1 entry point */

/**
 * The heart of Direction 1: a colour plus a brush and an instrument becomes
 * everything the scheduler needs to play one note.
 *
 * @param {{h: number, s: number, l: number}} hsl
 * @param {object} [options]
 * @param {string} [options.scale]      key into SCALES
 * @param {string} [options.brush]      key into BRUSH_SIZES
 * @param {string} [options.instrument] key into INSTRUMENTS
 * @param {number} [options.opacity]    0-1, becomes velocity
 * @param {number} [options.velocity]   0-1, overrides opacity if given
 * @returns {{pitched: boolean, midi: number|null, name: string|null,
 *            octaveIndex: number, velocity: number, duration: number,
 *            pitchClass: number, drum: string|null, silent: boolean}}
 */
export function colorToNote(hsl, options = {}) {
  const {
    scale = DEFAULT_SCALE,
    brush = "medium",
    instrument = "piano",
    velocity: explicitVelocity,
    opacity = 1,
  } = options;

  const instrumentDef = INSTRUMENTS[instrument];
  if (!instrumentDef) throw new RangeError(`unknown instrument: ${instrument}`);

  const velocity = clamp(
    explicitVelocity === undefined ? opacityToVelocity(opacity) : explicitVelocity,
    0,
    1,
  );

  const rawPitchClass = hueToPitchClass(hsl.h);
  const pitchClass = quantiseToScale(rawPitchClass, scale);
  const octaveIndex = lightnessToOctaveIndex(hsl.l);
  const duration = brushToDuration(brush);

  const base = {
    pitched: instrumentDef.pitched,
    octaveIndex,
    velocity,
    duration,
    pitchClass,
    silent: velocity < VELOCITY_FLOOR,
  };

  // Drums have no pitch: the hue picks the piece instead of the note.
  if (!instrumentDef.pitched) {
    const pieceIndex = Math.floor(wrapHue(hsl.h) / (360 / HUE_STEPS)) % DRUM_PIECES.length;
    return { ...base, midi: null, name: null, drum: DRUM_PIECES[pieceIndex] };
  }

  const octave = octaveIndexToOctave(octaveIndex);
  const midi = pitchClassToMidi(pitchClass, octave);
  return { ...base, midi, name: midiToName(midi), drum: null };
}

/* ------------------------------------------- the Direction 2 entry point */

/**
 * The heart of Direction 2: what the microphone heard becomes a pen state.
 *
 * @param {{frequency: number, clarity: number, volume: number}} sample
 * @param {object} [options]
 * @param {string} [options.scale]
 * @param {number} [options.volumeGate]  below this RMS the pen lifts
 * @param {number} [options.clarityGate] below this pitchy clarity the sample is ignored
 * @param {number} [options.minHz]
 * @param {number} [options.maxHz]
 * @returns {{drawing: boolean, hue: number|null, lightness: number|null,
 *            velocity: number, brush: string, direction: -1|0|1,
 *            pitchClass: number|null, midi: number|null, name: string|null}}
 */
export function soundToPen(sample, options = {}) {
  const {
    scale = DEFAULT_SCALE,
    volumeGate = 0.02,
    clarityGate = 0.9,
    minHz = 65,
    maxHz = 1000,
  } = options;

  const volume = clamp(sample.volume ?? 0, 0, 1);

  // Silence lifts the pen. Checked first so a noisy room cannot draw.
  if (volume < volumeGate) {
    return {
      drawing: false,
      hue: null,
      lightness: null,
      velocity: 0,
      brush: "medium",
      direction: 0,
      pitchClass: null,
      midi: null,
      name: null,
    };
  }

  const frequency = sample.frequency ?? 0;
  const clarity = sample.clarity ?? 0;

  // Pitchy reports a frequency even for unpitched noise; clarity is how much
  // to trust it. Below the gate we treat the frame as unpitched.
  const usable = clarity >= clarityGate && frequency >= minHz && frequency <= maxHz;
  if (!usable) {
    return {
      drawing: false,
      hue: null,
      lightness: null,
      velocity: velocityToOpacity(volume),
      brush: "medium",
      direction: 0,
      pitchClass: null,
      midi: null,
      name: null,
    };
  }

  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const rawPitchClass = midiToPitchClass(midi);
  const pitchClass = quantiseToScale(rawPitchClass, scale);

  // Pitch class -> hue is the *inverse* of Direction 1's hue -> pitch class,
  // which is what makes the two directions agree on a colour.
  const hue = pitchClassToHue(pitchClass);
  const octaveIndex = midiToOctaveIndex(midi);
  const lightness = octaveIndexToLightness(octaveIndex);

  // Louder singing -> wider, more opaque strokes, and longer notes.
  const brush = volume > 0.25 ? "thick" : volume > 0.08 ? "medium" : "thin";

  return {
    drawing: true,
    hue,
    lightness,
    velocity: velocityToOpacity(volume),
    brush,
    direction: 0, // filled in by the caller, which can see the previous sample
    pitchClass,
    midi,
    name: midiToName(midi),
  };
}

/** Convenience wrapper: a full HSL triple for a detected pitch. */
export function soundToColor(sample, options = {}) {
  const pen = soundToPen(sample, options);
  if (!pen.drawing) return null;
  return { h: pen.hue, s: 100, l: pen.lightness };
}

/** RGB -> HEX, for putting the detected colour into an <input type="color">. */
export function rgbToHex({ r, g, b }) {
  const part = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** HSL -> HEX (fully saturated at 100%). */
export function hslToHex({ h, s, l }) {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = wrapHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] :
    hp < 2 ? [x, c, 0] :
    hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] :
    hp < 5 ? [x, 0, c] :
             [c, 0, x];
  const m = ln - c / 2;
  return rgbToHex({ r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 });
}

/** Sort every valid hue back into the twelve slice centres we actually use. */
export function hueSliceCentres() {
  return Array.from({ length: HUE_STEPS }, (_, i) => i * (360 / HUE_STEPS) + (360 / HUE_STEPS) / 2);
}
