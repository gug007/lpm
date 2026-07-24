// An SSH endpoint can route lpm's background connection and its interactive
// terminals into different environments (gateway vs container, different user).
// The status socket then binds where terminals can't reach it, so notifications
// die silently. The backend probes for this and emits `ssh-env-mismatch`; this
// module turns that payload into the user-facing warning.

export interface SshEnvMismatch {
  hostLabel: string;
  execHome: string;
  ptyHome: string;
}

export function parseSshEnvMismatch(payload: unknown): SshEnvMismatch | null {
  const p = payload as Partial<SshEnvMismatch> | null;
  if (!p || typeof p.hostLabel !== "string" || p.hostLabel === "") return null;
  if (typeof p.execHome !== "string" || typeof p.ptyHome !== "string") return null;
  return { hostLabel: p.hostLabel, execHome: p.execHome, ptyHome: p.ptyHome };
}

export function sshEnvMismatchMessage(m: SshEnvMismatch): string {
  return `Notifications from ${m.hostLabel} can't reach this Mac: terminals on that server open in a different environment than the connection lpm sets up. Point the project at the machine's direct SSH address to fix this.`;
}
