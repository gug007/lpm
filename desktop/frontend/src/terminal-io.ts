import { WriteTerminal as WriteTerminalRaw } from "../wailsjs/go/main/App";

// Wails v2 WKWebView IPC drops certain high bytes (notably 0xD1) in JS→Go
// string transit on some macOS configs, corrupting Russian/Cyrillic input.
// When data contains any non-ASCII byte, we hex-encode the UTF-8 and prefix
// with a marker so the Go side can decode it. ASCII-only input (the hot path)
// passes through unchanged with zero overhead.
const HEX_MARKER = "\x00HEX:";

export function writeTerminal(id: string, data: string): Promise<void> {
  for (let i = 0; i < data.length; i++) {
    if (data.charCodeAt(i) > 0x7f) {
      const bytes = new TextEncoder().encode(data);
      let hex = "";
      for (let j = 0; j < bytes.length; j++) {
        hex += bytes[j].toString(16).padStart(2, "0");
      }
      return WriteTerminalRaw(id, HEX_MARKER + hex);
    }
  }
  return WriteTerminalRaw(id, data);
}
