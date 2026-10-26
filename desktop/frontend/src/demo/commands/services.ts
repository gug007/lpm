import type { CommandMap } from "../backend";
import { lineText } from "../ansi";
import type { SeedLine, SeedService } from "../seed/types";
import { emitEvent } from "../ipc";
import { changed, project, record, type Project } from "./state";

const MAX_LINES = 400;

// What a dev server prints when the folder's own service doesn't say.
export const GENERIC_DEV_LOG: SeedLine[] = [
  { text: "  ▲ Next.js 16.3.0", at: 250 },
  { text: "  - Local:        http://localhost:3000", color: "muted", at: 300 },
  { text: "", at: 350 },
  { text: " ✓ Ready in 911ms", color: "cyan", at: 950 },
];

interface Output {
  lines: string[];
  boot: ReturnType<typeof setTimeout>[];
  loop?: ReturnType<typeof setTimeout>;
}

const outputs = new Map<string, Map<string, Output>>();
// Projects whose logs a pane is showing; the others play on unseen.
const streamed = new Set<string>();

function publish(p: Project, service: string): void {
  if (!streamed.has(p.name)) return;
  const pane = runningServices(p).findIndex((s) => s.name === service);
  const out = outputs.get(p.name)?.get(service);
  if (pane >= 0 && out) emitEvent("log-update", { project: p.name, pane, content: out.lines.join("\n") });
}

function runningServices(p: Project): SeedService[] {
  return p.services.filter((s) => p.running.has(s.name));
}

const silence = (out: Output | undefined) => {
  out?.boot.forEach(clearTimeout);
  clearTimeout(out?.loop);
};

// A repeated request line with its timing varied, since the app shows a log
// line only when it differs from the one before it.
const vary = (text: string) =>
  text.replace(/(\d+(?:\.\d+)?)ms/, (_, n: string) => {
    const v = Number(n) * (0.6 + Math.random() * 0.8);
    return `${n.includes(".") ? v.toFixed(1) : Math.max(1, Math.round(v))}ms`;
  });

function play(p: Project, svc: SeedService): void {
  const byService = outputs.get(p.name) ?? new Map<string, Output>();
  outputs.set(p.name, byService);
  silence(byService.get(svc.name));
  const out: Output = { lines: [], boot: [] };
  byService.set(svc.name, out);
  const push = (text: string) => {
    out.lines.push(text);
    if (out.lines.length > MAX_LINES) out.lines.shift();
    publish(p, svc.name);
  };
  const echoed = svc.log[0]?.text.startsWith("$ ");
  const log = echoed ? svc.log : [{ text: `$ ${svc.cmd}`, color: "green" as const, at: 0 }, ...svc.log];
  for (const line of log) out.boot.push(setTimeout(() => push(lineText(line)), line.at));
  const loop = svc.loop;
  if (!loop) return;
  const tick = () => {
    push(lineText({ ...loop.line, text: vary(loop.line.text) }));
    out.loop = setTimeout(tick, loop.everyMs);
  };
  out.loop = setTimeout(tick, Math.max(0, ...log.map((l) => l.at)) + loop.everyMs);
}

function halt(p: Project, service: string): void {
  silence(outputs.get(p.name)?.get(service));
  outputs.get(p.name)?.delete(service);
}

export function stopServices(name: string): void {
  for (const out of outputs.get(name)?.values() ?? []) silence(out);
  outputs.delete(name);
  streamed.delete(name);
}

function profileServices(p: Project, profile: string): string[] {
  const named = p.profiles.find((pr) => pr.name === (profile || "default"));
  return named ? named.services : p.services.map((s) => s.name);
}

// The services these need first, ahead of them, as lpm starts a dependsOn chain.
function withDeps(p: Project, names: string[]): string[] {
  const out: string[] = [];
  const visit = (name: string, path: string[]) => {
    if (out.includes(name) || path.includes(name)) return;
    const svc = p.services.find((s) => s.name === name);
    if (!svc) return;
    for (const dep of svc.dependsOn ?? []) visit(dep, [...path, name]);
    out.push(name);
  };
  for (const name of names) visit(name, []);
  return out;
}

// Starts exactly these services, leaving any that keep running untouched.
function runOnly(p: Project, names: string[], profile = ""): void {
  const next = new Set(names.filter((n) => p.services.some((s) => s.name === n)));
  for (const name of p.running) if (!next.has(name)) halt(p, name);
  const started = [...next].filter((n) => !p.running.has(n));
  p.running = next;
  p.activeProfile = next.size ? profile : "";
  for (const svc of p.services) if (started.includes(svc.name)) play(p, svc);
  changed();
  for (const name of p.running) publish(p, name);
}

function withProject(name: unknown, act: (p: Project) => void): null {
  const p = project(String(name));
  if (p) act(p);
  return null;
}

export const serviceCommands: CommandMap = {
  start_project: ({ name, profile }) =>
    withProject(name, (p) =>
      runOnly(p, withDeps(p, profileServices(p, String(profile ?? ""))), String(profile ?? "")),
    ),
  start_project_with_services: ({ name, services }) =>
    withProject(name, (p) => runOnly(p, withDeps(p, services as string[]))),
  stop_project: ({ name }) => withProject(name, (p) => runOnly(p, [])),
  stop_project_service: ({ name, serviceName }) =>
    withProject(name, (p) => runOnly(p, [...p.running].filter((s) => s !== serviceName))),
  toggle_project_service: ({ name, serviceName }) =>
    withProject(name, (p) => {
      const others = [...p.running].filter((s) => s !== serviceName);
      runOnly(p, p.running.has(String(serviceName)) ? others : withDeps(p, [...others, String(serviceName)]));
    }),
  start_service: ({ projectName, paneIndex }) =>
    withProject(projectName, (p) => {
      const svc = runningServices(p)[Number(paneIndex)];
      if (svc) play(p, svc);
    }),
  restart_project_service: ({ name, serviceName }) =>
    withProject(name, (p) => {
      const svc = runningServices(p).find((s) => s.name === serviceName);
      if (!svc) return;
      record("restart", p.name, svc.name);
      play(p, svc);
    }),
  detect_service_ports: ({ name }) => {
    const p = project(String(name));
    return p
      ? runningServices(p).filter((s) => s.port).map((s) => ({ service: s.name, ports: [s.port] }))
      : [];
  },
  start_log_streaming: ({ projectName }) =>
    withProject(projectName, (p) => {
      streamed.add(p.name);
      runningServices(p).forEach((s) => publish(p, s.name));
    }),
  stop_log_streaming: ({ projectName }) => {
    streamed.delete(String(projectName));
    return null;
  },
  get_service_logs: ({ projectName, paneIndex }) => {
    const p = project(String(projectName));
    const svc = p && runningServices(p)[Number(paneIndex)];
    return (svc && outputs.get(p.name)?.get(svc.name)?.lines.join("\n")) ?? "";
  },
};
