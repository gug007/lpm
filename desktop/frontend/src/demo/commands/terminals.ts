import { buildClaudeResumeCmd } from "../../agentSession";
import { buildCodexResumeCmd } from "../../codexResume";
import type { AgentStatus } from "../agents/api";
import { parseLaunch } from "../agents/parse";
import { startAgent } from "../agents/session";
import type { CommandMap } from "../backend";
import { emitEvent, replayOnListen } from "../ipc";
import type { AgentKind, SeedSession } from "../seed/types";
import { createShell, type Shell } from "../shell/shell";
import { dirEntries } from "./files";
import { announceTurnEnd } from "../tour/turnEnd";
import { GENERIC_DEV_LOG } from "./services";
import { movePaneStatus, setAgentStatus, statusKey } from "./status";
import { HOME, agentAction, project, projects, record } from "./state";

interface Terminal {
  project: string;
  shell: Shell;
  // Output since it started, in the order it was written, for a pane that attaches later.
  chunks: string[];
  size: number;
  cols: number;
  agent?: AgentKind;
}

interface PersistedTerminals {
  projects: Record<string, unknown>;
}

const MAX_SCROLLBACK = 200_000;
const terminals = new Map<string, Terminal>();
const counters = new Map<string, number>();
// The agent conversations a seeded tab reopens, by the id its resume command names.
const seeded = new Map<string, { project: string; session: SeedSession }>();
let saved: PersistedTerminals = { projects: {} };

const eventSafe = (s: string) => s.replace(/[^\p{L}\p{N}_-]/gu, "_");
const seedPane = (name: string) => `${eventSafe(name)}-seed`;
const sessionIdOf = (name: string) => `${eventSafe(name)}-session`;

export function agentsIn(projectName: string): AgentKind[] {
  return [...terminals.values()].flatMap((t) => (t.project === projectName && t.agent ? [t.agent] : []));
}

function seededStatus(s: SeedSession): AgentStatus {
  const now = Date.now();
  return s.state === "done"
    ? { value: "Done", turnStart: now - s.ageMs, endedAt: now }
    : { value: "Waiting", turnStart: now - s.ageMs };
}

function launchCmds(kind: AgentKind | undefined, cmd: string, sessionId?: string) {
  if (kind === "claude") {
    const id = sessionId ?? crypto.randomUUID();
    return { startCmd: `claude --session-id ${id}`, resumeCmd: buildClaudeResumeCmd(cmd, id) };
  }
  if (kind === "codex" && sessionId) return { startCmd: cmd, resumeCmd: buildCodexResumeCmd(cmd, sessionId) };
  return { startCmd: cmd };
}

// Every seeded agent tab: listed in the sidebar from the start, and reopened
// with its conversation once its project is first shown.
export function seedTerminals(): void {
  seeded.clear();
  saved = { projects: {} };
  for (const p of projects.values()) {
    const session = p.session;
    const action = session && agentAction(p, session.kind);
    if (!session || !action) continue;
    const id = sessionIdOf(p.name);
    seeded.set(id, { project: p.name, session });
    setAgentStatus(p.name, seedPane(p.name), statusKey(session.kind, id, seedPane(p.name)), seededStatus(session));
    saved.projects[p.name] = {
      detailView: "terminal",
      panes: {
        kind: "leaf",
        activeTabIdx: 0,
        tabs: [
          {
            label: action.label,
            emoji: action.emoji,
            color: action.color,
            actionName: action.name,
            ...launchCmds(session.kind, action.cmd, id),
          },
        ],
      },
    };
  }
}

function close(id: string): void {
  terminals.get(id)?.shell.stop();
  terminals.delete(id);
  replayOnListen(`pty-output-${id}`, null);
}

