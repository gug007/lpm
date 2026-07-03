"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Moon,
  Plug,
  RotateCw,
  Search,
  Sun,
} from "lucide-react";
import type { DemoProject, DemoService } from "./projects";

// Mirrors the desktop app's address resolution:
// explicit scheme → localhost (http) → domain-shaped (https) → Google search.
function toTarget(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || v.startsWith("about:")) return v;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/.test(v)) return "http://" + v;
  if (!/\s/.test(v) && /^[^\s/]+\.[a-z]{2,}([:/?#]|$)/i.test(v))
    return "https://" + v;
  return "https://www.google.com/search?q=" + encodeURIComponent(v);
}

type Parsed = {
  raw: string;
  host: string;
  port?: number;
  isLocal: boolean;
  isSearch: boolean;
  query: string;
};

function parse(url: string): Parsed {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const port = u.port ? Number(u.port) : undefined;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname);
    const isSearch = u.hostname.endsWith("google.com") && u.pathname === "/search";
    return {
      raw: url,
      host,
      port,
      isLocal,
      isSearch,
      query: isSearch ? u.searchParams.get("q") ?? "" : "",
    };
  } catch {
    return { raw: url, host: url, isLocal: false, isSearch: false, query: "" };
  }
}

function findServiceByPort(
  project: DemoProject,
  port?: number,
): DemoService | undefined {
  const withPorts = project.services.filter((s) => s.port !== undefined);
  if (port === undefined) return withPorts[0];
  return withPorts.find((s) => s.port === port);
}

type PreviewKind = "app" | "docs" | "api" | "notebook";

function previewKind(svc: DemoService): PreviewKind {
  const n = svc.name.toLowerCase();
  const p = svc.port;
  if (n.includes("notebook") || p === 8888) return "notebook";
  if (n.includes("api") || n.includes("server") || p === 3001 || p === 8080)
    return "api";
  if (n.includes("site") || n.includes("docs") || p === 4321) return "docs";
  return "app";
}

interface Palette {
  bg: string;
  panel: string;
  panel2: string;
  border: string;
  text: string;
  sub: string;
  accent: string;
  green: string;
}

const DARK: Palette = {
  bg: "#1c1c1e",
  panel: "#26262b",
  panel2: "#2f2f35",
  border: "#3a3a41",
  text: "#e7e7ea",
  sub: "#9a9aa3",
  accent: "#6aa3ff",
  green: "#34d399",
};

const LIGHT: Palette = {
  bg: "#ffffff",
  panel: "#f6f7f9",
  panel2: "#eef0f3",
  border: "#e3e5ea",
  text: "#1b1b1f",
  sub: "#6b7280",
  accent: "#2563eb",
  green: "#059669",
};

const NAV_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#919191]";

