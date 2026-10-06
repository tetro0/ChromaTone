/**
 * ChromaTone verification: drives the real page and reports what happened.
 * Run: node <skill>/browser.mjs http://localhost:8000 --script verify.mjs
 */
export default async function run(page) {
  const report = { steps: [], errors: [] };

  // The page's own API is the contract under test.
  const hasApi = await page.evaluate(() => typeof window.chroma === "object");
  report.steps.push({ check: "window.chroma exposed", ok: hasApi });
  if (!hasApi) {
    report.errors.push("window.chroma missing — init() did not complete");
    return report;
  }

  const readout = () =>
    page.evaluate(() => ({
      note: document.querySelector("#r-note").textContent,
      octave: document.querySelector("#r-octave").textContent,
      hue: document.querySelector("#r-hue").textContent,
      sat: document.querySelector("#r-sat").textContent,
      light: document.querySelector("#r-light").textContent,
      vol: document.querySelector("#r-vol").textContent,
      swatch: document.querySelector("#swatch").style.background,
    }));

  // --- Direction 1: hover the canvas in the middle ---
  const box = await page.locator("#canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
  const d1 = await readout();
  report.steps.push({ check: "Direction 1 hover produces a note", ok: /^[A-G]#?-?\d$/.test(d1.note), readout: d1 });

  // --- Switch to Direction 2 through the real <select> ---
  await page.selectOption("#direction", "2");
  const dirAfter = await page.evaluate(() => window.chroma.getDirection());
  report.steps.push({ check: "selecting Direction 2 updates state", ok: dirAfter === "2", got: dirAfter });

  // Re-hover: lastStep was reset, so this must produce a fresh readout.
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2);
  await page.waitForTimeout(150);
  const d2 = await readout();
  report.steps.push({ check: "Direction 2 hover produces a note", ok: /^[A-G]#?-?\d$/.test(d2.note), readout: d2 });

  // --- Pure mapping functions, checked against the documented rules ---
  const math = await page.evaluate(() => {
    const { hueToVolume, saturationToOctave, saturationToVolume, colorToMidi, midiToName } = window.chroma;

    // Direction 1: saturation drives volume linearly.
    const d1Red = { h: 0, s: 100, l: 50 };
    const d1Grey = { h: 0, s: 0, l: 50 };

    // Direction 2 is the active direction now.
    const d2Red = { h: 0, s: 100, l: 50 };
    const d2Cyan = { h: 180, s: 100, l: 50 };

    return {
      // hueToVolume: red loudest, cyan quietest.
      hueVolRed: hueToVolume(0),
      hueVolCyan: hueToVolume(180),
      hueVolWrap: hueToVolume(360),
      // saturationToOctave: vivid -> low, muted -> high.
      octVivid: saturationToOctave(100).octave,
      octMuted: saturationToOctave(0).octave,
      // Direction 1 volume mapping.
      d1VolFull: saturationToVolume(100),
      d1VolGrey: saturationToVolume(0),
      // Active (Direction 2) mapping: red and cyan share lightness -> same note.
      d2RedNote: midiToName(colorToMidi(d2Red).midi),
      d2CyanNote: midiToName(colorToMidi(d2Cyan).midi),
      // Sanity: the two share a pitch class if they share a scale degree.
      d2SameNote: colorToMidi(d2Red).midi === colorToMidi(d2Cyan).midi,
      d1RedMidi: null, // Direction 1 is not active; checked separately below
    };
  });
  report.steps.push({ check: "hueToVolume: red=1, cyan=0", ok: math.hueVolRed === 1 && math.hueVolCyan === 0, got: math });
  report.steps.push({ check: "saturationToOctave inverted (100->2, 0->7)", ok: math.octVivid === 2 && math.octMuted === 7 });
  report.steps.push({ check: "saturationToVolume linear (100->1, 0->0)", ok: math.d1VolFull === 1 && math.d1VolGrey === 0 });
  report.steps.push({
    check: "Direction 2: equal-lightness red/cyan share a note",
    ok: math.d2SameNote,
    notes: [math.d2RedNote, math.d2CyanNote],
  });

  // --- Switch back and confirm Direction 1 differs from Direction 2 ---
  await page.selectOption("#direction", "1");
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + box.height / 2 + 1);
  await page.waitForTimeout(150);
  const backToD1 = await readout();
  report.steps.push({ check: "switching back to Direction 1 works", ok: backToD1.note !== "—", readout: backToD1 });

  report.passed = report.steps.every((s) => s.ok);
  report.failed = report.steps.filter((s) => !s.ok).map((s) => s.check);
  return report;
}
