import { WriteTerminal } from "../bridge/commands";

// WKWebView IPC drops certain high bytes (notably 0xD1) in JS→Go
// string transit on some macOS configs, corrupting Russian/Cyrillic input.
// When data contains any non-ASCII byte, we hex-encode the UTF-8 and prefix
// with a marker so the Go side can decode it. ASCII-only input (the hot path)
// passes through unchanged with zero overhead.
const HEX_MARKER = "\x00HEX:";

const encoder = new TextEncoder();

const HEX_TABLE: string[] = new Array(256);
for (let i = 0; i < 256; i++) HEX_TABLE[i] = i.toString(16).padStart(2, "0");

// For bash, zsh and fish alike. Fish also reads \' and \\ inside single quotes, so
// a backslash it would take goes in double quotes, which they all read the same.
export function shellQuote(s: string): string {
  if (!/[^a-zA-Z0-9_./:~-]/.test(s)) return s;
  const quoted = s.replace(/\\{2,}|\\(?='|$)|'/g, (m) =>
    m === "'" ? "'\\''" : `'"${m.replaceAll("\\", "\\\\")}"'`,
  );
  return `'${quoted}'`;
}

export function sendTerminalInput(id: string, data: string): Promise<void> {
  for (let i = 0; i < data.length; i++) {
    if (data.charCodeAt(i) > 0x7f) {
      const bytes = encoder.encode(data);
      const parts = new Array<string>(bytes.length);
      for (let j = 0; j < bytes.length; j++) parts[j] = HEX_TABLE[bytes[j]];
      return WriteTerminal(id, HEX_MARKER + parts.join(""));
    }
  }
  return WriteTerminal(id, data);
}
