export const ansiColors = {
  black: "#000000",
  red: "#c91b00",
  green: "#00c200",
  yellow: "#c7c400",
  blue: "#3b8eea",
  magenta: "#c930c7",
  cyan: "#00c5c7",
  white: "#c7c7c7",
  brightBlack: "#686868",
  brightRed: "#ff6e67",
  brightGreen: "#5ffa68",
  brightYellow: "#fffc67",
  brightBlue: "#83a5d6",
  brightMagenta: "#ff77ff",
  brightCyan: "#60fdff",
  brightWhite: "#ffffff",
} as const;

// A terminal header's hover and pressed shades, over a dark or a light background.
export const DARK_HOVER = { headerHover: "rgba(255,255,255,0.04)", headerActive: "rgba(255,255,255,0.08)" };
export const LIGHT_HOVER = { headerHover: "rgba(0,0,0,0.05)", headerActive: "rgba(0,0,0,0.09)" };