export function BrowserView({
  project,
  runningServices,
}: {
  project: DemoProject;
  runningServices: Set<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [nav, setNav] = useState(0);
  const [dark, setDark] = useState(true);

  const url = histIdx >= 0 ? history[histIdx] : null;
  const c = dark ? DARK : LIGHT;

  useEffect(() => {
    if (!url) inputRef.current?.focus();
  }, [url]);

  const navigate = (raw: string) => {
    const target = toTarget(raw);
    if (!target) return;
    setHistory((h) => {
      const next = [...h.slice(0, histIdx + 1), target];
      setHistIdx(next.length - 1);
      return next;
    });
    setAddress(target);
    setNav((n) => n + 1);
  };

  const go = (e: FormEvent) => {
    e.preventDefault();
    navigate(address);
  };

  const step = (delta: -1 | 1) => {
    const i = histIdx + delta;
    if (i < 0 || i >= history.length) return;
    setHistIdx(i);
    setAddress(history[i]);
    setNav((n) => n + 1);
  };

  const back = () => step(-1);
  const forward = () => step(1);

  const reload = () => setNav((n) => n + 1);

  const canBack = histIdx > 0;
  const canForward = histIdx >= 0 && histIdx < history.length - 1;

  const localPorts = useMemo(
    () =>
      project.services
        .filter((s) => s.port !== undefined)
        .map((s) => s.port as number),
    [project],
  );

  const parsed = useMemo(() => (url ? parse(url) : null), [url]);
  const secure = parsed ? parsed.raw.startsWith("https://") : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      {/* Browser chrome — stays dark like the rest of the demo */}
      <div className="flex items-center gap-1 border-b border-[#2e2e2e] bg-[#242424] px-2 py-1.5">
        <button className={NAV_BTN} onClick={back} disabled={!canBack} title="Back" aria-label="Back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className={NAV_BTN}
          onClick={forward}
          disabled={!canForward}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button className={NAV_BTN} onClick={reload} title="Reload" aria-label="Reload">
          <RotateCw className="h-4 w-4" />
        </button>
        <form onSubmit={go} className="relative flex-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#7e7e7e]">
            {url ? (
              secure ? (
                <Lock className="h-3 w-3" />
              ) : (
                <Globe className="h-3 w-3" />
              )
            ) : (
              <Search className="h-3 w-3" />
            )}
          </span>
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Search Google or enter a URL…"
            className="h-7 w-full rounded-md border border-[#2e2e2e] bg-[#1a1a1a] pl-7 pr-2.5 text-xs text-[#e5e5e5] outline-none placeholder:text-[#7e7e7e] focus:border-[#5a5a5a]"
          />
        </form>
        <button
          className={NAV_BTN}
          onClick={() => setDark((d) => !d)}
          title={dark ? "Switch browser to light" : "Switch browser to dark"}
          aria-label="Toggle browser theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: c.bg }}>
        <LoadingBar key={nav} accent={c.accent} />
        {!parsed ? (
          <EmptyState
            c={c}
            ports={localPorts}
            onChip={(port) => navigate(`http://localhost:${port}`)}
            onFocus={() => inputRef.current?.focus()}
          />
        ) : (
          <div key={nav} className="absolute inset-0 overflow-auto">
            <Page
              parsed={parsed}
              project={project}
              runningServices={runningServices}
              c={c}
              onStart={() => navigate(parsed.raw)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingBar({ accent }: { accent: string }) {
  const [w, setW] = useState(8);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setW(82), 30);
    const b = window.setTimeout(() => setW(100), 360);
    const d = window.setTimeout(() => setDone(true), 560);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.clearTimeout(d);
    };
  }, []);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px]"
      style={{ opacity: done ? 0 : 1, transition: "opacity 200ms ease" }}
    >
      <div
        style={{
          width: `${w}%`,
          height: "100%",
          background: accent,
          transition: "width 320ms ease",
        }}
      />
    </div>
  );
}

