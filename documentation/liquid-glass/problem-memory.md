# Liquid Glass — Terminal Transparency Problem Memory

> Terminal background won't go translucent in glass mode; latest attempt also
> turned the terminal solid black (lost its theme color).
> Last updated: 2026-06-21

---

## Problem: Terminal transparency never works (and now renders black)

### Type: Bug (built on a false assumption)

### Status: RESOLVED — terminal transparency abandoned (category proven dead)

## FINAL root cause (the dead category)

The earlier "it works" red-test was on a Cmd+R (HMR) state with live PTY sessions,
which masked the truth. A FULL dev restart exposed it:
- `allowTransparency: true` → terminal renders EMPTY on cold start (WebGL texture
  atlas paints nothing on first frame).
- `allowTransparency: false` + an `rgba()` theme background → xterm fails to make
  it opaque and falls back to its default → pure BLACK / white, no theme.
- Only safe combo: `allowTransparency: false` + a `#hex` background = normal
  themed terminal, but NO transparency.

There is no third option: the ONLY way to see through the xterm canvas is
allowTransparency, and it breaks rendering in this stack (xterm 6.1-beta +
addon-webgl 0.20-beta). **Category proven dead.** Terminal transparency removed.

## Final solution
- Removed the Terminal transparency slider + all its plumbing
  (terminalTransparency setting, terminalBgAlpha/terminalThemeBackground/hexToRgba,
  --terminal-alpha, the getTerminalTheme alpha branch, allowTransparency).
- Terminals render exactly as baseline (opaque, themed).
- Glass = Interface (sidebar/toolbars) + Panel (forms/config) transparency, both
  pure CSS, both reliable. Native window vibrancy stays.
- tsc clean, 98 tests pass.

## Lesson for CLAUDE.md (proposed)
- xterm.js WebGL renderer (current beta) cannot render a transparent canvas:
  `allowTransparency:true` blanks the terminal on cold start; an rgba theme bg
  without it renders black. Don't attempt terminal background transparency.
- When testing Tauri rendering changes, ALWAYS full-restart `tauri dev` — Cmd+R
  keeps live PTY/WebGL state and masks cold-start bugs.

## Why the solution works (historical)

The forced `rgba(255,0,0,0.5)` test rendered as **translucent red with visible
text** in both terminals — proving definitively that **xterm honors background
transparency** (allowTransparency + rgba theme). My 4-attempt-long belief that
"xterm ignores transparency, must disable WebGL" was FALSE from the start, and
the WebGL-disposal machinery built on it is what produced the black/no-color
terminal (now removed).

The real reasons the user saw "nothing":
1. The webgl-dispose breakage (black) — fixed by removing that machinery.
2. Dark-on-dark invisibility: the actual terminal bg `#2b2b2b` at 0.55 alpha over
   a dark frosted backdrop is nearly indistinguishable from opaque. Fixed by
   lowering TERMINAL_ALPHA_FLOOR 0.55 → 0.4 so max is clearly see-through.

Final mechanism (simple, the whole time): `allowTransparency: true` on the
Terminal + alpha baked into the themeOverride background (TerminalView
`terminalThemeBackground`). No renderer swapping. WebGL stays on.

### Cleanup done
- Removed all WebGL runtime machinery + the per-pane effect (earlier).
- Removed all [GLASS-DBG] diagnostics (glass.ts / TerminalView / InteractivePane).
- Lowered terminal alpha floor to 0.4. tsc clean, 105 tests pass.

### Secondary (still open): "Panel transparency" slider
Proven via logs to correctly set `--bg-primary` rgba, but Settings panels are
border-only (no --bg-primary fill) so the change isn't visible there. Needs the
right target surfaces (modals/config editors) — separate small follow-up.

---
(historical) Status: Apply step PROVEN correct — isolating the render

