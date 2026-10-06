/**
 * ChromaTone — colour to sound.
 *
 * Two mappings are available and switchable at runtime:
 *   Direction 1 — Hue -> note, Lightness -> octave, Saturation -> volume.
 *   Direction 2 — Lightness -> note, Saturation -> octave, Hue -> volume.
 * See docs/MAPPING.md for the reference tables.
 */

const SCALES = {
  major: { name: "Major", offsets: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "Minor (natural)", offsets: [0, 2, 3, 5, 7, 8, 10] },
  pentatonicMajor: { name: "Pentatonic major", offsets: [0, 2, 4, 7, 9] },
  pentatonicMinor: { name: "Pentatonic minor", offsets: [0, 3, 5, 7, 10] },
  blues: { name: "Blues", offsets: [0, 3, 5, 6, 7, 10] },
  wholeTone: { name: "Whole tone", offsets: [0, 2, 4, 6, 8, 10] },
  chromatic: { name: "Chromatic", offsets: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

// Indexed by pitch class (0-11) so any midi note resolves to a name.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const ROOT_MIDI = 36; // C2, the lowest octave the lightness mapping can reach
const HUE_SLICES = 12;
const OCTAVES = [2, 3, 4, 5, 6, 7];
const MAX_HUE_STEP_MS = 40; // throttle so fast mouse moves don't buzz
// A fully grey pixel is a rest, not a click of noise.
// Direction 2 gets a louder rest threshold: its volume comes from hue, so a
// near-grey pixel would otherwise whisper at full volume.
const MIN_VOLUME = 0.02;
const MIN_VOLUME_D2 = 0.12;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const dropzone = document.getElementById("dropzone");
const playhead = document.getElementById("playhead");
const fileInput = document.getElementById("file");
const scaleSelect = document.getElementById("scale");
const directionSelect = document.getElementById("direction");
const masterVolume = document.getElementById("volume");
const swatch = document.getElementById("swatch");
const out = {
  note: document.getElementById("r-note"),
  octave: document.getElementById("r-octave"),
  hue: document.getElementById("r-hue"),
  sat: document.getElementById("r-sat"),
  light: document.getElementById("r-light"),
  vol: document.getElementById("r-vol"),
};

let scale = SCALES.major;
let direction = "1";
let audioCtx = null;
let masterGain = null;
let lastStep = -1;
let lastPlayedAt = 0;

/* ---------------------------------------------------------------- colour */

/** @param {number} r @param {number} g @param {number} b */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

/** Hue slice 0-11 -> scale degree, wrapping into the scale length. */
function hueToScaleDegree(hue) {
  const wrapped = ((hue % 360) + 360) % 360;
  const slice = Math.floor((wrapped / 360) * HUE_SLICES);
  return scale.offsets[slice % scale.offsets.length];
}

/** Lightness 0-100 -> octave 2-7. */
function lightnessToOctave(lightness) {
  const idx = Math.min(OCTAVES.length - 1, Math.floor((lightness / 100) * OCTAVES.length));
  return { octave: OCTAVES[idx], idx };
}

/** Saturation 0-100 -> linear volume 0-1. */
function saturationToVolume(saturation) {
  return Math.min(1, Math.max(0, saturation / 100));
}

/* Direction 2 helpers ------------------------------------------------
 * Here the roles are swapped: lightness picks the pitch, saturation picks
 * the octave, and hue plays the part of loudness. */

/** Lightness 0-100 -> scale degree, quantised to a slice of the scale. */
function lightnessToScaleDegree(lightness) {
  const clamped = Math.min(100, Math.max(0, lightness));
  const slice = Math.min(HUE_SLICES - 1, Math.floor((clamped / 100) * HUE_SLICES));
  return scale.offsets[slice % scale.offsets.length];
}

/** Saturation 0-100 -> octave 2-7 (vivid = lower, muted = higher). */
function saturationToOctave(saturation) {
  const clamped = Math.min(100, Math.max(0, saturation));
  const idx = OCTAVES.length - 1 - Math.floor((clamped / 100) * OCTAVES.length);
  return { octave: OCTAVES[idx], idx };
}

/** Hue 0-360 -> volume 0-1; red/orange are loudest, cyan/blue softest. */
function hueToVolume(hue) {
  const wrapped = ((hue % 360) + 360) % 360;
  const distance = Math.min(wrapped, 360 - wrapped);
  return Math.max(0, 1 - distance / 180);
}

/** Quantise a value to reduce jitter in the MIDI readout. */
function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** Active mapping: chooses Direction 1 or Direction 2. */
function colorToMidi(hsl) {
  if (direction === "2") return colorToMidiD2(hsl);
  return colorToMidiD1(hsl);
}

function colorToMidiD1(hsl) {
  const { octave } = lightnessToOctave(hsl.l);
  const degree = hueToScaleDegree(hsl.h);
  // C2 is midi 36, so the octave band just adds one octave per step up.
  const midi = ROOT_MIDI + degree + (octave - OCTAVES[0]) * 12;
  return { midi, octave, degree };
}

function colorToMidiD2(hsl) {
  const { octave } = saturationToOctave(hsl.s);
  const degree = lightnessToScaleDegree(hsl.l);
  const midi = ROOT_MIDI + degree + (octave - OCTAVES[0]) * 12;
  return { midi, octave, degree };
}

/** Active mapping: the pixel's loudness under the chosen direction. */
function colorToVolume(hsl) {
  if (direction === "2") return hueToVolume(hsl.h);
  return saturationToVolume(hsl.s);
}

/** Volume floor for the active direction. */
function minVolume() {
  return direction === "2" ? MIN_VOLUME_D2 : MIN_VOLUME;
}

function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToName(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

/* ----------------------------------------------------------------- audio */

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = Number(masterVolume.value);
  masterGain.connect(audioCtx.destination);
}

function playNote(midi, volume) {
  if (!audioCtx || volume < MIN_VOLUME) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(midiToFrequency(midi), now);

  const peak = Math.min(0.35, volume * masterVolume.value);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.4);
}

/* --------------------------------------------------------------- readout */

function updateReadout(hsl, midi, volume) {
  swatch.style.background = hsl
    ? `hsl(${hsl.h.toFixed(0)}, ${hsl.s.toFixed(0)}%, ${hsl.l.toFixed(0)}%)`
    : "#000";
  out.note.textContent = midi === null ? "—" : midiToName(midi);
  out.octave.textContent = midi === null ? "—" : midiToName(midi).replace(/[^0-9]/g, "");
  out.hue.textContent = hsl ? `${hsl.h.toFixed(0)}°` : "—";
  out.sat.textContent = hsl ? `${hsl.s.toFixed(0)}%` : "—";
  out.light.textContent = hsl ? `${hsl.l.toFixed(0)}%` : "—";
  out.vol.textContent = volume === null ? "—" : volume.toFixed(2);
}

/* ----------------------------------------------------------- interactions */

function readPixelAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return ctx.getImageData(x, y, 1, 1).data;
}

function onPointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  playhead.hidden = false;
  playhead.style.left = `${event.clientX - rect.left}px`;
  playhead.style.top = `${event.clientY - rect.top}px`;

  const data = readPixelAt(event.clientX, event.clientY);
  if (!data) return;

  const hsl = rgbToHsl(data[0], data[1], data[2]);
  const { midi } = colorToMidi(hsl);
  const volume = colorToVolume(hsl);
  updateReadout(hsl, midi, volume);

  // Repeat a note only when the pitch actually changes, so holding still is
  // silent instead of droning.
  const now = performance.now();
  if (midi === lastStep || now - lastPlayedAt < MAX_HUE_STEP_MS) return;
  if (volume < minVolume()) return; // rest: still update the readout above
  lastStep = midi;
  lastPlayedAt = now;
  playNote(midi, volume);
}

function onPointerLeave() {
  playhead.hidden = true;
  lastStep = -1;
  updateReadout(null, null, null);
}

/* ----------------------------------------------------------------- image */

function drawImageToCanvas(source, width, height) {
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  dropzone.classList.add("hidden");
}

function loadImageFromFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxW = 1200;
    const ratio = Math.min(1, maxW / img.naturalWidth);
    drawImageToCanvas(img, Math.round(img.naturalWidth * ratio), Math.round(img.naturalHeight * ratio));
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/** Painted fallback so the page is playable with no upload. */
function drawSampleImage() {
  const w = 720;
  const h = 480;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  for (let i = 0; i <= 24; i++) {
    gradient.addColorStop(i / 24, `hsl(${i * 15}, 80%, ${20 + (i * 60) / 24}%)`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  // No text here on purpose: the drop overlay already says what to do, and a
  // painted caption would clash with it.
}

/* ------------------------------------------------------------------ init */

function init() {
  for (const [key, def] of Object.entries(SCALES)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = def.name;
    scaleSelect.append(option);
  }
  scaleSelect.value = "major";
  scale = SCALES.major;

  scaleSelect.addEventListener("change", () => {
    scale = SCALES[scaleSelect.value] || SCALES.major;
  });

  masterVolume.addEventListener("input", () => {
    if (masterGain) masterGain.gain.value = Number(masterVolume.value);
  });

  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("mouseleave", onPointerLeave);
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches[0]) onPointerMove(e.touches[0]);
  });

  directionSelect.value = "1";
  directionSelect.addEventListener("change", () => {
    direction = directionSelect.value === "2" ? "2" : "1";
    // A different note may now sit under the cursor; forget the last pitch so
    // the next move through this pixel is allowed to sound.
    lastStep = -1;
  });

  fileInput.addEventListener("change", () => loadImageFromFile(fileInput.files[0]));

  for (const type of ["dragenter", "dragover"]) {
    document.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragging");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    document.addEventListener(type, () => dropzone.classList.remove("dragging"));
  }
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    loadImageFromFile(e.dataTransfer?.files?.[0]);
  });

  // Browsers only allow audio after a user gesture.
  const unlock = () => ensureAudio();
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  drawSampleImage();
  updateReadout(null, null, null);

  // Handy for debugging from the console / automated checks.
  window.chroma = {
    rgbToHsl,
    colorToMidi,
    midiToName,
    hueToScaleDegree,
    saturationToVolume,
    lightnessToScaleDegree,
    saturationToOctave,
    hueToVolume,
    getDirection: () => direction,
  };
}

init();
