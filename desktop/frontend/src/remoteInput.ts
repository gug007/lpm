// Encode terminal input for the remote `in` message. xterm's `onData` yields
// UTF-8 text, sent verbatim; `onBinary` yields raw bytes (each char a byte
// 0-255) that can't round-trip as UTF-8, so they're framed as the desktop's
// `remote_write` expects: a null byte + "HEX:" + hex. Mirrors the mobile client's
// hexFrame helper and pty.rs's HEX_MARKER decode.
const HEX_MARKER = String.fromCharCode(0) + "HEX:";

export function encodeTerminalInput(data: string, binary = false): string {
  if (!binary) return data;
  let hex = "";
  for (let i = 0; i < data.length; i++) {
    hex += (data.charCodeAt(i) & 0xff).toString(16).padStart(2, "0");
  }
  return HEX_MARKER + hex;
}
