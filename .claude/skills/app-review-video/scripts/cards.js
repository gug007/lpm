// The still images the render lays over the recording: the device headers
// (both names at 1x, one name while the camera is close on that device), a
// caption band per step, the title and closing cards, and the tap ripple.
const path = require("path");
const { execFileSync } = require("child_process");
const { helper } = require("./session");

const W = 1920;
const H = 1080;
const HEADER = 104;
const FOOTER = 140;
const BG = "#000000";
const ACCENT = "#2f6fed";
const RIPPLE = 120;
const RIPPLE_FRAMES = 14;

const MAC = { title: "lpm for macOS", sub: "The Mac · desktop app" };
const PHONE = { title: "lpm Link", sub: "Physical iPhone · live via iPhone Mirroring" };

const header = (out, labels) => ({
  out,
  w: W,
  h: HEADER,
  bg: BG,
  items: labels.flatMap(({ title, sub, x }) => [
    { text: title, x, y: 22, size: 30, weight: "semibold", align: "center" },
    { text: sub, x, y: 62, size: 19, color: "#8b93a1", align: "center" },
  ]),
});

function ripple(dir) {
  const c = RIPPLE / 2;
  return Array.from({ length: RIPPLE_FRAMES }, (_, i) => {
    const p = i / (RIPPLE_FRAMES - 1);
    const r = 14 + 34 * p;
    const a = (v) => Math.round(255 * v * (1 - p)).toString(16).padStart(2, "0");
    return {
      out: path.join(dir, `ripple-${String(i).padStart(2, "0")}.png`),
      w: RIPPLE,
      h: RIPPLE,
      boxes: [{ x: c - r, y: c - r, w: 2 * r, h: 2 * r, radius: r, color: `${ACCENT}${a(0.35)}`, stroke: `#ffffff${a(0.95)}`, line: 4 }],
    };
  });
}

function cards(dir, { rec, layout, marks, info }) {
  const center = (win) => Math.round(layout.ox + (win.x - rec.rect.x + win.w / 2) * layout.fit);
  const specs = [
    header(path.join(dir, "header-both.png"), [{ ...MAC, x: center(rec.app) }, { ...PHONE, x: center(rec.phone) }]),
    header(path.join(dir, "header-mac.png"), [{ ...MAC, x: W / 2 }]),
    header(path.join(dir, "header-phone.png"), [{ ...PHONE, x: W / 2 }]),
    ...marks.map((m, i) => ({
      out: path.join(dir, `step-${i + 1}.png`),
      w: W,
      h: FOOTER,
      bg: BG,
      boxes: [{ x: layout.ox, y: 30, w: 64, h: 64, color: ACCENT, radius: 16 }],
      items: [
        { text: String(i + 1), x: layout.ox + 32, y: 39, size: 36, weight: "bold", align: "center" },
        { text: m.text, x: layout.ox + 88, y: m.sub ? 22 : 37, size: 36, weight: "semibold" },
        ...(m.sub ? [{ text: m.sub, x: layout.ox + 88, y: 72, size: 23, color: "#a3abb8" }] : []),
      ],
    })),
    {
      out: path.join(dir, "title.png"),
      w: W,
      h: H,
      bg: BG,
      items: [
        { text: `lpm Link ${info.version}`, x: W / 2, y: 300, size: 84, weight: "bold", align: "center" },
        { text: "App Review demo: a physical iPhone paired with the lpm app on a Mac", x: W / 2, y: 420, size: 36, weight: "medium", color: "#d6dae1", align: "center" },
        { text: `Left: lpm for macOS.  Right: lpm Link on a physical ${info.device}, shown live with iPhone Mirroring.`, x: W / 2, y: 520, size: 28, color: "#a3abb8", align: "center" },
        { text: "Not the iOS Simulator. Recorded in real time; waits between steps are shortened.", x: W / 2, y: 564, size: 28, color: "#a3abb8", align: "center" },
        { text: [info.build && `Build ${info.build}`, `Recorded ${info.date}`].filter(Boolean).join("  ·  "), x: W / 2, y: 680, size: 24, color: "#6b7280", align: "center" },
      ],
    },
    {
      out: path.join(dir, "end.png"),
      w: W,
      h: H,
      bg: BG,
      items: [
        { text: "lpm Link controls the user's own Mac running lpm", x: W / 2, y: 360, size: 48, weight: "semibold", align: "center" },
        { text: "Every command runs on that Mac. No account or sign-in is needed.", x: W / 2, y: 450, size: 30, color: "#d6dae1", align: "center" },
        { text: "Without a Mac, tap “No Mac nearby? Try the demo” on the first screen for the built-in Demo Mode.", x: W / 2, y: 510, size: 28, color: "#a3abb8", align: "center" },
        { text: "lpm for macOS is free at lpm.cx", x: W / 2, y: 620, size: 26, color: "#6b7280", align: "center" },
      ],
    },
    ...ripple(dir),
  ];
  execFileSync(helper("card"), { input: JSON.stringify(specs) });
}

module.exports = { cards, W, H, HEADER, FOOTER, RIPPLE };
