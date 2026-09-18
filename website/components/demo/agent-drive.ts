"use client";

// How the tour reaches a session that is already on screen. "Enter and send a
// prompt" has no button to press — the visitor's own gesture is typing into the
// composer — so the tour drives the field through a handle each mounted session
// registers, the same way it clicks the real Start and action buttons.
export type AgentDrive = {
  // Types the text into the composer, then sends it. `instant` skips the
  // typing, for the tour landing its remaining steps as the visitor leaves.
  send: (text: string, opts?: { instant?: boolean }) => void;
  // False once the session has a prompt of its own — the tour never types over
  // a visitor who got there first.
  idle: () => boolean;
  // The composer field, for the mimed cursor to aim at.
  field: () => HTMLElement | null;
};

// Keyed by project and agent, so the tour can name the session before the tab
// holding it exists. A second session of the same CLI takes the key over; the
// one it replaced leaves the newcomer in place when it unmounts.
const drives = new Map<string, AgentDrive>();

export function agentDriveKey(project: string, agent: string): string {
  return `${project}::${agent}`;
}

export function registerAgentDrive(key: string, drive: AgentDrive): () => void {
  drives.set(key, drive);
  return () => {
    if (drives.get(key) === drive) drives.delete(key);
  };
}

export function agentDrive(key: string): AgentDrive | undefined {
  return drives.get(key);
}

const WAIT_MS = 60;
const WAIT_TRIES = 25;

// A session registers as it mounts, a render after the chip that opened it was
// clicked, so a prompt aimed at a tab that has only just opened waits for the
// field rather than being dropped. Returns a cancel.
export function withAgentDrive(
  key: string,
  fn: (drive: AgentDrive) => void,
): () => void {
  let timer: number | null = null;
  let left = WAIT_TRIES;
  const attempt = () => {
    timer = null;
    const drive = agentDrive(key);
    if (drive) return fn(drive);
    left -= 1;
    if (left > 0) timer = window.setTimeout(attempt, WAIT_MS);
  };
  attempt();
  return () => {
    if (timer !== null) window.clearTimeout(timer);
  };
}

// The composer types at a human clip: a lead-in while the field takes focus,
// then the characters, then a beat before the prompt goes.
export const TYPE_LEAD_MS = 260;
export const TYPE_CHAR_MS = 55;
export const TYPE_SEND_MS = 420;

/** How long typing a prompt takes, from the tap to the send. */
export function typingMs(text: string): number {
  return TYPE_LEAD_MS + text.length * TYPE_CHAR_MS + TYPE_SEND_MS;
}