function spawn({ projectName }: Record<string, unknown>): string {
  const name = String(projectName);
  const n = (counters.get(name) ?? 0) + 1;
  counters.set(name, n);
  const id = `${eventSafe(name)}-${n}`;
  const root = project(name)?.root ?? HOME;
  const event = `pty-output-${id}`;
  const t: Terminal = { project: name, shell: null as unknown as Shell, chunks: [], size: 0, cols: 100 };
  const write = (data: string) => {
    t.chunks.push(data);
    t.size += data.length;
    if (t.size > MAX_SCROLLBACK * 2) {
      const kept = t.chunks.join("").slice(-MAX_SCROLLBACK);
      t.chunks = [kept];
      t.size = kept.length;
    }
    emitEvent(event, data);
  };
  t.shell = createShell(
    {
      write,
      exit: (code) => {
        close(id);
        emitEvent(`pty-exit-${id}`, code);
      },
    },
    {
      cwd: root,
      entries: () => dirEntries(project(name)?.files ?? {}),
      services: () => project(name)?.services ?? [],
      git: () => project(name)?.git ?? null,
      ran: (input) => record("command", name, input),
      serviceLog: (svc) => (svc?.log.length ? svc.log : GENERIC_DEV_LOG),
      launch: (input, exit) => {
        const cmd = parseLaunch(input);
        if (!cmd) return null;
        const p = project(name);
        const sessionId = cmd.resumeId ?? cmd.sessionId ?? crypto.randomUUID();
        const resumed = cmd.resumeId ? seeded.get(cmd.resumeId) : undefined;
        if (resumed) movePaneStatus(name, seedPane(name), id);
        const key = statusKey(cmd.kind, sessionId, id);
        t.agent = cmd.kind;
        let last: AgentStatus["value"] | undefined;
        return startAgent(
          {
            write,
            status: (status) => {
              setAgentStatus(name, id, key, status);
              if (last === "Running" && status && status.value !== "Running") {
                announceTurnEnd(name, cmd.kind, status.value === "Done" ? "done" : "waiting");
              }
              last = status?.value;
            },
            exit: () => {
              t.agent = undefined;
              exit();
            },
            cols: () => t.cols,
          },
          {
            kind: cmd.kind,
            project: name,
            cwd: root,
            reply: p?.reply,
            task: agentAction(p, cmd.kind)?.task,
            prompt: cmd.prompt || undefined,
            model: cmd.model,
            effort: cmd.effort,
            sessionId,
            resume: resumed?.session,
          },
        );
      },
    },
  );
  terminals.set(id, t);
  replayOnListen(event, () => t.chunks.join(""));
  t.shell.start();
  return id;
}

// Input with any non-ASCII character arrives hex-encoded after this marker
// (terminal-io.ts), which the real backend decodes in pty.rs.
const HEX_MARKER = "\x00HEX:";

function decodeInput(data: string): string {
  if (!data.startsWith(HEX_MARKER)) return data;
  const hex = data.slice(HEX_MARKER.length);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

// The demo is one window, so the window showing a terminal controls it, and
// its pane's size reaches the agent drawing into it.
const thisWindow = ({ realmKind, realmId, label }: Record<string, unknown>) => ({
  kind: String(realmKind),
  id: String(realmId),
  label: String(label),
});

export const terminalCommands: CommandMap = {
  terminal_claim_control: thisWindow,
  terminal_present_control: thisWindow,
  start_terminal: spawn,
  start_terminal_with_cwd_env: spawn,
  start_terminal_for_restore: spawn,
  start_terminal_for_config: (args) => {
    const action = project(String(args.projectName))?.actions.find((a) => a.name === args.terminalName);
    const cmd = action?.cmd ?? String(args.terminalName);
    return { id: spawn(args), ...launchCmds(parseLaunch(cmd)?.kind, cmd) };
  },
  // The shells a Mac with Homebrew's fish has; zsh is the login shell.
  list_shells: () => ({
    shells: [
      { id: "/bin/zsh", label: "zsh", detail: "/bin/zsh", login: true },
      { id: "/bin/bash", label: "bash", detail: "/bin/bash", login: false },
      { id: "/opt/homebrew/bin/fish", label: "fish", detail: "/opt/homebrew/bin/fish", login: false },
    ],
    default: "/bin/zsh",
  }),
  write_terminal: ({ id, data }) => {
    terminals.get(String(id))?.shell.input(decodeInput(String(data)));
    return null;
  },
  resize_terminal: ({ id, cols }) => {
    const t = terminals.get(String(id));
    if (t && Number(cols) > 0 && Number(cols) !== t.cols) {
      t.cols = Number(cols);
      t.shell.resize();
    }
    return null;
  },
  stop_terminal: ({ id }) => {
    close(String(id));
    return null;
  },
  terminal_exists: ({ id }) => terminals.has(String(id)),
  load_terminals: () => saved,
  save_terminals: ({ c }) => {
    saved = c as PersistedTerminals;
    return null;
  },
};