[GLASS-DBG] with terminal VISIBLE (global terminals `__global__-7..10`):
```
InteractivePane applying theme: hasThemeOverride: true,
background: "rgba(43, 43, 43, 0.7075)", foreground: "#c8c8c8"
```
→ The translucent theme IS reaching xterm via term.options.theme. Wiring + apply
are CORRECT. The bug is in how xterm RENDERS the rgba bg (or what's behind it).

Also confirmed from full applyGlassDom dump: all CSS vars set correctly
(--bg-primary rgba(26,26,26,0.82), --bg-sidebar rgba(...,0.30), --terminal-alpha
0.7075). The Panel slider DOES change --bg-primary; it just "does nothing"
because the Settings panels don't fill with --bg-primary. (Secondary, fix later.)

GlobalTerminalsView terminal container is transparent (themeStyle = CSS vars
only, no bg fill) — so backdrop is likely not the blocker.

### Experiment running: forced `rgba(255,0,0,0.5)` terminal bg

terminalThemeBackground temporarily returns bright half-transparent red to see
what xterm actually paints. Outcome table:
- translucent red → alpha works, fix backdrop
- solid red → xterm ignores alpha → need CSS-layer approach under the canvas
- black/no red → theme not reaching renderer → need refresh/recreate
- red but text gone → WebGL+transparency text bug

[GLASS-DBG] evidence (slider drag on Settings screen):
- `applyGlassDom` fires with correct values (transparency:true, sliders change). ✅
- `TerminalView xtermTheme` computes correct `rgba(43,43,43,0.57..)`. ✅
- `InteractivePane applying theme` — **NEVER logs.** ❌

So TerminalView builds the right translucent theme but InteractivePane never
applies it → terminal shows xterm's built-in default (pure black/white, no theme
colors), matching the user's exact words. BUT the logs were captured while on the
Settings screen, where the terminal's InteractivePane may be unmounted — so the
silence may be expected. Need the InteractivePane log captured WHILE a terminal is
visible to know if it's an apply bug or just a not-mounted artifact.

NEXT OBSERVATION NEEDED: with a terminal visible (and some colored output), drag
the Terminal slider and report (a) `[GLASS-DBG] InteractivePane applying theme`
lines, (b) does the bg change, (c) are there ANY colors in the output.

