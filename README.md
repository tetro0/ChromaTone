# ChromaTone

**Turn the colours in an image into music.**

ChromaTone is a browser toy that plays a colour palette. Load a photo, move the
mouse across it, and each pixel you touch is turned into a note — the colour's
hue picks the note, how light it is picks the octave, and how saturated it is
picks how loud it sounds.

> 🎓 A hobby project, built as a way to learn the Canvas API, Web Audio and Git.

## 🎬 Demo

![Demo GIF — hover-to-play in action](docs/demo.gif)

> **TODO:** record a short screen capture of hovering over an image and add it
> to `docs/demo.gif`. Until then this section shows a broken image, which is
> expected.

**Live demo:** <https://tetro0.github.io/chromatone/> — _coming soon_ (not
deployed yet).

---

## How colour becomes sound

| Colour property | Becomes | Rule |
| --------------- | ------- | ---- |
| **Hue**         | Note    | The colour wheel is split into 12 slices; each slice is one step of the scale. Red = C, orange = D, yellow = E, … |
| **Lightness**   | Octave  | The lightness of the pixel picks the octave — dark pixels play low, light pixels play high. |
| **Saturation**  | Volume  | A grey (unsaturated) pixel is quiet; a vivid pixel is loud. Volume = saturation ÷ 100. |

Full tables, the scale list and the planned **Direction 2** mapping live in
[docs/MAPPING.md](docs/MAPPING.md).

---

## Features

- [x] **Hover-to-play** — move the mouse over the image to play its colour
- [ ] **Lightness → octave** — make brightness control pitch height _(next step)_
- [ ] **Saturation → volume** — make vividness control loudness _(next step)_
- [ ] **Scale dropdown** — choose between major, minor, pentatonic, blues, whole tone
- [ ] **Drag-and-drop upload** — drop an image anywhere on the page
- [ ] **Playhead** — a marker showing where the "playback" is in the image
- [ ] **Deploy** — publish to GitHub Pages
- [ ] **Direction 2** — invert the mapping so lightness picks the note

---

## Running it locally

No build step yet — ChromaTone is plain HTML, CSS and JavaScript for now.

1. **Clone the repo**

   ```bash
   git clone https://github.com/tetro0/chromatone.git
   cd chromatone
   ```

2. **Serve the folder.** Open the folder in **VS Code** and start the
   [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
   extension (right-click `index.html` → *Open with Live Server*).

   Or use any static server from the terminal:

   ```bash
   python3 -m http.server 8000
   ```

   > Opening `index.html` directly with `file://` may block the browser's audio
   > features, which is why a local server is recommended.

---

## Tech stack

| Technology     | Used for                                    |
| -------------- | ------------------------------------------- |
| **JavaScript** | All the logic                               |
| **Canvas API** | Reading pixels and drawing the image        |
| **Tone.js**    | Web Audio wrapper — playing the notes       |
| **Vite**       | Planned dev server and bundler (not yet added) |

---

## What I learned

- Reading a colour out of a canvas: `ctx.getImageData()` gives every pixel as
  R, G, B, A bytes, which then convert to HSL.
- **Browsers block audio until you interact with the page**, so the first note
  can only play after a click or a mousemove.
- Mapping a continuous value onto a small set of notes needs a deliberate
  choice — that's why the wheel is split into 12 slices rather than mapped
  continuously.
- Git basics: committing small changes and pushing often keeps the history
  readable and makes it easy to undo a mistake.

---

## License

Released under the [MIT License](LICENSE) © 2026 Tetro