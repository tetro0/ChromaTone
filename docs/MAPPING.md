# Colour Mapping — how pixels become notes

This is the reference for **how ChromaTone turns a colour into a sound**.
It is split into two *directions*:

- **Direction 1 (what we have now)** — Hue picks the note, Lightness picks the
  octave, Saturation picks the volume.
- **Direction 2 (planned)** — a richer mapping where Lightness picks the note,
  Saturation picks the octave and Hue picks the volume.

---

## Direction 1 — the current mapping

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
semitone offsets from the root; Direction 1 uses a major scale.

| Scale name       | Offsets (semitones)                    |
| ---------------- | -------------------------------------- |
| Major            | 0, 2, 4, 5, 7, 9, 11                  |
| Minor (natural)  | 0, 2, 3, 5, 7, 8, 10                  |
| Pentatonic major | 0, 2, 4, 7, 9                         |
| Pentatonic minor | 0, 3, 5, 7, 10                        |
| Blues            | 0, 3, 5, 6, 7, 10                     |
| Whole tone       | 0, 2, 4, 6, 8, 10                     |
| Chromatic        | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |

Because a scale has 7 (or 5) entries but the wheel has 12 slices, the hue
index is wrapped into the scale with `% scale.length`.

---

## Direction 2 — planned

The idea is to invert the mapping so that pitch follows the **tonal** value
(lightness) rather than the hue, which tends to sound more like a melody.

| Colour property | Maps to  | Notes                                        |
| --------------- | -------- | -------------------------------------------- |
| Lightness       | Note      | Dark → low note, bright → high note           |
| Saturation      | Octave    | Muted → higher octave, vivid → lower octave   |
| Hue             | Volume    | The warm hues (red/orange) play louder         |

### Open questions to settle

1. Should lightness map **linearly** to pitch, or to a musical scale so every
   colour still lands on a note that sounds in tune?
2. Which direction should saturation→octave go? "Vivid = lower" can be
   unintuitive, so this needs a listening test.
3. Should the two directions be switchable at runtime, so the user can hear the
   difference on the same image?

---

## Worked examples

| Colour             | Hue | Sat | Light | Direction 1 result          |
| ------------------ | --- | --- | ----- | --------------------------- |
| Pure red `#FF0000` | 0   | 100 | 50    | C5 at full volume           |
| Pure blue `#0000FF`| 240 | 100 | 50    | D5 at full volume           |
| Grey `#808080`    | 0   | 0   | 50    | C5, **silent** (sat = 0)   |
| Near-white        | any | low | ~100  | High octave, very quiet     |
| Near-black        | any | low | ~0    | Low octave, very quiet      |