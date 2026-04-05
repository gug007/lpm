import { WriteTerminal, WriteTerminalBytes } from "../wailsjs/go/main/App";

// Wails v2 WKWebView IPC drops certain high bytes (notably 0xD1) in JS→Go
// string transit on some macOS configs, corrupting Russian/Cyrillic input.
// For non-ASCII data we send UTF-8 bytes as a JSON array via WriteTerminalBytes,
// which bypasses string encoding entirely. ASCII-only input (the hot path)
// uses the plain string binding with zero overhead.
const encoder = new TextEncoder();

export function sendTerminalInput(id: string, data: string): Promise<void> {
  for (let i = 0; i < data.length; i++) {
    if (data.charCodeAt(i) > 0x7f) {
      return WriteTerminalBytes(id, Array.from(encoder.encode(data)));
    }
  }
  return WriteTerminal(id, data);
}
