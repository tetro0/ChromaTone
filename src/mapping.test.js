/**
 * Tests for the shared colour <-> sound mapping.
 *
 * The round-trip tests matter most: Direction 1 maps colour -> note and
 * Direction 2 maps note -> colour, so if these inverses drift the two
 * directions would disagree about what a colour sounds like.
 */
import { describe, expect, it } from "vitest";
import {
  BRUSH_SIZES,
  CIRCLE_OF_FIFTHS,
  DEFAULT_SCALE,
  DRUM_PIECES,
  HUE_STEPS,
  INSTRUMENTS,
  OCTAVE_MAX,
  OCTAVE_MIN,
  SCALES,
  VELOCITY_FLOOR,
  brushToDuration,
  brushToRadius,
  colorToNote,
  durationToBrush,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hueSliceCentres,
  hueToPitchClass,
  lightnessToOctaveIndex,
  midiToName,
  midiToFrequency,
  midiToOctave,
  midiToOctaveIndex,
  midiToPitchClass,
  octaveIndexToLightness,
  octaveIndexToOctave,
  opacityToVelocity,
  pitchClassToHue,
  pitchClassToMidi,
  quantiseToScale,
  rgbToHex,
  rgbToHsl,
  soundToColor,
  soundToPen,
  velocityToOpacity,
  wrapHue,
} from "./mapping.js";

/* ------------------------------------------------------------- constants */

