import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListAgentCommands } from "../../bridge/commands";
import type { AICLI } from "../types";
import type { SlashCommand } from "../slashCommands";
import { mergeSlashCommands, rankLpmGroups, type LpmCommandLists } from "../lpmCommands";
import { useLpmCommandLists } from "../store/lpmCommands";

// Loads the slash commands for a CLI + cwd and exposes a client-side filter.
// The agent's own list is fetched once per (cli, cwd) and cached for the hook's
// lifetime, so filtering as the user types never hits the backend. A null `cli`
// (a terminal not running a known agent) yields an empty list, keeping the menu
// closed. With an `lpmProject` the user's lpm skills for that project lead
// the list, read again each time the composer is focused.
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

  // Prefix matches first, then a substring fallback over name/description. An
  // empty fragment (a lone "/") returns the full list so the menu is browsable.
  // An lpm command also matches on its folder's name.
  const filter = useCallback(
    (frag: string): SlashCommand[] => {
      const q = frag.toLowerCase();
      if (!q) return all;
      const starts: SlashCommand[] = [];
      const contains: SlashCommand[] = [];
      for (const c of all) {
        const name = c.name.toLowerCase();
        if (name.startsWith(q) || c.folder?.toLowerCase().startsWith(q)) starts.push(c);
        else if (name.includes(q) || c.description.toLowerCase().includes(q)) contains.push(c);
      }
      // lpm skills lead and each folder's rows stay together under one
      // heading; the folder holding the best match comes first.
      const lpm = rankLpmGroups(all, new Set(starts), new Set(contains));
      return [...lpm, ...starts.concat(contains).filter((c) => c.source !== "lpm")];
    },
    [all],
  );

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

  return { filter, isCommand, argumentHintFor, lpmLists: lists };
}
