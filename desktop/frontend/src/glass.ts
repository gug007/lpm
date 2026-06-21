import { SetTransparency } from "../bridge/commands";

// The chrome (sidebar / toolbars) tint range. Higher slider = more see-through.
// Floored well above 0 so chrome labels stay legible.
const CHROME_ALPHA_MAX = 0.85;
const CHROME_ALPHA_MIN = 0.3;

// Default interface slider position (≈ the frosted look from design).
export const DEFAULT_INTERFACE_TRANSPARENCY = 50;

// Panels/forms/config surfaces. Floored above 0 so form text stays legible.
const PANEL_ALPHA_FLOOR = 0.4;

function clamp01to100(level: number): number {
  return Math.min(100, Math.max(0, level));
}

// Slider level (0–100) -> chrome background alpha. 0 = most solid, 100 = most
// glassy (but never below the legibility floor).
export function chromeBgAlpha(level: number): number {
  return CHROME_ALPHA_MAX - (clamp01to100(level) / 100) * (CHROME_ALPHA_MAX - CHROME_ALPHA_MIN);
}

// Slider level (0–100) -> panel/form background alpha. 0 = fully opaque, 100 =
// the readability floor.
export function panelBgAlpha(level: number): number {
  return 1 - (clamp01to100(level) / 100) * (1 - PANEL_ALPHA_FLOOR);
}

// Reflect the glass settings onto <html>: `data-glass` toggles glass mode,
// `--glass-chrome-alpha` drives the sidebar tint, `--glass-panel-alpha` the
// content/panel tint. (The terminal canvas is intentionally NOT made
// transparent — xterm's WebGL renderer breaks when allowTransparency is on.)
export function applyGlassDom(
  transparency: boolean,
  interfaceTransparency: number,
  panelTransparency: number,
): void {
  const root = document.documentElement;
  root.setAttribute("data-glass", transparency ? "on" : "off");
  root.style.setProperty("--glass-chrome-alpha", String(chromeBgAlpha(interfaceTransparency)));
  root.style.setProperty("--glass-panel-alpha", String(panelBgAlpha(panelTransparency)));
}

// Full apply: DOM (CSS) plus the native window vibrancy via Rust.
export function applyGlass(
  transparency: boolean,
  interfaceTransparency: number,
  panelTransparency: number,
): void {
  applyGlassDom(transparency, interfaceTransparency, panelTransparency);
  void SetTransparency(transparency).catch(() => {});
}
