"use client";

import { createDriveRegistry } from "./drive-registry";

// The shell counterpart of the agent drive: a step that runs a command types
// it into the project's newest shell, the way a visitor would.
export type ShellDrive = {
  // Types the command at the prompt, then runs it. `instant` skips the typing.
  send: (command: string, opts?: { instant?: boolean }) => void;
  // The command line, for the mimed cursor to aim at.
  field: () => HTMLElement | null;
};

// Keyed by project: the most recently opened shell in it answers.
const registry = createDriveRegistry<ShellDrive>();

export const registerShellDrive = registry.register;

export const shellDrive = registry.get;

export const withShellDrive = registry.withDrive;
