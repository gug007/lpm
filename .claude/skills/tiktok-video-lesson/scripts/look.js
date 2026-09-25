// The visual design of a vertical lesson, drawn by headless Chromium: the
// canvas the window floats on, the stickers and captions laid over the video,
// and the TikTok safe-zone guides used when reviewing a cut.
const OUT = { width: 1080, height: 1920 };

const FONT = `"SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
const ACCENT = "#25F4EE";
const LIT = "#FFE14D";

const OVERLAY_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${OUT.width}px; height: ${OUT.height}px; background: transparent; overflow: hidden; }
body { font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
#sticker { position: absolute; left: 70px; right: 70px; top: 190px; display: flex; justify-content: center; transform-origin: 50% 0; }
.hook { max-width: 900px; text-align: center; text-wrap: balance; font-weight: 800; font-size: 66px; line-height: 1.42; letter-spacing: -0.01em; }
.hook span { background: #fff; color: #101014; padding: 5px 22px; border-radius: 18px; -webkit-box-decoration-break: clone; box-decoration-break: clone; box-shadow: 0 10px 34px rgba(0,0,0,.28); }
.label { display: inline-flex; align-items: center; gap: 20px; max-width: 880px; padding: 14px 34px 14px 14px; border-radius: 999px; background: rgba(12,12,18,.86); border: 2px solid rgba(255,255,255,.16); box-shadow: 0 14px 40px rgba(0,0,0,.42); color: #fff; font-weight: 760; font-size: 46px; line-height: 1.15; }
.label b { flex: none; display: grid; place-items: center; width: 66px; height: 66px; border-radius: 50%; background: ${ACCENT}; color: #0b0b10; font-weight: 900; font-size: 38px; }
.cta { text-align: center; font-weight: 900; font-size: 96px; line-height: 1.3; letter-spacing: -0.02em; }
.cta span { background: #fff; color: #101014; padding: 6px 34px; border-radius: 26px; box-shadow: 0 14px 44px rgba(0,0,0,.35); }
#caption { position: absolute; left: 80px; right: 80px; top: 1250px; text-align: center; transform-origin: 50% 50%; font-weight: 900; font-size: 82px; line-height: 1.12; letter-spacing: -0.012em; color: #fff; }
#caption span { display: inline-block; margin: 0 0.11em; -webkit-text-stroke: 15px #000; paint-order: stroke fill; text-shadow: 0 8px 26px rgba(0,0,0,.5); }
#caption span.em { color: ${ACCENT}; }
#caption span.on { color: ${LIT}; transform: scale(1.08); }
</style></head><body><div id="sticker"></div><div id="caption"></div></body></html>`;

// Runs in the page: paints one moment of the text track. `p` is how far the
// sticker or caption page has got through its pop-in (0..1).
function paintScene(scene) {
  const backOut = (p) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };
  const sticker = document.getElementById("sticker");
  const caption = document.getElementById("caption");
  sticker.replaceChildren();
  caption.replaceChildren();
  const st = scene.sticker;
  if (st) {
    const box = document.createElement("div");
    box.className = st.kind;
    if (st.kind === "label") {
      const t = document.createElement("div");
      t.textContent = st.text;
      if (st.n != null) {
        const n = document.createElement("b");
        n.textContent = String(st.n);
        box.append(n);
      }
      box.append(t);
    } else {
      const span = document.createElement("span");
      span.textContent = st.text;
      box.append(span);
    }
    sticker.append(box);
    sticker.style.opacity = String(Math.min(1, st.p / 0.4));
    sticker.style.transform = `scale(${0.72 + 0.28 * backOut(st.p)})${st.kind === "hook" ? " rotate(-1.5deg)" : ""}`;
  }
  const cap = scene.caption;
  if (cap) {
    cap.words.forEach(([text, emph], i) => {
      const span = document.createElement("span");
      span.textContent = text;
      if (i === cap.active) span.className = "on";
      else if (emph) span.className = "em";
      caption.append(span);
    });
    caption.style.opacity = String(Math.min(1, cap.p / 0.35));
    caption.style.transform = `translateY(-50%) scale(${0.84 + 0.16 * backOut(cap.p)})`;
  }
}

// The canvas the window floats on: near-black with soft cyan, pink and violet
// glows, and the window's shadow where the capture will sit.
function backdropHtml(g, radius) {
  const { w: cw, h: ch } = g.canvas;
  const glow = (color, x, y, size) =>
    `<div style="position:absolute;left:${x * cw - (size * cw) / 2}px;top:${y * ch - (size * cw) / 2}px;width:${size * cw}px;height:${size * cw}px;border-radius:50%;background:radial-gradient(closest-side, ${color}, transparent);"></div>`;
  return `<!doctype html><html><head><style>
html, body { margin: 0; width: ${cw}px; height: ${ch}px; overflow: hidden; background: #0b0b10; }
#box { position: absolute; left: ${g.ox}px; top: ${g.oy}px; width: ${g.win.w}px; height: ${g.win.h}px; border-radius: ${radius}px; background: #141418; box-shadow: 0 0 0 3px rgba(255,255,255,.08), 0 ${ch * 0.02}px ${ch * 0.05}px -${ch * 0.004}px rgba(0,0,0,.75), 0 ${ch * 0.006}px ${ch * 0.012}px rgba(0,0,0,.5); }
</style></head><body>
${glow("rgba(37,244,238,.30)", 0.18, 0.2, 1.3)}
${glow("rgba(254,44,85,.26)", 0.85, 0.8, 1.35)}
${glow("rgba(124,92,255,.24)", 0.2, 0.72, 1.0)}
<div id="box"></div></body></html>`;
}

function maskHtml(g, radius) {
  return `<!doctype html><html><head><style>
html, body { margin: 0; width: ${g.win.w}px; height: ${g.win.h}px; overflow: hidden; background: #000; }
#box { position: absolute; inset: 0; border-radius: ${radius}px; background: #fff; }
</style></head><body><div id="box"></div></body></html>`;
}

// Where TikTok's own interface covers a 1080x1920 video on a phone: the tabs
// at the top, the action column on the right, the caption and sound at the
// bottom. Review only; never in the video.
const GUIDES_HTML = `<!doctype html><html><head><style>
html, body { margin: 0; width: ${OUT.width}px; height: ${OUT.height}px; background: transparent; overflow: hidden; font: 700 34px ${FONT}; color: #fff; }
.z { position: absolute; background: rgba(255,40,70,.34); outline: 3px dashed rgba(255,255,255,.7); outline-offset: -3px; display: flex; align-items: center; justify-content: center; }
</style></head><body>
<div class="z" style="left:0;top:0;width:1080px;height:150px">tabs</div>
<div class="z" style="left:950px;top:700px;width:130px;height:800px">icons</div>
<div class="z" style="left:0;top:1500px;width:1080px;height:420px">caption · sound</div>
</body></html>`;

module.exports = { OUT, OVERLAY_HTML, paintScene, backdropHtml, maskHtml, GUIDES_HTML };
