import { ListShells } from "../bridge/commands";

// The shells a plain terminal can open in on a machine (shells.rs). Agents,
// actions and services keep the login shell, whatever is picked here.
export interface ShellChoice {
  id: string;
  label: string;
  // A path, or a WSL distro: what tells two of one name apart.
  detail: string;
  login: boolean;
}

export interface ShellList {
  shells: ShellChoice[];
  // What a new terminal of the project opens in when nothing is picked.
  defaultId: string;
}

// What a new plain terminal asks for: the project's `terminal: { shell }`,
// else the machine's Settings › Terminal › Shell, else the login shell.
export const DEFAULT_SHELL = "default";

export const NO_SHELLS: ShellList = { shells: [], defaultId: "" };

function isShellChoice(value: unknown): value is ShellChoice {
  const v = value as Partial<ShellChoice> | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.detail === "string" &&
    typeof v.login === "boolean"
  );
}

export function parseShellList(value: unknown): ShellList {
  const v = value as { shells?: unknown; default?: unknown } | null;
  const shells = Array.isArray(v?.shells) ? v.shells.filter(isShellChoice) : [];
  const defaultId = typeof v?.default === "string" ? v.default : "";
  return { shells, defaultId };
}

// `projectName` sends the question to the machine that runs its terminals.
export function listShells(projectName?: string): Promise<ShellList> {
  return ListShells(projectName).then(parseShellList, () => NO_SHELLS);
}

// The name a picker shows: two shells of one name (Homebrew's bash beside the
// system's) carry where they are.
export function shellName(shell: ShellChoice, all: readonly ShellChoice[]): string {
  const twin = all.some((s) => s !== shell && s.label === shell.label);
  return twin ? `${shell.label} (${shell.detail})` : shell.label;
}
