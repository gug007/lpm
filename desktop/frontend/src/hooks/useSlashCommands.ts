import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListAgentCommands } from "../../bridge/commands";
import type { AICLI } from "../types";
import { filterSlashCommands, sentCommandName, type SlashCommand } from "../slashCommands";
import { mergeSlashCommands, type LpmCommandLists } from "../lpmCommands";
import { recordSlashCommand, useLpmCommandLists } from "../store/lpmCommands";

// Loads the slash commands for a CLI + cwd and exposes a client-side filter.
// The agent's own list is fetched once per (cli, cwd) and cached for the hook's
// lifetime, so filtering as the user types never hits the backend. A null `cli`
// (a terminal not running a known agent) yields an empty list, keeping the menu
// closed. With an `lpmProject` the list holds the user's lpm skills for that
// project too, read again each time the composer is focused.
export function useSlashCommands(cli: AICLI | null, cwd: string, active: boolean, lpmProject: string | null) {
  const [agent, setAgent] = useState<SlashCommand[]>([]);
  const cache = useRef(new Map<string, SlashCommand[]>());
  const lpmOn = cli !== null && lpmProject !== null;
  const lpmLists = useLpmCommandLists(lpmProject ?? "", active && lpmOn);

  useEffect(() => {
    if (!active || !cli) {
      setAgent([]);
      return;
    }
    const key = `${cli}\u0000${cwd}`;
    const cached = cache.current.get(key);
    if (cached) {
      setAgent(cached);
      return;
    }
    // `cancelled` (flipped by the cleanup on any cli/cwd/active change) is the
    // only guard needed against a slow fetch resolving after it's stale.
    let cancelled = false;
    (async () => {
      try {
        const list = (await ListAgentCommands(cli, cwd)) as SlashCommand[];
        if (cancelled) return;
        cache.current.set(key, list);
        setAgent(list);
      } catch {
        if (!cancelled) setAgent([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cli, cwd, active]);

  const lists: LpmCommandLists | null = lpmOn ? lpmLists : null;
  const all = useMemo(() => (lists ? mergeSlashCommands(lists, agent) : agent), [lists, agent]);

  const filter = useCallback((frag: string) => filterSlashCommands(all, frag), [all]);

  // Whether a "/name" the user typed is a real command — drives the in-composer
  // blue highlight, so only recognized commands get colored. False when no CLI is
  // active, so callers don't need a separate guard.
  const isCommand = useCallback(
    (name: string) => cli !== null && all.some((c) => c.name === name),
    [all, cli],
  );

  // The argument-hint for a command (e.g. "[low|medium|high]"), or "" — shown as
  // ghost placeholder text in the composer once the command is followed by a space.
  const argumentHintFor = useCallback(
    (name: string) => all.find((c) => c.name === name)?.argumentHint ?? "",
    [all],
  );

  // Counts a sent message that runs one of the agent's commands, for the menu's
  // Most used. An lpm skill is counted when it expands.
  const noteSent = useCallback(
    (text: string) => {
      const name = sentCommandName(text)?.toLowerCase();
      const row = name ? all.find((c) => c.name.toLowerCase() === name) : undefined;
      if (row && row.source !== "lpm" && lpmProject !== null) recordSlashCommand(lpmProject, row.name);
    },
    [all, lpmProject],
  );

  return { filter, isCommand, argumentHintFor, noteSent, lpmLists: lists };
}
