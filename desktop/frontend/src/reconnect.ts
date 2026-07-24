// Auto-reconnect decision logic for remote (SSH) terminals whose transport
// dropped. Kept pure and dependency-free so the policy can be unit-tested in
// isolation from the React/event wiring in useTerminals.

// A remote terminal multiplexes over one SSH connection. When that connection
// dies the ssh client exits 255, whereas a clean remote `exit` returns the
// shell's own code — so 255 is a reliable "transport failed, safe to respawn"
// discriminator.
export const SSH_TRANSPORT_EXIT_CODE = 255;

export const RECONNECT_BASE_MS = 2000;
export const RECONNECT_MAX_MS = 30000;

// A reconnect spawn always succeeds locally (the ssh client starts even when
// the host is unreachable), so viability is judged by watching the fresh PTY:
// an exit inside this window means the connection failed and the old pane must
// not be swapped away. ssh failures are bounded by the ConnectTimeout=10 baked
// into ssh_args, so the window comfortably covers every failure mode.
export const RECONNECT_PROBE_WINDOW_MS = 12000;
// A failing ssh prints its error and exits almost simultaneously, while a live
// session emits output and keeps running — so output followed by this much
// quiet passes the probe early instead of waiting out the full window.
export const RECONNECT_PROBE_OUTPUT_GRACE_MS = 1200;

// Delay before the Nth reconnect attempt (1-based): 2s, 4s, 8s, 16s, then
// capped at 30s. Attempts below 1 fall back to the base delay.
export function reconnectDelayMs(
  attempt: number,
  baseMs = RECONNECT_BASE_MS,
  maxMs = RECONNECT_MAX_MS,
): number {
  if (attempt < 1) return baseMs;
  const raw = baseMs * 2 ** (attempt - 1);
  return Math.min(raw, maxMs);
}

export interface ReconnectDecision {
  exitCode: number;
  isRemote: boolean;
  // The tab is still present in the live tree (a user-closed tab is gone).
  stillInTree: boolean;
  // The tab is being torn down behind an Undo toast — an intentional close.
  pendingClose: boolean;
}

// Whether a pty exit warrants an automatic reconnect. Only remote terminals
// that dropped their transport (exit 255) and are still a live, non-closing tab
// qualify; everything else keeps the current dead-pane behavior.
export function shouldReconnect(d: ReconnectDecision): boolean {
  return (
    d.isRemote &&
    d.stillInTree &&
    !d.pendingClose &&
    d.exitCode === SSH_TRANSPORT_EXIT_CODE
  );
}
