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

export async function copyConsole(term: Terminal): Promise<void> {
  const text = bufferToPlainText(term);
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Console copied");
  } catch {
    toast.error("Failed to copy console");
  }
}

export async function saveConsole(term: Terminal): Promise<void> {
  const text = bufferToPlainText(term);
  const name = `console-${Date.now()}.log`;
  try {
    const saved = await SaveTextFile(name, text);
    if (saved) toast.success("Console saved");
  } catch {
    toast.error("Failed to save console");
  }
}
