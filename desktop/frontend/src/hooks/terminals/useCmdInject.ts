import { useRef, useCallback, type RefObject } from "react";
import { EventsOn } from "../../../bridge/runtime";
import { sendTerminalInput } from "../../terminal-io";

// Injection waits for pty output to go quiet for PROMPT_IDLE_MS before
// typing a command, bounded by PROMPT_MAX_WAIT_MS in case the shell never
// produces output. A fixed delay isn't enough — a loaded zsh with
// oh-my-zsh/p10k can take well over a second to draw its prompt, and
// typing before the prompt renders echoes the command to a raw TTY.
const PROMPT_IDLE_MS = 150;
const PROMPT_MAX_WAIT_MS = 3000;

interface UseCmdInjectProps {
  submitPromptRef: RefObject<
    ((id: string, payload: string | string[]) => boolean) | undefined
  >;
}

export function useCmdInject({ submitPromptRef }: UseCmdInjectProps) {
  const pendingInjectCleanups = useRef<Set<() => void>>(new Set());

  // Run `action` once the pty goes quiet (or PROMPT_MAX_WAIT_MS elapses). Each
  // call registers a cleanup in pendingInjectCleanups so the unmount effect can
  // tear down in-flight injections — otherwise the pty-output subscription would
  // outlive the component and fire into a dead session.
  const runWhenIdle = useCallback((id: string, action: () => void) => {
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
      action();
    }

    fallbackTimer = setTimeout(fire, PROMPT_MAX_WAIT_MS);
    pendingInjectCleanups.current.add(cleanup);
  }, []);

  // Type `text` + newline once the shell prompt settles, then run `onSent`.
  const scheduleInputInject = useCallback(
    (id: string, text: string, onSent?: () => void) => {
      runWhenIdle(id, () => {
        sendTerminalInput(id, text + "\n").catch(() => {});
        onSent?.();
      });
    },
    [runWhenIdle],
  );

  // Submit an optional follow-up prompt — e.g. a task for an AI agent — once the
  // launched program has drawn its own input UI. Waits for the pty to go quiet
  // so we never type before the receiver is ready, then delivers through the
  // terminal handle's submitInput: a bracketed paste whose submitting CR is
  // gated on the program's paste/image redraw settling. A naive "text + newline"
  // write submits an LF (not the CR agents read as Enter) in one shot, so an
  // agent like Claude Code swallows it mid-redraw and the prompt sits unsent. A
  // blank prompt is a no-op; the handle path falls back to a raw CR write only
  // if no live handle is registered.
  const scheduleSeedInject = useCallback(
    (id: string, prompt?: string | string[]) => {
      let payload: string | string[] | undefined;
      if (typeof prompt === "string") payload = prompt.trim() || undefined;
      else if (Array.isArray(prompt)) {
        const parts = prompt.filter((p) => p.trim().length > 0);
        payload = parts.length ? parts : undefined;
      }
      if (payload === undefined) return;
      runWhenIdle(id, () => {
        const submitted = submitPromptRef.current?.(id, payload) ?? false;
        if (!submitted) {
          const flat = Array.isArray(payload) ? payload.join("") : payload;
          sendTerminalInput(id, `${flat}\r`).catch(() => {});
        }
      });
    },
    [runWhenIdle],
  );

  // Type the launch command once the shell prompt settles, then seed the
  // optional follow-up prompt once the launched program is ready.
  const scheduleCmdInject = useCallback(
    (id: string, cmd: string, prompt?: string | string[]) => {
      scheduleInputInject(id, cmd, () => scheduleSeedInject(id, prompt));
    },
    [scheduleInputInject, scheduleSeedInject],
  );

  // Teardown helper for the orchestrator's unmount effect: tear down any
  // in-flight command injections.
  const cancelPendingInjects = useCallback(() => {
    const cleanups = pendingInjectCleanups.current;
    cleanups.forEach((fn) => fn());
    cleanups.clear();
  }, []);

  return { scheduleCmdInject, scheduleSeedInject, cancelPendingInjects };
}
