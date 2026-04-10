import { useState, useEffect, useRef, useCallback } from "react";
import { StartTerminal, StartTerminalForConfig, StartTerminalWithCwdEnv, StopTerminal } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { sendTerminalInput } from "../terminal-io";
import { getProjectTerminals, saveProjectTerminals, type TerminalEntry } from "../terminals";

export interface InteractiveTerminal {
  id: string;
  label: string;
  startCmd?: string;
  resumeCmd?: string;
}

export interface TerminalStartOpts {
  configName?: string;
  cwd?: string;
  env?: Record<string, string>;
}

// Injection waits for pty output to go quiet for PROMPT_IDLE_MS before
// typing a command, bounded by PROMPT_MAX_WAIT_MS in case the shell never
// produces output. A fixed delay isn't enough — a loaded zsh with
// oh-my-zsh/p10k can take well over a second to draw its prompt, and
// typing before the prompt renders echoes the command to a raw TTY.
const PROMPT_IDLE_MS = 150;
const PROMPT_MAX_WAIT_MS = 3000;

export interface UseTerminalsResult {
  terminals: InteractiveTerminal[];
  createTerminal: () => Promise<void>;
  createTerminalWithCmd: (label: string, cmd: string, opts?: TerminalStartOpts) => Promise<void>;
  closeTerminal: (index: number) => void;
  renameTerminal: (index: number, name: string) => void;
}

/**
 * Manages the list of interactive terminals for a project:
 * - restores saved terminals on mount
 * - persists terminal list on mutations
 * - stops all terminals + cancels pending injections on unmount
 *
 * The caller owns the active-pane state and wires `onTerminalClosed` to
 * update it when a tab is removed, because active-pane shape lives in
 * the view.
 */
export function useTerminals(projectName: string, onTerminalClosed: (index: number, remainingCount: number) => void, onTerminalCreated: (index: number) => void): UseTerminalsResult {
  const [terminals, setTerminals] = useState<InteractiveTerminal[]>([]);
  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;

  const pendingInjectCleanups = useRef<Set<() => void>>(new Set());

  const persist = useCallback((terms: InteractiveTerminal[]) => {
    const state = getProjectTerminals(projectName);
    saveProjectTerminals(projectName, {
      ...state,
      terminals: terms.map((t): TerminalEntry => ({
        label: t.label,
        ...(t.startCmd ? { startCmd: t.startCmd } : {}),
        ...(t.resumeCmd ? { resumeCmd: t.resumeCmd } : {}),
      })),
    });
  }, [projectName]);

  // Each call registers a cleanup in pendingInjectCleanups so the unmount
  // effect can tear down in-flight injections — otherwise the pty-output
  // subscription would outlive the component and fire into a dead session.
  const scheduleCmdInject = useCallback((id: string, cmd: string) => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let fired = false;

    const unsubscribe = EventsOn(`pty-output-${id}`, () => {
      if (fired) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(fire, PROMPT_IDLE_MS);
    });

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe();
      pendingInjectCleanups.current.delete(cleanup);
    };

    function fire() {
      if (fired) return;
      fired = true;
      cleanup();
      sendTerminalInput(id, cmd + "\n").catch(() => {});
    }

    fallbackTimer = setTimeout(fire, PROMPT_MAX_WAIT_MS);
    pendingInjectCleanups.current.add(cleanup);
  }, []);

  // Restore saved terminals on mount. Terminals that were persisted with a
  // startCmd/resumeCmd get their command re-injected: resumeCmd takes
  // precedence so programs with true session resume (e.g. Claude Code)
  // land back in their previous conversation instead of restarting fresh.
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
        if (r.status !== "fulfilled") return;
        const entry = saved[i];
        startedIds.push(r.value);
        restored.push({
          id: r.value,
          label: entry.label,
          startCmd: entry.startCmd,
          resumeCmd: entry.resumeCmd,
        });
      });
      if (cancelled) {
        restored.forEach((t) => StopTerminal(t.id).catch(() => {}));
        return;
      }
      setTerminals(restored);
      restored.forEach((t) => {
        const cmd = t.resumeCmd ?? t.startCmd;
        if (cmd) scheduleCmdInject(t.id, cmd);
      });
    })();
    return () => {
      cancelled = true;
      startedIds.forEach((id) => StopTerminal(id).catch(() => {}));
    };
  }, [projectName, scheduleCmdInject]);

  const addTerminal = (t: InteractiveTerminal) => {
    const index = terminalsRef.current.length;
    const next = [...terminalsRef.current, t];
    setTerminals(next);
    persist(next);
    onTerminalCreated(index);
  };

  const createTerminal = async () => {
    try {
      const id = await StartTerminal(projectName);
      addTerminal({ id, label: `Terminal ${terminalsRef.current.length + 1}` });
    } catch {}
  };

  const createTerminalWithCmd = async (label: string, cmd: string, opts?: TerminalStartOpts) => {
    // Named configs go through the restore-aware RPC: the Go side owns
    // the session-id rewrite so launch.startCmd is authoritative, and a
    // non-empty resumeCmd is the signal that this terminal opted into
    // restore and both cmds should be persisted.
    if (opts?.configName) {
      const launch = await StartTerminalForConfig(projectName, opts.configName);
      const restorable = launch.resumeCmd
        ? { startCmd: launch.startCmd, resumeCmd: launch.resumeCmd }
        : undefined;
      addTerminal({ id: launch.id, label, ...restorable });
      scheduleCmdInject(launch.id, launch.startCmd);
      return;
    }

    // Ad-hoc command terminals (e.g. action-as-terminal invocations) are
    // ephemeral — the command is typed once but not persisted.
    const id = (opts?.cwd || opts?.env)
      ? await StartTerminalWithCwdEnv(projectName, opts.cwd ?? "", opts.env ?? {})
      : await StartTerminal(projectName);
    addTerminal({ id, label });
    scheduleCmdInject(id, cmd);
  };

  const closeTerminal = (index: number) => {
    const term = terminalsRef.current[index];
    if (!term) return;
    StopTerminal(term.id).catch(() => {});
    const next = terminalsRef.current.filter((_, i) => i !== index);
    setTerminals(next);
    persist(next);
    onTerminalClosed(index, next.length);
  };

  const renameTerminal = (index: number, name: string) => {
    const next = terminalsRef.current.map((t, i) =>
      i === index ? { ...t, label: name } : t
    );
    setTerminals(next);
    persist(next);
  };

  // Cleanup all terminals and pending command injections on unmount
  useEffect(() => {
    const cleanups = pendingInjectCleanups.current;
    return () => {
      cleanups.forEach((fn) => fn());
      cleanups.clear();
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
