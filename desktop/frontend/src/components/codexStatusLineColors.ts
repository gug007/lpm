export type CodexStatusLineAccent =
  | "model"
  | "path"
  | "branch"
  | "state"
  | "usage"
  | "limit"
  | "metadata"
  | "mode"
  | "thread"
  | "progress";

export type CodexStatusLineColorScheme = "dark" | "light";

const THEME_COLORS: Record<
  CodexStatusLineColorScheme,
  Record<CodexStatusLineAccent, string>
> = {
  dark: {
    model: "#f9e2af",
    path: "#a6e3a1",
    branch: "#89b4fa",
    state: "#cba6f7",
    usage: "#fab387",
    limit: "#f38ba8",
    metadata: "#9399b2",
    mode: "#cba6f7",
    thread: "#94e2d5",
    progress: "#fab387",
  },
  light: {
    model: "#df8e1d",
    path: "#40a02b",
    branch: "#1e66f5",
    state: "#8839ef",
    usage: "#fe640b",
    limit: "#d20f39",
    metadata: "#7c7f93",
    mode: "#8839ef",
    thread: "#179299",
    progress: "#fe640b",
  },
};

function softenColor(color: string): string {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  const luma = Math.floor(
    (77 * channels[0] + 150 * channels[1] + 29 * channels[2]) / 256,
  );
  const softened = channels.map((channel) =>
    Math.floor((channel * 85 + luma * 15 + 50) / 100),
  );
  return `#${softened
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function codexStatusLineColor(
  accent: CodexStatusLineAccent,
  scheme: CodexStatusLineColorScheme,
): string {
  return softenColor(THEME_COLORS[scheme][accent]);
}

export function codexStatusLineColorScheme(
  background: string,
): CodexStatusLineColorScheme {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(background);
  if (!match) return "dark";
  const [, red, green, blue] = match;
  const luma =
    0.299 * Number.parseInt(red, 16) +
    0.587 * Number.parseInt(green, 16) +
    0.114 * Number.parseInt(blue, 16);
  return luma > 128 ? "light" : "dark";
}