function EmptyState({
  c,
  ports,
  onChip,
  onFocus,
}: {
  c: Palette;
  ports: number[];
  onChip: (port: number) => void;
  onFocus: () => void;
}) {
  return (
    <div
      onClick={onFocus}
      className="absolute inset-0 flex cursor-text select-none flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border"
        style={{ borderColor: c.border, background: c.panel, color: c.sub }}
      >
        <Globe className="h-7 w-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: c.text }}>
          Search the web
        </span>
        <span className="text-xs" style={{ color: c.sub }}>
          Type a search or enter a web address to get started
        </span>
      </div>
      {ports.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          <span className="text-[11px]" style={{ color: c.sub }}>
            Preview your dev server:
          </span>
          {ports.map((port) => (
            <button
              key={port}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChip(port);
              }}
              className="rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors"
              style={{ borderColor: c.border, color: c.text, background: c.panel }}
            >
              localhost:{port}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Page({
  parsed,
  project,
  runningServices,
  c,
  onStart,
}: {
  parsed: Parsed;
  project: DemoProject;
  runningServices: Set<string>;
  c: Palette;
  onStart: () => void;
}) {
  if (parsed.isSearch) return <SearchResults query={parsed.query} c={c} />;

  if (parsed.isLocal) {
    const svc = findServiceByPort(project, parsed.port);
    if (!svc) {
      return <ConnectionRefused host={parsed.host} port={parsed.port} c={c} onRetry={onStart} />;
    }
    if (!runningServices.has(svc.name)) {
      return (
        <ConnectionRefused
          host={parsed.host}
          port={svc.port}
          service={svc.name}
          c={c}
          onRetry={onStart}
        />
      );
    }
    const kind = previewKind(svc);
    if (kind === "api") return <ApiPreview project={project} svc={svc} c={c} />;
    if (kind === "docs") return <DocsPreview project={project} c={c} />;
    if (kind === "notebook") return <NotebookPreview project={project} c={c} />;
    return <AppPreview project={project} c={c} />;
  }

  return <GenericSite host={parsed.host} c={c} />;
}

function ConnectionRefused({
  host,
  port,
  service,
  c,
  onRetry,
}: {
  host: string;
  port?: number;
  service?: string;
  c: Palette;
  onRetry: () => void;
}) {
  const target = port ? `${host}:${port}` : host;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border"
        style={{ borderColor: c.border, background: c.panel, color: c.sub }}
      >
        <Plug className="h-7 w-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: c.text }}>
          This site can’t be reached
        </span>
        <span className="font-mono text-xs" style={{ color: c.sub }}>
          {target} refused to connect
        </span>
        {service && (
          <span className="mt-1 text-xs" style={{ color: c.sub }}>
            <span className="font-mono" style={{ color: c.text }}>
              {service}
            </span>{" "}
            isn’t running yet — hit{" "}
            <span
              className="rounded px-1 py-px font-medium"
              style={{ background: c.panel2, color: c.text }}
            >
              Start
            </span>{" "}
            up top, then reload.
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        style={{ borderColor: c.border, color: c.text, background: c.panel }}
      >
        Reload
      </button>
    </div>
  );
}

function BrowserBadge({ c, live }: { c: Palette; live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: c.panel2, color: live ? c.green : c.sub }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: live ? c.green : c.sub }}
      />
      {live ? "live" : "idle"}
    </span>
  );
}

function AppPreview({ project, c }: { project: DemoProject; c: Palette }) {
  const bars = [42, 66, 51, 78, 70, 92, 64];
  const metrics = [
    { label: "MRR", value: "$48.2k", delta: "▲ 12%", up: true },
    { label: "Active users", value: "2,481", delta: "▲ 4.1%", up: true },
    { label: "Churn", value: "1.2%", delta: "▼ 0.3%", up: false },
  ];
  const rows = [
    ["Ada Lovelace", "Pro", "2m ago"],
    ["Alan Turing", "Team", "14m ago"],
    ["Grace Hopper", "Pro", "1h ago"],
    ["Katherine Johnson", "Free", "3h ago"],
  ];
  return (
    <div className="min-h-full" style={{ background: c.bg, color: c.text }}>
      <header
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: c.border }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white"
            style={{ background: c.accent }}
          >
            {(project.label ?? project.name).charAt(0).toUpperCase()}
          </span>
          <span className="text-[13px] font-semibold">{project.label ?? project.name}</span>
          <BrowserBadge c={c} live />
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: c.sub }}>
          <span>Dashboard</span>
          <span>Customers</span>
          <span>Settings</span>
          <span className="h-5 w-5 rounded-full" style={{ background: c.panel2 }} />
        </div>
      </header>
      <div className="flex">
        <aside
          className="hidden w-36 shrink-0 flex-col gap-0.5 border-r p-2 sm:flex"
          style={{ borderColor: c.border }}
        >
          {["Home", "Dashboard", "Teams", "Billing", "Settings"].map((item, i) => (
            <span
              key={item}
              className="rounded-md px-2 py-1.5 text-[11px]"
              style={
                i === 1
                  ? { background: c.panel2, color: c.text, fontWeight: 600 }
                  : { color: c.sub }
              }
            >
              {item}
            </span>
          ))}
        </aside>
        <main className="min-w-0 flex-1 p-4">
          <div className="text-base font-semibold">Dashboard</div>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-lg border p-2.5"
                style={{ borderColor: c.border, background: c.panel }}
              >
                <div className="text-[10px] uppercase tracking-wide" style={{ color: c.sub }}>
                  {m.label}
                </div>
                <div className="mt-1 text-[15px] font-semibold">{m.value}</div>
                <div
                  className="text-[10px] font-medium"
                  style={{ color: m.up ? c.green : "#ef4444" }}
                >
                  {m.delta}
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-3 rounded-lg border p-3"
            style={{ borderColor: c.border, background: c.panel }}
          >
            <div className="mb-2 text-[11px] font-medium" style={{ color: c.sub }}>
              Revenue · last 7 days
            </div>
            <div className="flex h-20 items-end gap-2">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{ height: `${h}%`, background: c.accent, opacity: 0.55 + (i % 3) * 0.15 }}
                />
              ))}
            </div>
          </div>
          <div
            className="mt-3 overflow-hidden rounded-lg border"
            style={{ borderColor: c.border }}
          >
            <div
              className="px-3 py-1.5 text-[11px] font-medium"
              style={{ background: c.panel, color: c.sub }}
            >
              Recent signups
            </div>
            {rows.map((r, i) => (
              <div
                key={r[0]}
                className="flex items-center justify-between px-3 py-1.5 text-[11px]"
                style={i < rows.length - 1 ? { borderBottom: `1px solid ${c.border}` } : undefined}
              >
                <span>{r[0]}</span>
                <span style={{ color: c.sub }}>{r[1]}</span>
                <span style={{ color: c.sub }}>{r[2]}</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function DocsPreview({ project, c }: { project: DemoProject; c: Palette }) {
  return (
    <div className="min-h-full" style={{ background: c.bg, color: c.text }}>
      <header
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: c.border }}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Globe className="h-4 w-4" style={{ color: c.accent }} />
          {project.label ?? project.name}
          <BrowserBadge c={c} live />
        </div>
        <div
          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
          style={{ borderColor: c.border, color: c.sub }}
        >
          <Search className="h-3 w-3" />
          Search docs
        </div>
      </header>
      <div className="flex">
        <aside
          className="hidden w-40 shrink-0 flex-col gap-0.5 border-r p-3 sm:flex"
          style={{ borderColor: c.border }}
        >
          {[
            ["Getting Started", true],
            ["Installation", false],
            ["Configuration", false],
            ["Guides", false],
            ["API Reference", false],
            ["CLI", false],
          ].map(([item, active]) => (
            <span
              key={item as string}
              className="rounded px-2 py-1 text-[11px]"
              style={active ? { color: c.accent, fontWeight: 600 } : { color: c.sub }}
            >
              {item as string}
            </span>
          ))}
        </aside>
        <article className="min-w-0 flex-1 p-5">
          <div className="text-[11px] font-medium" style={{ color: c.accent }}>
            Getting Started
          </div>
          <div className="mt-1 text-xl font-bold">Introduction</div>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: c.sub }}>
            Welcome to the {project.label ?? project.name} documentation. This guide walks you
            through installing the toolkit, wiring up your first project, and shipping to
            production in minutes.
          </p>
          <div
            className="mt-3 rounded-lg border p-3 font-mono text-[11px]"
            style={{ borderColor: c.border, background: c.panel }}
          >
            <span style={{ color: c.sub }}>$ </span>
            <span style={{ color: c.green }}>npm install</span> @acme/cli
          </div>
          <p className="mt-3 text-[12px] leading-relaxed" style={{ color: c.sub }}>
            Edited <span className="font-mono" style={{ color: c.text }}>src/pages/index.astro</span>{" "}
            and saved? The dev server hot-reloads instantly — no restart needed.
          </p>
        </article>
      </div>
    </div>
  );
}

