# Colour Mapping — how pixels become notes

This is the reference for **how ChromaTone turns a colour into a sound**.
It is split into two *directions*, and both are implemented — the **Direction**
dropdown in the panel switches between them at runtime:

- **Direction 1** — Hue picks the note, Lightness picks the octave, Saturation
  picks the volume.
- **Direction 2** — a richer mapping where Lightness picks the note, Saturation
  picks the octave and Hue picks the volume.

When the direction changes, the last-played pitch is forgotten so a note that
was already sounding under the cursor can retrigger under the new mapping.

---

## Direction 1 — Hue → note

### Hue → note

The colour wheel is divided into 12 slices, so each slice is a semitone.
We use a major scale starting at C4.

| Hue (degrees) | Colour family   | Note |
| ------------- | --------------- | ---- |
| 0 – 30        | Red             | C    |
| 30 – 60       | Orange          | D    |
| 60 – 90       | Yellow          | E    |
| 90 – 120      | Chartreuse      | F    |
| 120 – 150     | Green           | G    |
| 150 – 180     | Spring green    | A    |
| 180 – 210     | Cyan            | B    |
| 210 – 240     | Azure           | C    |
| 240 – 270     | Blue            | D    |
| 270 – 300     | Violet          | E    |
| 300 – 330     | Magenta         | F    |
| 330 – 360     | Rose            | G    |

> Note: hues are wrapped with `% 360`, so a hue of `360` behaves exactly like
> a hue of `0`.

### Lightness → octave

| Lightness (%) | Octave |
| ------------- | ------ |
| 0 – 16.67     | 2      |
| 16.67 – 33.33 | 3      |
| 33.33 – 50    | 4      |
| 50 – 66.67    | 5      |
| 66.67 – 83.33 | 6      |
| 83.33 – 100   | 7      |

- Lightness is read as the **H**SL lightness (0–100), so it matches how we
  already convert colours for the swatches.
- Dark colours therefore sound **deep**, light colours sound **high**.

### Saturation → volume

| Saturation (%) | Volume (0–1) |
| -------------- | ------------ |
| 0              | silent       |
| 100            | loudest      |

- Volume is a straight linear mapping: `volume = saturation / 100`.
- A fully grey pixel (saturation 0) is silent — a grey image is a rest.

### Combination

```
note   = SCALE[ floor( hue / 30 ) ] + octave
volume = saturation / 100
```

The note's own frequency is then derived from the octave, e.g. with the MIDI
formula `frequency = 440 * 2 ** ((midi - 69) / 12)`.

---

## Scales

The scale dropdown lets the user pick the key. `SCALE` is the array of
semitone offsets from the root. Both directions pick a scale degree the same
way — the table below is the shared set of scales.

| Scale name       | Offsets (semitones)                    |
| ---------------- | -------------------------------------- |
| Major            | 0, 2, 4, 5, 7, 9, 11                  |
| Minor (natural)  | 0, 2, 3, 5, 7, 8, 10                  |
| Pentatonic major | 0, 2, 4, 7, 9                         |
| Pentatonic minor | 0, 3, 5, 7, 10                        |
| Blues            | 0, 3, 5, 6, 7, 10                     |
| Whole tone       | 0, 2, 4, 6, 8, 10                     |
| Chromatic        | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |

Because a scale has 7 (or 5) entries but there are 12 slices, the slice index is
wrapped into the scale with `% scale.length`. Under Direction 1 the slice comes
from hue; under Direction 2 it comes from lightness.

---

## Direction 2

The pitch now follows the **tonal** value (lightness) rather than the hue, which
tends to sound more like a melody. Lightness and hue swap jobs relative to
Direction 1, and saturation is reused as the octave.

| Colour property | Maps to | Notes                                          |
| --------------- | ------- | ---------------------------------------------- |
| Lightness       | Note    | Dark → low note, bright → high note            |
| Saturation      | Octave  | Muted → higher octave, vivid → lower octave    |
| Hue             | Volume  | Warm hues (red/orange) play louder             |

### Lightness → note

The 0–100 lightness range is split into 12 slices, exactly like the hue wheel in
Direction 1, and each slice is one step of the scale (so the note still lands in
tune). The slice index is wrapped into the scale with `% scale.length`, so for
the 7-note major scale slices 0–6 and 7–11 repeat the same degrees an octave's
worth of scale-steps apart.

| Lightness (%) | Slice | Degree index (major)       |
| ------------- | ----- | -------------------------- |
| 0 – 8.33      | 0     | 1                          |
| 8.33 – 16.67  | 1     | 2                          |
| …             | …     | …                          |
| 58.33 – 66.67 | 7     | 1 (wrapped)                |
| 91.67 – 100   | 11    | 5 (wrapped)                |

### Saturation → octave

Saturation is split into the six octave bands, but **inverted**: a vivid
(saturated) pixel plays the *low* octave and a muted pixel plays the *high* one.
This was the open question in the original design — "vivid = lower" can be
unintuitive, so it is worth a listening test.

| Saturation (%) | Octave |
| -------------- | ------ |
| 0 – 16.67      | 7      |
| 16.67 – 33.33  | 6      |
| 33.33 – 50     | 5      |
| 50 – 66.67     | 4      |
| 66.67 – 83.33  | 3      |
| 83.33 – 100    | 2      |

### Hue → volume

Hue is read as an **angular distance from red**, so red is loudest and the
volume falls off symmetrically on either side of the wheel:

| Hue (degrees) | Distance from red | Volume (0–1) |
| ------------- | ----------------- | ------------ |
| 0 / 360       | 0                 | 1.00         |
| 90 / 270      | 90                | 0.50         |
| 180           | 180               | 0.00 (silent)|

`volume = 1 - min(hue, 360 - hue) / 180`, clamped to `0 … 1`.

> Because volume no longer comes from saturation, Direction 2 uses a higher
> rest threshold (`MIN_VOLUME_D2 = 0.12` instead of `MIN_VOLUME = 0.02`).
> Without it a near-grey pixel would still whisper at full volume, since its hue
> is meaningless.

### Combination

```
note   = SCALE[ floor( (100 - lightness) / 8.33 ) % len ] + octave(saturation)
volume = 1 - min(hue, 360 - hue) / 180
```

---

## Worked examples

| Colour             | Hue | Sat | Light | Direction 1 result          | Direction 2 result               |
| ------------------ | --- | --- | ----- | --------------------------- | -------------------------------- |
| Pure red `#FF0000` | 0   | 100 | 50    | C5 at full volume           | mid note, octave 2, full volume  |
| Pure blue `#0000FF`| 240 | 100 | 50    | D5 at full volume           | same note, octave 2, **quiet**   |
| Grey `#808080`    | 0   | 0   | 50    | C5, **silent** (sat = 0)   | mid note, octave 7, below rest   |
| Near-white        | any | low | ~100  | High octave, very quiet     | Highest note, high octave        |
| Near-black        | any | low | ~0    | Low octave, very quiet      | Lowest note, high octave         |

> The two directions really do disagree — a vivid blue and a vivid red play the
> *same* note in Direction 2 (they share a lightness) but at very different
> volumes, whereas in Direction 1 they are different notes at the same volume.
> Switching directions on one image is the fastest way to hear the difference.