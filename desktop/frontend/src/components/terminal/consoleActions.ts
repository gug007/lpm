import type { Terminal } from "@xterm/xterm";
import { toast } from "sonner";
import { SaveTextFile } from "../../../bridge/commands";

export function bufferToPlainText(term: Terminal): string {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? "");
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

// An active console filter (the FilterMirror). When present, copy/save operate
// on the filtered lines the user is actually looking at, not the full buffer.
export interface ConsoleFilter {
  isActive(): boolean;
  getFilteredText(): string;
}

function consoleText(term: Terminal, filter?: ConsoleFilter | null): string {
  return filter?.isActive() ? filter.getFilteredText() : bufferToPlainText(term);
}

export async function copyConsole(
  term: Terminal,
  filter?: ConsoleFilter | null,
): Promise<void> {
  const text = consoleText(term, filter);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Console copied");
  } catch {
    toast.error("Failed to copy console");
  }
}

export async function saveConsole(
  term: Terminal,
  filter?: ConsoleFilter | null,
): Promise<void> {
  const text = consoleText(term, filter);
  const name = `console-${Date.now()}.log`;
  try {
    const saved = await SaveTextFile(name, text);
    if (saved) toast.success("Console saved");
  } catch {
    toast.error("Failed to save console");
  }
}
