"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { TurnEnd } from "./use-demo-frame";

const AGENTS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
};

export type DemoAlerts = {
  supported: boolean;
  on: boolean;
  blocked: boolean;
  toggle: () => void;
  onTurnEnd: (turn: TurnEnd) => void;
};

const noChanges = () => () => {};

// The app's alerts, played by the browser: once the visitor turns them on, a
// turn that ends while the demo's tab is out of sight raises a notification
// with lpm's own chime, and clicking it brings the tab back.
export function useDemoAlerts(): DemoAlerts {
  const supported = useSyncExternalStore(
    noChanges,
    () => "Notification" in window,
    () => false,
  );
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const onRef = useRef(on);

  useEffect(() => {
    onRef.current = on;
  }, [on]);

  const toggle = useCallback(() => {
    if (onRef.current) {
      setOn(false);
      return;
    }
    if (Notification.permission === "granted") {
      setOn(true);
      return;
    }
    void Notification.requestPermission().then((answer) => {
      setBlocked(answer === "denied");
      setOn(answer === "granted");
    });
  }, []);

  const onTurnEnd = useCallback((turn: TurnEnd) => {
    if (!onRef.current || Notification.permission !== "granted") return;
    if (!document.hidden && document.hasFocus()) return;
    const agent = AGENTS[turn.agent] ?? turn.agent;
    const note = new Notification(`${turn.project} · ${agent}`, {
      body:
        turn.state === "done"
          ? "Agent finished. Click to go back to the demo."
          : "Agent is waiting for you. Click to go back to the demo.",
      icon: "/icon.png",
      tag: `lpm-demo-${turn.project}`,
    });
    note.onclick = () => {
      window.focus();
      note.close();
    };
    void new Audio(
      turn.state === "done" ? "/sounds/agent-done.wav" : "/sounds/agent-waiting.wav",
    )
      .play()
      .catch(() => {});
  }, []);

  return { supported, on, blocked, toggle, onTurnEnd };
}
