import { useCallback, useEffect, useRef, useState } from "react";
import { QuickTerminalCwd, StartTerminalWithCwdEnv } from "../../../bridge/commands";
import { EventsOn } from "../../../bridge/runtime";
import { toast } from "../../notifications/toast";
import { GLOBAL_TERMINALS_KEY } from "../../terminals";

interface QuickTerminalSession {
  terminalId: string | null;
  cwd: string;
  shown: boolean;
  // The shell exited: the next time the window drops down it starts a new one.
  ended: () => void;
}

// The quick terminal's one shell. The window is created on the first press and
// then only hidden, so the shell outlives every hide; a new one starts in the
// project last open in lpm when the old one has exited.
export function useQuickTerminalSession(): QuickTerminalSession {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [shown, setShown] = useState(true);
  const starting = useRef(false);

  const start = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      const dir: string = await QuickTerminalCwd();
      const id: string = await StartTerminalWithCwdEnv(GLOBAL_TERMINALS_KEY, dir, {});
      setCwd(dir);
      setTerminalId(id);
    } catch (err) {
      toast.error(`Couldn't start a terminal: ${err}`);
    } finally {
      starting.current = false;
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const idRef = useRef(terminalId);
  idRef.current = terminalId;

  useEffect(() => {
    const offShown = EventsOn("quick-terminal-shown", () => {
      setShown(true);
      if (!idRef.current) void start();
    });
    const offHidden = EventsOn("quick-terminal-hidden", () => setShown(false));
    return () => {
      offShown();
      offHidden();
    };
  }, [start]);

  const ended = useCallback(() => setTerminalId(null), []);

  return { terminalId, cwd, shown, ended };
}
