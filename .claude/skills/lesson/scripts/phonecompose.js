// The picture of a lesson with a phone in it: the app window on the left and
// lpm Link's screen on the right in a drawn iPhone, both on the cards' canvas.
// The raw take holds both (one capture around the two windows); the mux crops
// each out of it. A tap on the phone shows as a touch mark, the way iOS screen
// recordings show touches.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Canvas points (the output is ZOOM times this): the app window's box, the
// gap, the phone's screen and the bezel drawn around it. The window itself is
// `app` points, shown a little smaller, so the Mobile devices settings fit.
const PHONE_LAYOUT = { window: { w: 860, h: 562 }, app: { w: 980, h: 640 }, gap: 40, screenH: 640, bezel: 7, radius: 46 };
// lpm Link's screen in device points (iPhone 17).
const DEVICE = { w: 402, h: 874 };
const TOUCH = { r: 22, ms: 420 };

// Output pixels: `mac` is the app window's box, `screen` the phone's screen and
// `outer` the phone with its bezel.
function phoneLayout(out, zoom, device = DEVICE, L = PHONE_LAYOUT) {
  const cw = out.width / zoom;
  const ch = out.height / zoom;
  const sh = L.screenH;
  const sw = Math.round((sh * device.w) / device.h);
  const total = L.window.w + L.gap + sw + 2 * L.bezel;
  const x0 = Math.round((cw - total) / 2);
  const box = (x, y, w, h) => ({ x: x * zoom, y: y * zoom, w: w * zoom, h: h * zoom });
  const sx = x0 + L.window.w + L.gap + L.bezel;
  const sy = Math.round((ch - sh) / 2);
  return {
    mac: box(x0, Math.round((ch - L.window.h) / 2), L.window.w, L.window.h),
    screen: box(sx, sy, sw, sh),
    outer: box(sx - L.bezel, sy - L.bezel, sw + 2 * L.bezel, sh + 2 * L.bezel),
    radius: L.radius * zoom,
    bezel: L.bezel * zoom,
    device,
  };
}

// Device points on the phone's screen → output pixels.
function phonePoint(layout, x, y) {
  return { x: layout.screen.x + (x * layout.screen.w) / layout.device.w, y: layout.screen.y + (y * layout.screen.h) / layout.device.h };
}

// The phone's body and shadow on transparency (frame.png, drawn under the
// screen), the screen's rounded alpha (mask.png) and a touch mark (touch.png),
// drawn once by Chromium and kept in `dir` under a name that carries the look.
async function phoneAssets(dir, { out, layout, zoom }) {
  fs.mkdirSync(dir, { recursive: true });
  const look = crypto.createHash("sha1").update(JSON.stringify([out, layout, TOUCH, 2])).digest("hex").slice(0, 10);
  const file = (kind) => path.join(dir, `phone-${kind}-${look}.png`);
  const assets = { frame: file("frame"), mask: file("mask"), touch: file("touch") };
  if (Object.values(assets).every((f) => fs.existsSync(f))) return assets;
  const { chromium, CHROME } = require("./browser");
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: out, deviceScaleFactor: 1 });
  const { outer, screen, radius, bezel } = layout;
  const z = zoom;
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: transparent; width: ${out.width}px; height: ${out.height}px; overflow: hidden; }
#body { position: absolute; left: ${outer.x}px; top: ${outer.y}px; width: ${outer.w}px; height: ${outer.h}px; box-sizing: border-box;
  border-radius: ${radius + bezel}px; background: #101012; border: ${z}px solid #4a4a50;
  box-shadow: 0 0 0 ${z}px rgba(0,0,0,.18), 0 ${24 * z}px ${70 * z}px ${-18 * z}px rgba(0,0,0,.5), 0 ${6 * z}px ${18 * z}px ${-8 * z}px rgba(0,0,0,.3); }
</style><div id="body"></div>`);
  await page.screenshot({ path: assets.frame, omitBackground: true });
  await page.setViewportSize({ width: screen.w, height: screen.h });
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: #000; width: ${screen.w}px; height: ${screen.h}px; overflow: hidden; }
#s { position: absolute; inset: 0; border-radius: ${radius}px; background: #fff; }
</style><div id="s"></div>`);
  await page.screenshot({ path: assets.mask });
  const d = TOUCH.r * 2 * z;
  await page.setViewportSize({ width: d, height: d });
  await page.setContent(`<!doctype html><style>
html, body { margin: 0; background: transparent; width: ${d}px; height: ${d}px; overflow: hidden; }
#t { position: absolute; inset: ${z}px; border-radius: 50%; background: rgba(120,120,128,.42); border: ${1.5 * z}px solid rgba(255,255,255,.85); box-sizing: border-box; }
</style><div id="t"></div>`);
  await page.screenshot({ path: assets.touch, omitBackground: true });
  await browser.close();
  return assets;
}