type JsonToken = "key" | "str" | "num";

function Tok({
  kind,
  c,
  children,
}: {
  kind: JsonToken;
  c: Palette;
  children: string;
}) {
  const color = kind === "key" ? c.accent : kind === "str" ? c.green : "#e0a458";
  const text = kind === "num" ? children : `"${children}"`;
  return <span style={{ color }}>{text}</span>;
}

function ApiPreview({
  project,
  svc,
  c,
}: {
  project: DemoProject;
  svc: DemoService;
  c: Palette;
}) {
  return (
    <div className="min-h-full p-4 font-mono text-[11.5px]" style={{ background: c.bg, color: c.text }}>
      <div className="mb-3 flex items-center gap-2 font-sans">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ background: c.green }}
        >
          200 OK
        </span>
        <span style={{ color: c.sub }}>
          GET localhost:{svc.port}/health
        </span>
        <BrowserBadge c={c} live />
      </div>
      <pre className="leading-relaxed" style={{ color: c.text }}>
        {"{"}
        {"\n  "}
        <Tok kind="key" c={c}>service</Tok>: <Tok kind="str" c={c}>{project.name}</Tok>,
        {"\n  "}
        <Tok kind="key" c={c}>status</Tok>: <Tok kind="str" c={c}>ok</Tok>,
        {"\n  "}
        <Tok kind="key" c={c}>uptime</Tok>: <Tok kind="num" c={c}>48213</Tok>,
        {"\n  "}
        <Tok kind="key" c={c}>version</Tok>: <Tok kind="str" c={c}>2026.4.23</Tok>,
        {"\n  "}
        <Tok kind="key" c={c}>checks</Tok>: {"{"}
        {"\n    "}
        <Tok kind="key" c={c}>database</Tok>: <Tok kind="str" c={c}>connected</Tok>,
        {"\n    "}
        <Tok kind="key" c={c}>redis</Tok>: <Tok kind="str" c={c}>connected</Tok>,
        {"\n    "}
        <Tok kind="key" c={c}>migrations</Tok>: <Tok kind="str" c={c}>up to date</Tok>
        {"\n  "}
        {"},"}
        {"\n  "}
        <Tok kind="key" c={c}>requests_per_min</Tok>: <Tok kind="num" c={c}>1284</Tok>
        {"\n"}
        {"}"}
      </pre>
    </div>
  );
}