After removing the WebGL machinery, user reports it got WORSE:
- Terminal: "чёрный чёрный фон и белый белый текст, вообще нет цветов темы" =
  PURE black bg + PURE white text, NO theme colors at all (= xterm's built-in
  default theme, i.e. NO theme is being applied — not even getTerminalTheme's
  #0d0d0d fallback).
- Settings window LOST the glass transparency it had earlier (not slider-driven).
- Terminal + Panel sliders do nothing.
- ONLY the Interface (sidebar) slider works.

Critical: "pure black + pure white + no colors" matches NO value my code can
produce (themeOverride = theme color; getTerminalTheme fallback = #0d0d0d/#ccc).
This means the running app is NOT executing my current code on those terminals —
almost certainly HMR zombie xterm sessions (this module was hot-edited 6+ times,
and it holds module-level session state + live xterm instances).

### Unverified-until-now assumption (the real crack)

"The running app reflects my current source." NEVER verified. Every fix was
judged against a possibly-stale HMR state. Added [GLASS-DBG] console logging in
glass.ts / TerminalView / InteractivePane to capture actual runtime values.

### Experiment (awaiting user)

1. FULLY quit `npm run tauri dev` (not Cmd+R) and relaunch — kills HMR zombies.
2. Open the webview devtools console (right-click → Inspect).
3. Toggle Transparency + drag each slider; report the `[GLASS-DBG]` lines.
This tells us: what theme/background each terminal actually receives, and the
real computed CSS vars — turning blind theorizing into observation.

Removed all runtime WebGL machinery (session fields, load/dispose helpers,
`applyTerminalGlass`, the per-pane transparency effect, the settings store
imports in InteractivePane) and restored the original unconditional WebGL load.
Kept `allowTransparency: true` + alpha baked into `xtermTheme.background`.
tsc clean, 105 tests pass.

### What the user actually wants

"терминалу не получается вообще дать прозрачность ... он сейчас кажется даже
потерял цвет который ему тема задает и просто чёрный фон показывает ... вот эти 2
нижние опции ничего не делают" — the Terminal transparency slider should make the
terminal background see-through (showing the frosted glass behind it) while
keeping the theme colors; right now it does nothing and the terminal is black.

### Success criteria

Dragging "Terminal transparency" 0→100 visibly fades the terminal background from
solid theme color to translucent (frosted glass shows through), text stays
readable, and the theme colors are never lost.

### Root cause of repeated failure

Two compounding mistakes:

1. **The real blocker (rounds 1–3):** interactive terminals get their background
   from an explicit `themeOverride` ITheme built in `TerminalView` (solid
   `colors.bg`). Every alpha mechanism I added elsewhere (getTerminalTheme
   `--terminal-alpha`, the per-pane observer) was *bypassed* because themeOverride
   takes precedence. Fixed in round 4 by baking alpha into `xtermTheme`.

2. **The false assumption that made it worse (round 4):** I believed "WebGL
   ignores `allowTransparency`, so glass mode must dispose the WebGL addon at
   runtime and fall back to the DOM renderer." This is an outdated xterm-4.x
   fact. **Disproved** by the installed addon source (see Evidence). Disposing
   `WebglAddon` mid-session left the canvas in a broken state → solid black,
   theme color gone. This webgl machinery is unnecessary AND harmful.

### Evidence (decisive)

`node_modules/@xterm/addon-webgl/lib/addon-webgl.js` (v0.20.0-beta, paired with
`@xterm/xterm` 6.1.0-beta):

```
allowTransparency||(r=o.color.opaque(r))   // forces opaque ONLY when allowTransparency is false
allowTransparency&&(_=o.color.opaque(_     // preserves alpha when allowTransparency is true
allowTransparency?this._ctx.clearRect(...) // clears to transparent
```

→ WebGL honors transparency when `allowTransparency: true`. No renderer swap is
needed. The disposal was the bug.

### What's been tried

#### Attempt 1: `getTerminalTheme` reads `--terminal-alpha`, converts hex→rgba
- Hypothesis: terminal bg comes from `getTerminalTheme(el)` reading `--terminal-bg`.
- Result: no change. **Signal:** interactive terminals don't use getTerminalTheme
  for their visible bg — they use `themeOverride`.

#### Attempt 2: per-pane effect + global observer re-applying getTerminalTheme
- Result: no change. **Signal:** same bypass — themeOverride wins.

#### Attempt 3: dispose WebGL on toggle + `applyTerminalGlass` over all sessions
- Hypothesis: WebGL is opaque; force DOM renderer.
- Result: no change first, then terminal went BLACK. **Signal:** disposing WebGL
  mid-session breaks rendering; and WebGL was never the blocker.

#### Attempt 4: bake alpha into `xtermTheme.background` in TerminalView
- Hypothesis (correct part): the themeOverride is the real bg path.
- Result: still black because the harmful WebGL disposal from attempt 3 remained.
- **Signal:** the alpha path is right; the webgl machinery must be removed.

### The fix (this round)

- Keep `allowTransparency: true` on the interactive Terminal.
- Keep alpha baked into `xtermTheme.background` (TerminalView `terminalThemeBackground`).
- **Remove** all runtime WebGL machinery: `wantWebgl`, `webgl` session fields,
  `loadWebglAddon`/`disposeWebglAddon` gating, `applyTerminalGlass`, and the
  per-pane `[transparency, terminalTransparency]` effect. Restore the original
  unconditional WebGL load. WebGL + allowTransparency + rgba bg just works.

### Key files

- `src/components/TerminalView.tsx` — builds `xtermTheme` (the themeOverride). THE bg path.
- `src/components/InteractivePane.tsx` — `allowTransparency`, themeOverride effect, the webgl machinery to delete.
- `src/glass.ts` — alpha mappings (terminal/chrome/panel).
- `src/styles/globals.css` — glass CSS variables.
- `src/components/Settings.tsx` — the three sliders + handlers.

### Key constraints

- DO NOT dispose/swap the WebGL addon at runtime — it breaks rendering.
- Terminal alpha must flow through `themeOverride` (TerminalView), not getTerminalTheme.

### Open secondary issue: "Panel transparency" slider appears to do nothing

Likely because the Settings panels the user tested have no `--bg-secondary`/
`--bg-primary` fill (they're border-only and already show glass-main). Revisit
after the terminal fix: confirm which surfaces forms/config editors actually use.
