import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { highlightCommand } from "../components/composerEditor";
import { memoryPillAt, memoryPillRect } from "../components/composerMemoryPill";
import type { MentionItem } from "../mentions";
import { useMemorySessions, type MemorySessionInfo } from "./useMemorySessions";

export interface InputComposerMemorySource {
  // The project whose memory sessions are offered (a duplicate lists its
  // original's).
  project: string;
  // The agent CLI the prompt goes to, which decides the invocation's form.
  agent: string | null;
}

export interface InputComposerMemoryState {
  // False when there's nothing to offer: no source, or an SSH project, whose
  // memory isn't on this Mac.
  enabled: boolean;
  items: MentionItem[];
  byId: Map<string, MemorySessionInfo>;
  reload: () => void;
  // Re-colors the leading "/lpm-memory" and pills its session; run after edits.
  highlight: () => void;
  // The session pill under the pointer, for the hover preview.
  preview: { id: string; rect: DOMRect } | null;
}

// "/lpm-memory" is the only slash command this composer knows; highlightCommand
// recognizes the "$lpm-memory" skill mention itself.
const isMemoryCommand = (name: string) => name.toLowerCase() === "lpm-memory";

// The terminal composer's memory treatment for a plain prompt box: the session
// list, the colored invocation with its session pill, and the pill's preview.
export function useInputComposerMemory(
  source: InputComposerMemorySource | undefined,
  editorRef: RefObject<HTMLDivElement | null>,
): InputComposerMemoryState {
  const on = source !== undefined;
  const { items, byId, enabled, reload } = useMemorySessions(source?.project ?? "", on);
  const ids = useMemo(() => new Set(items.map((s) => s.insert)), [items]);
  const [preview, setPreview] = useState<InputComposerMemoryState["preview"]>(null);
  const hovered = useRef<HTMLElement | null>(null);

  const highlight = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !on) return;
    highlightCommand(editor, isMemoryCommand, ids);
    if (hovered.current && !hovered.current.isConnected) {
      hovered.current = null;
      setPreview(null);
    }
  }, [editorRef, on, ids]);

  // The session list arrives after the prompt was seeded, so the pill does too.
  useEffect(() => highlight(), [highlight]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !on) return;
    const move = (e: MouseEvent) => {
      const chip = memoryPillAt(e.target as HTMLElement);
      if (chip === hovered.current) return;
      hovered.current = chip;
      setPreview(chip ? { id: chip.dataset.memchip ?? "", rect: memoryPillRect(chip) } : null);
    };
    const leave = () => {
      hovered.current = null;
      setPreview(null);
    };
    editor.addEventListener("mousemove", move);
    editor.addEventListener("mouseleave", leave);
    return () => {
      editor.removeEventListener("mousemove", move);
      editor.removeEventListener("mouseleave", leave);
    };
  }, [editorRef, on]);

  return { enabled: on && enabled, items, byId, reload, highlight, preview };
}