function NotebookPreview({ project, c }: { project: DemoProject; c: Palette }) {
  return (
    <div className="min-h-full" style={{ background: c.bg, color: c.text }}>
      <header
        className="flex items-center gap-2 border-b px-4 py-2 text-[12px]"
        style={{ borderColor: c.border }}
      >
        <span className="text-base">📓</span>
        <span className="font-semibold">train.ipynb</span>
        <span style={{ color: c.sub }}>· {project.label ?? project.name}</span>
        <span className="ml-auto">
          <BrowserBadge c={c} live />
        </span>
      </header>
      <div className="space-y-3 p-4">
        <div
          className="rounded-md border p-3 text-[12px] leading-relaxed"
          style={{ borderColor: c.border, background: c.panel }}
        >
          <div className="text-sm font-semibold"># Model training</div>
          <div className="mt-1" style={{ color: c.sub }}>
            Load the dataset, fit the model, and report accuracy.
          </div>
        </div>
        <div className="flex gap-2 font-mono text-[11px]">
          <span className="shrink-0 pt-2 text-[10px]" style={{ color: c.accent }}>
            In [1]:
          </span>
          <div
            className="flex-1 rounded-md border p-2.5"
            style={{ borderColor: c.border, background: c.panel }}
          >
            <span style={{ color: "#c678dd" }}>import</span> pandas{" "}
            <span style={{ color: "#c678dd" }}>as</span> pd
            {"\n"}
            df = pd.read_parquet(<span style={{ color: c.green }}>&quot;data/train.parquet&quot;</span>)
            {"\n"}
            model.fit(df)
          </div>
        </div>
        <div className="flex gap-2 font-mono text-[11px]">
          <span className="shrink-0 pt-2 text-[10px]" style={{ color: c.sub }}>
            Out[1]:
          </span>
          <div className="flex-1 pt-2" style={{ color: c.sub }}>
            epoch 10/10 · loss=0.091 · acc=
            <span style={{ color: c.green }}>0.942</span>
            <div className="mt-2 flex h-14 items-end gap-1">
              {[30, 48, 62, 71, 80, 86, 90, 93].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{ height: `${h}%`, background: c.accent, opacity: 0.7 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResults({ query, c }: { query: string; c: Palette }) {
  const results = [
    {
      title: `${query} — official site`,
      url: `https://${slug(query)}.com`,
      snippet: `Everything about ${query}. Get started in minutes with guides, references, and examples.`,
    },
    {
      title: `${query} documentation`,
      url: `https://docs.${slug(query)}.dev`,
      snippet: `The complete reference for ${query}, including setup, configuration, and the API.`,
    },
    {
      title: `Getting started with ${query}`,
      url: `https://${slug(query)}.io/guide`,
      snippet: `A step-by-step guide that walks you through your first ${query} project.`,
    },
  ];
  return (
    <div className="min-h-full p-5" style={{ background: c.bg, color: c.text }}>
      <div
        className="mb-4 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]"
        style={{ borderColor: c.border, background: c.panel, maxWidth: 420 }}
      >
        <Search className="h-3.5 w-3.5" style={{ color: c.sub }} />
        <span>{query}</span>
      </div>
      <div className="space-y-4" style={{ maxWidth: 520 }}>
        {results.map((r) => (
          <div key={r.url}>
            <div className="text-[11px]" style={{ color: c.green }}>
              {r.url}
            </div>
            <div className="text-[14px] font-medium" style={{ color: c.accent }}>
              {r.title}
            </div>
            <div className="text-[12px] leading-snug" style={{ color: c.sub }}>
              {r.snippet}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericSite({ host, c }: { host: string; c: Palette }) {
  const name = host.split(".")[0];
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <div className="min-h-full" style={{ background: c.bg, color: c.text }}>
      <header
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: c.border }}
      >
        <span className="text-[14px] font-semibold">{title}</span>
        <div className="flex gap-3 text-[11px]" style={{ color: c.sub }}>
          <span>Product</span>
          <span>Pricing</span>
          <span>Docs</span>
          <span>Sign in</span>
        </div>
      </header>
      <div className="px-5 py-10 text-center">
        <div className="text-2xl font-bold tracking-tight">Build something great</div>
        <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed" style={{ color: c.sub }}>
          Welcome to {host}. This is a simulated page — the real lpm browser loads live sites in a
          native webview, right next to your terminals.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <span
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: c.accent }}
          >
            Get started
          </span>
          <span
            className="rounded-md border px-3 py-1.5 text-[12px] font-medium"
            style={{ borderColor: c.border, color: c.text }}
          >
            Learn more
          </span>
        </div>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")[0] || "example"
  );
}
