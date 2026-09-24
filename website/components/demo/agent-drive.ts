"use client";

import { createDriveRegistry } from "./drive-registry";

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
  // Types a reply to the question the session is stopped on, then sends it.
  answer: (text: string, opts?: { instant?: boolean }) => void;
  // True while the session is stopped on a question and nothing is typing.
  waiting: () => boolean;
  // The composer field, for the mimed cursor to aim at.
  field: () => HTMLElement | null;
};

// Keyed by project and agent, so the tour can name the session before the tab
// holding it exists.
const registry = createDriveRegistry<AgentDrive>();

export function agentDriveKey(project: string, agent: string): string {
  return `${project}::${agent}`;
}

export const registerAgentDrive = registry.register;

export const agentDrive = registry.get;

export const withAgentDrive = registry.withDrive;
