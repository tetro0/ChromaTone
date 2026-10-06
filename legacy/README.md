# ChromaTone — legacy hover prototype

This directory holds the original zero-build ChromaTone prototype, kept for
reference while the Vite rewrite in the repository root is being built.

The old model was **hover-driven**: an uploaded image sat on a canvas and the
colour under the mouse pointer was mapped to a note on every move.

    index.html    the old single page
    script.js     colour -> note mapping, Web Audio oscillator, readout
    style.css     old layout and panel styling
    verify.mjs    the browser-skill verification script for this app
    docs/         the original MAPPING.md, describing Directions 1 and 2

The replacement (repository root) changes the interaction model to
**draw-and-playhead**: the user paints strokes on the canvas and a sweeping
playhead plays whatever it passes. The hue mapping also changes from twelve
hue slices to the circle of fifths, and Direction 2 becomes microphone pitch
detection rather than a lightness-based colour mapping.

This code is frozen. It is not maintained, not built, and not served.
