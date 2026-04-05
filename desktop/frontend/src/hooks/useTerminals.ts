import { useState, useEffect, useRef, useCallback } from "react";
import { StartTerminal, StartTerminalWithConfig, StopTerminal } from "../../wailsjs/go/main/App";
import { sendTerminalInput } from "../terminal-io";
import { getProjectTerminals, saveProjectTerminals } from "../terminals";

export interface InteractiveTerminal {
  id: string;
  label: string;
}

export interface UseTerminalsResult {
  terminals: InteractiveTerminal[];
  createTerminal: () => Promise<void>;
  createTerminalWithCmd: (label: string, terminalConfigName: string, cmd: string) => Promise<void>;
  closeTerminal: (index: number) => void;
  renameTerminal: (index: number, name: string) => void;
}

/**
 * Manages the list of interactive terminals for a project:
 * - restores saved terminals on mount
 * - persists terminal list on mutations
 * - stops all terminals + clears pending timers on unmount
 *
 * Returns terminal state plus action handlers. The caller owns the
 * active-pane state and wires `onTerminalClosed` to update it when a
 * tab is removed, because active-pane shape lives in the view.
 */
export function useTerminals(projectName: string, onTerminalClosed: (index: number) => void, onTerminalCreated: (index: number) => void): UseTerminalsResult {
  const [terminals, setTerminals] = useState<InteractiveTerminal[]>([]);
  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;

  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const persist = useCallback((terms: InteractiveTerminal[]) => {
    const state = getProjectTerminals(projectName);
    saveProjectTerminals(projectName, {
      ...state,
      terminals: terms.map((t) => ({ label: t.label })),
    });
  }, [projectName]);

  // Restore saved terminals on mount
  useEffect(() => {
    const saved = getProjectTerminals(projectName).terminals;
    if (!saved || saved.length === 0) return;
    let cancelled = false;
    const startedIds: string[] = [];
    (async () => {
      const results = await Promise.allSettled(
        saved.map(() => StartTerminal(projectName))
      );
      const restored: InteractiveTerminal[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          startedIds.push(r.value);
          restored.push({ id: r.value, label: saved[i].label });
        }
      });
      if (cancelled) {
        restored.forEach((t) => StopTerminal(t.id).catch(() => {}));
      } else {
        setTerminals(restored);
      }
    })();
    return () => {
      cancelled = true;
      startedIds.forEach((id) => StopTerminal(id).catch(() => {}));
    };
  }, [projectName]);

  const addTerminal = (id: string, label: string) => {
    const index = terminalsRef.current.length;
    const next = [...terminalsRef.current, { id, label }];
    setTerminals(next);
    persist(next);
    onTerminalCreated(index);
  };

  const createTerminal = async () => {
    try {
      const id = await StartTerminal(projectName);
      addTerminal(id, `Terminal ${terminalsRef.current.length + 1}`);
    } catch {}
  };

  const createTerminalWithCmd = async (label: string, terminalConfigName: string, cmd: string) => {
    const id = await StartTerminalWithConfig(projectName, terminalConfigName);
    addTerminal(id, label);
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer);
      sendTerminalInput(id, cmd + "\n").catch(() => {});
    }, 300);
    pendingTimers.current.add(timer);
  };

  const closeTerminal = (index: number) => {
    const term = terminalsRef.current[index];
    if (!term) return;
    StopTerminal(term.id).catch(() => {});
    const next = terminalsRef.current.filter((_, i) => i !== index);
    setTerminals(next);
    persist(next);
    onTerminalClosed(index);
  };

  const renameTerminal = (index: number, name: string) => {
    const next = terminalsRef.current.map((t, i) =>
      i === index ? { ...t, label: name } : t
    );
    setTerminals(next);
    persist(next);
  };

  // Cleanup all terminals and pending timers on unmount
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      terminalsRef.current.forEach((t) => {
        StopTerminal(t.id).catch(() => {});
      });
    };
  }, []);

  return {
    terminals,
    createTerminal,
    createTerminalWithCmd,
    closeTerminal,
    renameTerminal,
  };
}