// The phone on top of the picture labelled `from`, out as `to`: its body and
// shadow, the screen cropped out of the take (input 0) and masked, and a touch
// mark at every tap. `masks` paint over parts of the screen for a while
// (phonestage.js phoneMask), in a colour or with a picture. `fades.in`/`fades.out` ({ st, d } in seconds)
// bring it in and take it away; `home` hides it while another card holds the
// window; `base` is the index its first input will get.
function phoneLayer({ from, to, base, layout, region, assets, taps = [], masks = [], home = "", fades = {}, captureIn, fps }) {
  const still = (file) => ["-framerate", String(fps), "-loop", "1", "-i", file];
  const inputs = [...still(assets.frame), ...still(assets.mask)];
  const { screen } = layout;
  const fade = [
    fades.in && `fade=t=in:st=${fades.in.st.toFixed(3)}:d=${fades.in.d.toFixed(3)}:alpha=1`,
    fades.out && `fade=t=out:st=${fades.out.st.toFixed(3)}:d=${fades.out.d.toFixed(3)}:alpha=1`,
  ].filter(Boolean).map((f) => `,${f}`).join("");
  const pictures = masks.filter((m) => m.image);
  const parts = [
    `[${base}:v]format=rgba${fade}[pf]`,
    `[${from}][pf]overlay=x=0:y=0${home}[pb]`,
    `[0:v]crop=${region.w}:${region.h}:${region.x}:${region.y},scale=${screen.w}:${screen.h}:${captureIn},format=rgba${maskBoxes(masks, layout)}[${pictures.length ? "pp0" : "ps0"}]`,
    `[${base + 1}:v]format=gray[pm]`,
    `[ps0][pm]alphamerge${fade}[ps]`,
    `[pb][ps]overlay=x=${screen.x}:y=${screen.y}:eof_action=repeat${home}[${taps.length ? "pt0" : to}]`,
  ];
  const len = TOUCH.ms / 1000;
  taps.forEach((tap, i) => {
    inputs.push("-framerate", String(fps), "-loop", "1", "-t", len.toFixed(3), "-i", assets.touch);
    const at = (tap.atMs / 1000).toFixed(3);
    parts.push(
      `[${base + 2 + i}:v]format=rgba,fade=t=in:st=0:d=0.06:alpha=1,fade=t=out:st=${(len - 0.22).toFixed(3)}:d=0.22:alpha=1,setpts=PTS-STARTPTS+${at}/TB[tc${i}]`,
      `[pt${i}][tc${i}]overlay=x=${Math.round(tap.x)}-(w/2):y=${Math.round(tap.y)}-(h/2):eof_action=pass[${i === taps.length - 1 ? to : `pt${i + 1}`}]`,
    );
  });
  const k = screen.w / layout.device.w;
  pictures.forEach((m, j) => {
    const [x, y, w, h] = m.rect.map((v) => Math.round(v * k));
    const len = Math.max(0.04, (m.toMs - m.fromMs) / 1000);
    inputs.push("-framerate", String(fps), "-loop", "1", "-t", len.toFixed(3), "-i", m.image);
    parts.push(
      `[${base + 2 + taps.length + j}:v]scale=${w}:${h},format=rgba,setpts=PTS-STARTPTS+${(m.fromMs / 1000).toFixed(3)}/TB[pi${j}]`,
      `[pp${j}][pi${j}]overlay=x=${x}:y=${y}:eof_action=pass[${j === pictures.length - 1 ? "ps0" : `pp${j + 1}`}]`,
    );
  });
  return { inputs, parts };
}

// drawbox filters for the colour masks, in the screen's own pixels.
function maskBoxes(masks, layout) {
  const k = layout.screen.w / layout.device.w;
  return masks
    .filter((m) => !m.image)
    .map((m) => {
      const [x, y, w, h] = m.rect.map((v) => Math.round(v * k));
      const between = `between(t,${(m.fromMs / 1000).toFixed(3)},${(m.toMs / 1000).toFixed(3)})`;
      return `,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x${m.color.replace("#", "")}@1:t=fill:enable='${between}'`;
    })
    .join("");
}

// A push-in on the window stops short of the phone beside it rather than
// cutting the phone in half, as long as what it pushes in on still fits.
function clearOfPhone(zooms, layout, out) {
  const edge = layout.outer.x - 16;
  return zooms.map((z) => {
    if (z.scale <= 1 || !z.rect || z.rect.x + z.rect.w > layout.mac.x + layout.mac.w) return z;
    const half = out.width / 2 / z.scale;
    if (z.cx + half <= edge || z.cx - half >= layout.outer.x) return z;
    const cx = Math.round(edge - half);
    return cx - half <= z.rect.x ? { ...z, cx } : z;
  });
}

module.exports = { PHONE_LAYOUT, DEVICE, TOUCH, phoneLayout, phonePoint, phoneAssets, phoneLayer, clearOfPhone };