describe("constants", () => {
  it("walks the circle of fifths in the documented order", () => {
    // red = C, then up a fifth each step: G D A E B F# C# G# D# A# F
    expect(CIRCLE_OF_FIFTHS).toEqual([0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
  });

  it("is a permutation of all twelve pitch classes", () => {
    expect([...CIRCLE_OF_FIFTHS].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("offers three octaves", () => {
    expect(OCTAVE_MIN).toBe(2);
    expect(OCTAVE_MAX).toBe(4);
  });
});

/* --------------------------------------------------------- hue wrapping */

describe("wrapHue", () => {
  it("leaves in-range hues alone", () => {
    expect(wrapHue(0)).toBe(0);
    expect(wrapHue(180)).toBe(180);
    expect(wrapHue(359.9)).toBeCloseTo(359.9);
  });

  it("wraps values at or past 360", () => {
    expect(wrapHue(360)).toBe(0);
    expect(wrapHue(450)).toBe(90);
  });

  it("wraps negative hues", () => {
    expect(wrapHue(-30)).toBe(330);
    expect(wrapHue(-450)).toBe(270);
  });
});

/* -------------------------------------------------------- hex <-> rgb/hsl */

describe("colour conversion", () => {
  it("parses six-digit hex", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("expands three-digit shorthand", () => {
    expect(hexToRgb("#0f0")).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("rejects nonsense", () => {
    expect(() => hexToRgb("nope")).toThrow(RangeError);
    expect(() => hexToRgb(123)).toThrow(TypeError);
  });

  it("converts primaries to the expected hue", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0);
    expect(rgbToHsl({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(120);
    expect(rgbToHsl({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(240);
  });

  it("reports zero saturation for grey rather than NaN", () => {
    const grey = rgbToHsl({ r: 128, g: 128, b: 128 });
    expect(grey.s).toBe(0);
    expect(Number.isNaN(grey.h)).toBe(false);
  });

  it("round-trips hex -> hsl -> hex for exact primaries", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff"]) {
      const hsl = hexToHsl(hex);
      expect(hslToHex(hsl).toLowerCase()).toBe(hex);
    }
  });

  it("round-trips rgb <-> hex", () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
    expect(hexToRgb(rgbToHex({ r: 12, g: 34, b: 56 }))).toEqual({ r: 12, g: 34, b: 56 });
  });
});

/* ------------------------------------------- the key round-trip: fifths */

describe("hue <-> pitch class (circle of fifths)", () => {
  it("maps the twelve slice starts to the circle of fifths", () => {
    const expected = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
    for (let i = 0; i < HUE_STEPS; i++) {
      expect(hueToPitchClass(i * 30)).toBe(expected[i]);
    }
  });

  it("sends red to C and 30 degrees to G", () => {
    expect(hueToPitchClass(0)).toBe(0); // C
    expect(hueToPitchClass(30)).toBe(7); // G
    expect(hueToPitchClass(60)).toBe(2); // D
  });

  it("keeps whole slices together, boundaries included", () => {
    expect(hueToPitchClass(0)).toBe(hueToPitchClass(29.99));
    expect(hueToPitchClass(30)).toBe(hueToPitchClass(59.99));
    expect(hueToPitchClass(330)).toBe(hueToPitchClass(359.99));
  });

  it("ROUND TRIP: pitchClassToHue(hueToPitchClass(h)) recovers the slice start", () => {
    for (let i = 0; i < HUE_STEPS; i++) {
      const hue = i * 30;
      expect(pitchClassToHue(hueToPitchClass(hue))).toBe(hue);
    }
  });

  it("ROUND TRIP: every hue, sampled finely, lands on its own slice start", () => {
    for (let h = 0; h < 360; h += 0.25) {
      const slice = Math.floor(h / 30);
      expect(pitchClassToHue(hueToPitchClass(h))).toBe(slice * 30);
    }
  });

  it("ROUND TRIP: hueToPitchClass(pitchClassToHue(pc)) recovers the pitch class", () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(hueToPitchClass(pitchClassToHue(pc))).toBe(pc);
    }
  });

  it("is injective: the twelve pitch classes get twelve distinct hues", () => {
    const hues = Array.from({ length: 12 }, (_, pc) => pitchClassToHue(pc));
    expect(new Set(hues).size).toBe(12);
  });

  it("wraps out-of-range hues before mapping", () => {
    expect(hueToPitchClass(360)).toBe(hueToPitchClass(0));
    expect(hueToPitchClass(-30)).toBe(hueToPitchClass(330));
  });

  it("rejects a non-numeric pitch class", () => {
    // Note: 12 is NOT an error — it normalises to 0 (C in the next octave).
    expect(pitchClassToHue(12)).toBe(0);
    expect(pitchClassToHue(-1)).toBe(150); // pc 11 (B) is index 5 on the circle
    expect(() => pitchClassToHue(NaN)).toThrow(RangeError);
    expect(() => pitchClassToHue(Infinity)).toThrow(RangeError);
  });

  it("exposes slice centres that all map back inside their own slice", () => {
    hueSliceCentres().forEach((centre, i) => {
      expect(Math.floor(centre / 30)).toBe(i);
      expect(hueToPitchClass(centre)).toBe(CIRCLE_OF_FIFTHS[i]);
    });
  });
});

/* ---------------------------------------------- lightness <-> octave */

describe("lightness <-> octave band", () => {
  it("maps dark to the low band and light to the high band", () => {
    expect(lightnessToOctaveIndex(0)).toBe(0);
    expect(lightnessToOctaveIndex(50)).toBe(1);
    expect(lightnessToOctaveIndex(100)).toBe(2);
  });

  it("clamps outside 0-100", () => {
    expect(lightnessToOctaveIndex(-20)).toBe(0);
    expect(lightnessToOctaveIndex(500)).toBe(2);
  });

  it("never exceeds the highest band at the very top", () => {
    // 100% would otherwise index 3 and fall off the end.
    expect(lightnessToOctaveIndex(100)).toBe(2);
  });

  it("translates bands to octave numbers 2, 3, 4", () => {
    expect(octaveIndexToOctave(0)).toBe(2);
    expect(octaveIndexToOctave(1)).toBe(3);
    expect(octaveIndexToOctave(2)).toBe(4);
  });

  it("ROUND TRIP: band -> lightness -> band is stable", () => {
    for (let i = 0; i < 3; i++) {
      expect(lightnessToOctaveIndex(octaveIndexToLightness(i))).toBe(i);
    }
  });
});

/* ------------------------------------------------- velocity <-> opacity */

describe("velocity <-> opacity", () => {
  it("round-trips", () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      expect(opacityToVelocity(velocityToOpacity(v))).toBeCloseTo(v);
    }
  });

  it("clamps out-of-range input", () => {
    expect(velocityToOpacity(2)).toBe(1);
    expect(velocityToOpacity(-1)).toBe(0);
  });
});

/* ---------------------------------------------------- brush <-> duration */

describe("brush <-> duration", () => {
  it("gives thin brushes shorter notes than thick ones", () => {
    expect(brushToDuration("thin")).toBeLessThan(brushToDuration("medium"));
    expect(brushToDuration("medium")).toBeLessThan(brushToDuration("thick"));
  });

  it("gives thin brushes a smaller radius", () => {
    expect(brushToRadius("thin")).toBeLessThan(brushToRadius("thick"));
  });

  it("rejects unknown brushes", () => {
    expect(() => brushToDuration("enormous")).toThrow(RangeError);
    expect(() => brushToRadius("enormous")).toThrow(RangeError);
  });

  it("ROUND TRIP: duration -> brush -> duration is stable for each brush", () => {
    for (const key of Object.keys(BRUSH_SIZES)) {
      expect(durationToBrush(brushToDuration(key))).toBe(key);
    }
  });
});

/* ---------------------------------------------------- scale quantisation */

describe("quantiseToScale", () => {
  it("keeps notes already in the major pentatonic", () => {
    for (const pc of SCALES.majorPentatonic.offsets) {
      expect(quantiseToScale(pc, "majorPentatonic")).toBe(pc);
    }
  });

  it("snaps an out-of-scale note to the nearest allowed note", () => {
    // 1 (C#) is between 0 (C) and 2 (D) in C major; the circle allows either,
    // but it must land on one of them and be in the scale.
    const snapped = quantiseToScale(1, "majorPentatonic");
    expect(SCALES.majorPentatonic.offsets).toContain(snapped);
    expect([0, 2]).toContain(snapped);
  });

  it("always returns a member of the requested scale", () => {
    for (const scaleKey of Object.keys(SCALES)) {
      for (let pc = 0; pc < 12; pc++) {
        expect(SCALES[scaleKey].offsets).toContain(quantiseToScale(pc, scaleKey));
      }
    }
  });

  it("rejects an unknown scale", () => {
    expect(() => quantiseToScale(0, "lydianDominant")).toThrow(RangeError);
  });
});

/* ------------------------------------------------------- MIDI helpers */

describe("MIDI helpers", () => {
  it("puts C4 at MIDI 60 and A4 at 69", () => {
    expect(pitchClassToMidi(0, 4)).toBe(60);
    expect(pitchClassToMidi(9, 4)).toBe(69);
  });

  it("names notes with sharps", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(61)).toBe("C#4");
  });

  it("tunes A4 to 440 Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(81)).toBeCloseTo(880);
  });

  it("extracts pitch class and octave from MIDI", () => {
    expect(midiToPitchClass(60)).toBe(0);
    expect(midiToOctave(60)).toBe(4);
    expect(midiToOctaveIndex(60)).toBe(2); // octave 4 is the top band
  });

  it("clamps MIDI outside the offered octave range", () => {
    expect(midiToOctaveIndex(24)).toBe(0); // far below
    expect(midiToOctaveIndex(120)).toBe(2); // far above
  });

  it("ROUND TRIP: midi -> pitch class & octave -> midi (within range)", () => {
    for (let midi = 36; midi <= 96; midi++) {
      const rebuilt = pitchClassToMidi(midiToPitchClass(midi), midiToOctave(midi));
      expect(rebuilt).toBe(midi);
    }
  });
});

/* ------------------------------------------------------- colorToNote */

describe("colorToNote (Direction 1 entry point)", () => {
  it("maps pure red at mid lightness to a C in the middle octave", () => {
    const note = colorToNote({ h: 0, s: 100, l: 50 }, { instrument: "piano" });
    expect(note.pitched).toBe(true);
    expect(note.pitchClass).toBe(0);
    expect(note.name).toBe("C3");
    expect(note.midi).toBe(48);
  });

  it("maps dark colours lower than light ones", () => {
    const dark = colorToNote({ h: 0, s: 100, l: 5 });
    const light = colorToNote({ h: 0, s: 100, l: 95 });
    expect(dark.midi).toBeLessThan(light.midi);
  });

  it("uses opacity as velocity", () => {
    expect(colorToNote({ h: 0, s: 100, l: 50 }, { opacity: 0.5 }).velocity).toBeCloseTo(0.5);
  });

  it("marks a near-silent note as silent", () => {
    expect(colorToNote({ h: 0, s: 100, l: 50 }, { opacity: 0 }).silent).toBe(true);
    expect(colorToNote({ h: 0, s: 100, l: 50 }, { opacity: 1 }).silent).toBe(false);
  });

  it("gives a thin brush a shorter note than a thick one", () => {
    const thin = colorToNote({ h: 0, s: 100, l: 50 }, { brush: "thin" });
    const thick = colorToNote({ h: 0, s: 100, l: 50 }, { brush: "thick" });
    expect(thin.duration).toBeLessThan(thick.duration);
  });

  it("gives drums a piece instead of a pitch", () => {
    const note = colorToNote({ h: 0, s: 100, l: 50 }, { instrument: "drums" });
    expect(note.pitched).toBe(false);
    expect(note.midi).toBeNull();
    expect(note.name).toBeNull();
    expect(DRUM_PIECES).toContain(note.drum);
  });

  it("spreads hues across every drum piece", () => {
    const seen = new Set();
    for (let i = 0; i < HUE_STEPS; i++) {
      seen.add(colorToNote({ h: i * 30, s: 100, l: 50 }, { instrument: "drums" }).drum);
    }
    expect(seen.size).toBe(DRUM_PIECES.length);
  });

  it("constrains the pitch to the chosen scale", () => {
    for (let h = 0; h < 360; h += 7) {
      const note = colorToNote({ h, s: 100, l: 50 }, { scale: "majorPentatonic" });
      expect(SCALES.majorPentatonic.offsets).toContain(note.pitchClass);
    }
  });

  it("defaults to the major pentatonic scale", () => {
    expect(DEFAULT_SCALE).toBe("majorPentatonic");
    const note = colorToNote({ h: 15, s: 100, l: 50 });
    expect(SCALES.majorPentatonic.offsets).toContain(note.pitchClass);
  });

  it("rejects an unknown instrument", () => {
    expect(() => colorToNote({ h: 0, s: 100, l: 50 }, { instrument: "theremin" })).toThrow(RangeError);
  });

  it("keeps every instrument's notes in range for every hue and lightness", () => {
    for (const instrument of Object.keys(INSTRUMENTS)) {
      for (let h = 0; h < 360; h += 15) {
        for (let l = 0; l <= 100; l += 10) {
          const note = colorToNote({ h, s: 100, l }, { instrument });
          if (note.pitched) {
            expect(note.midi).toBeGreaterThanOrEqual(pitchClassToMidi(0, OCTAVE_MIN));
            expect(note.midi).toBeLessThanOrEqual(pitchClassToMidi(11, OCTAVE_MAX));
          }
        }
      }
    }
  });
});

/* -------------------------------------------------------- soundToPen */

describe("soundToPen (Direction 2 entry point)", () => {
  const A4 = { frequency: 440, clarity: 0.99, volume: 0.5 };

  it("lifts the pen when it is silent", () => {
    const pen = soundToPen({ frequency: 0, clarity: 0, volume: 0 });
    expect(pen.drawing).toBe(false);
    expect(pen.hue).toBeNull();
    expect(pen.midi).toBeNull();
  });

  it("lifts the pen below the volume gate even if a pitch was detected", () => {
    const pen = soundToPen({ frequency: 440, clarity: 0.99, volume: 0.005 }, { volumeGate: 0.02 });
    expect(pen.drawing).toBe(false);
  });

  it("ignores a frame whose clarity is below the threshold", () => {
    const pen = soundToPen({ frequency: 440, clarity: 0.4, volume: 0.5 }, { clarityGate: 0.9 });
    expect(pen.drawing).toBe(false);
  });

  it("ignores frequencies outside the accepted range", () => {
    expect(soundToPen({ frequency: 20, clarity: 0.99, volume: 0.5 }, { minHz: 65 }).drawing).toBe(false);
    expect(soundToPen({ frequency: 5000, clarity: 0.99, volume: 0.5 }, { maxHz: 1000 }).drawing).toBe(false);
  });

  it("detects A4 as the note A4", () => {
    const pen = soundToPen(A4);
    expect(pen.drawing).toBe(true);
    expect(pen.midi).toBe(69);
    expect(pen.name).toBe("A4");
  });

  it("gives a louder note a bigger brush", () => {
    const quiet = soundToPen({ frequency: 440, clarity: 0.99, volume: 0.05 });
    const loud = soundToPen({ frequency: 440, clarity: 0.99, volume: 0.9 });
    expect(quiet.brush).toBe("thin");
    expect(loud.brush).toBe("thick");
  });

  it("puts a low note in the bottom octave band and a high one on top", () => {
    const low = soundToPen({ frequency: 65, clarity: 0.99, volume: 0.5 });
    const high = soundToPen({ frequency: 440, clarity: 0.99, volume: 0.5 });
    expect(low.lightness).toBeLessThan(high.lightness);
  });

  it("never draws outside the offered octave range", () => {
    for (const frequency of [65, 130, 260, 440, 880]) {
      const pen = soundToPen({ frequency, clarity: 0.99, volume: 0.5 });
      expect(pen.lightness).toBeGreaterThanOrEqual(0);
      expect(pen.lightness).toBeLessThanOrEqual(100);
    }
  });
});

/* ------------------------------- THE CROSS-DIRECTION ROUND TRIP (the point) */

describe("the two directions agree on a colour", () => {
  it("singing a note draws the same hue that would play that note", () => {
    // For each pitch class, ask Direction 2 what colour it draws, then ask
    // Direction 1 what note that colour plays. They must be the same note.
    //
    // Both sides use the SAME scale: quantisation is a deliberate filter, so
    // comparing a pentatonic-quantised hue against a chromatic read-back
    // would fail for the five sharps that the scale removes on purpose.
    for (let pc = 0; pc < 12; pc++) {
      const frequency = midiToFrequency(pitchClassToMidi(pc, 4));
      const pen = soundToPen(
        { frequency, clarity: 0.99, volume: 0.5 },
        { scale: "chromatic" },
      );
      expect(pen.drawing).toBe(true);

      const note = colorToNote({ h: pen.hue, s: 100, l: 50 }, { scale: "chromatic" });
      expect(note.pitchClass).toBe(pc);
    }
  });

  it("quantises both directions to the same scale, so they still agree", () => {
    // With the default (pentatonic) scale, an out-of-scale note must snap to
    // an in-scale note in BOTH directions, and the two must match.
    for (let pc = 0; pc < 12; pc++) {
      const frequency = midiToFrequency(pitchClassToMidi(pc, 4));
      const pen = soundToPen({ frequency, clarity: 0.99, volume: 0.5 });
      expect(pen.drawing).toBe(true);

      const note = colorToNote({ h: pen.hue, s: 100, l: 50 });
      expect(note.pitchClass).toBe(pen.pitchClass);
      expect(SCALES.majorPentatonic.offsets).toContain(note.pitchClass);
    }
  });

  it("stays consistent for every hue in the circle (chromatic)", () => {
    for (let h = 0; h < 360; h += 5) {
      const played = colorToNote({ h, s: 100, l: 50 }, { scale: "chromatic" });
      const drawnHue = pitchClassToHue(played.pitchClass);
      const replayed = colorToNote({ h: drawnHue, s: 100, l: 50 }, { scale: "chromatic" });
      expect(replayed.pitchClass).toBe(played.pitchClass);
    }
  });

  it("soundToColor returns a usable HSL triple when drawing", () => {
    const colour = soundToColor({ frequency: 440, clarity: 0.99, volume: 0.5 });
    expect(colour).not.toBeNull();
    expect(colour.h).toBeGreaterThanOrEqual(0);
    expect(colour.h).toBeLessThan(360);
    expect(colour.l).toBeGreaterThanOrEqual(0);
    expect(colour.l).toBeLessThanOrEqual(100);
  });

  it("soundToColor returns null when the pen is lifted", () => {
    expect(soundToColor({ frequency: 0, clarity: 0, volume: 0 })).toBeNull();
  });
});

/* --------------------------------------------------------------- floors */

describe("velocity floor", () => {
  it("is low enough to allow deliberately quiet strokes", () => {
    expect(VELOCITY_FLOOR).toBeGreaterThan(0);
    expect(VELOCITY_FLOOR).toBeLessThan(0.1);
  });
});
