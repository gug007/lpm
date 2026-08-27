import { ListMonospaceFonts } from "../../../bridge/commands";

const CANDIDATES = [
  "SF Mono",
  "Menlo",
  "Monaco",
  "JetBrains Mono",
  "JetBrainsMono Nerd Font",
  "Fira Code",
  "Fira Mono",
  "Hack",
  "Source Code Pro",
  "IBM Plex Mono",
  "Cascadia Code",
  "Consolas",
  "Inconsolata",
  "Roboto Mono",
  "Ubuntu Mono",
  "Space Mono",
  "PT Mono",
  "Iosevka",
  "Victor Mono",
  "Geist Mono",
  "Commit Mono",
  "Berkeley Mono",
  "MesloLGS NF",
  "Operator Mono",
  "Input Mono",
  "MonoLisa",
  "Andale Mono",
  "Courier New",
];

const BASE_FONTS = ["monospace", "sans-serif", "serif"];
const PROBE_TEXT = "mmmmmmmmmmlliWWi@10O";
const PROBE_SIZE = 72;

let probed: string[] | null = null;

// A font the OS doesn't have falls back to the base family, so identical
// widths against every base means the name never resolved.
export function detectMonospaceFonts(): string[] {
  if (probed) return probed;

  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [];

  const measure = (family: string): number => {
    ctx.font = `${PROBE_SIZE}px ${family}`;
    return ctx.measureText(PROBE_TEXT).width;
  };

  const baseWidths = BASE_FONTS.map(measure);
  probed = CANDIDATES.filter((name) =>
    BASE_FONTS.some(
      (base, i) => measure(`'${name}', ${base}`) !== baseWidths[i],
    ),
  );
  return probed;
}

// Backend names win on casing; probed names fill in families whose monospace
// trait Core Text doesn't report (patched Nerd Fonts) and cover platforms
// where the backend has no font enumeration.
export function mergeFontLists(installed: string[], fallback: string[]): string[] {
  const seen = new Set(installed.map((n) => n.toLowerCase()));
  const merged = [...installed];
  for (const name of fallback) {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      merged.push(name);
    }
  }
  return merged.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

let fonts: Promise<string[]> | null = null;

export function listMonospaceFonts(): Promise<string[]> {
  if (!fonts) {
    fonts = ListMonospaceFonts()
      .then((r: unknown) =>
        Array.isArray(r) ? r.filter((n): n is string => typeof n === "string") : [],
      )
      .catch(() => [] as string[])
      .then((installed) => mergeFontLists(installed, detectMonospaceFonts()));
  }
  return fonts;
}
