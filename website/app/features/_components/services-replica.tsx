import { ChevronDown } from "lucide-react";

type LogLine = { text: string; tone?: "dim" | "ok" | "bright" };

type Service = { name: string; port?: number; lines: LogLine[] };

const SERVICES: Service[] = [
  {
    name: "web",
    port: 3000,
    lines: [
      { text: "> next dev -p 3000", tone: "dim" },
      { text: "▲ Next.js 16.3.0", tone: "bright" },
      { text: "- Local: http://localhost:3000" },
      { text: "✓ Ready in 1.4s", tone: "ok" },
      { text: "GET / 200 in 84ms" },
      { text: "GET /cart 200 in 41ms" },
    ],
  },
  {
    name: "api",
    port: 8080,
    lines: [
      { text: "> tsx watch src/server.ts", tone: "dim" },
      { text: "listening on :8080", tone: "bright" },
      { text: "connected to postgres" },
      { text: "POST /login 200 12ms" },
      { text: "GET /products 200 31ms" },
      { text: "GET /orders/42 200 9ms" },
    ],
  },
  {
    name: "worker",
    lines: [
      { text: "> node worker.js", tone: "dim" },
      { text: "queue: emails", tone: "bright" },
      { text: "3 jobs waiting" },
      { text: "✓ order-confirmation", tone: "ok" },
      { text: "✓ password-reset", tone: "ok" },
      { text: "idle" },
    ],
  },
];

const PROJECTS = [
  { name: "shop-api", running: true, selected: true },
  { name: "web-app", running: true },
  { name: "docs-site", running: false },
  { name: "admin-panel", running: false },
];

const TONE = {
  dim: "text-gray-500",
  ok: "text-[#4eba65]",
  bright: "text-gray-100",
};

function RunDot({ running }: { running: boolean }) {
  return (
    <span
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${
        running
          ? "bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.7)]"
          : "border border-[#555]"
      }`}
    />
  );
}

export default function ServicesReplica() {
  return (
    <div
      data-on-dark
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
    >
      <div className="overflow-hidden rounded-lg bg-[#1a1a1a]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[#2d2d2d] px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex h-[15.5rem] sm:h-[16.5rem]">
          <div className="hidden w-[11.5rem] shrink-0 flex-col gap-px border-r border-[#262626] bg-[#161616] px-1.5 py-2.5 md:flex">
            <span className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Projects
            </span>
            {PROJECTS.map((project) => (
              <span
                key={project.name}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] ${
                  project.selected ? "bg-white/[0.08] text-gray-100" : "text-gray-400"
                }`}
              >
                <RunDot running={project.running} />
                <span className="truncate">{project.name}</span>
              </span>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#2d2d2d] px-3">
              <span className="truncate text-[13px] font-semibold text-gray-100">shop-api</span>
              <span className="hidden rounded border border-[#333] px-1.5 py-px font-mono text-[10px] text-gray-400 sm:inline">
                main
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="hidden items-center gap-1 rounded-md border border-[#333] bg-[#222] px-2 py-1 text-[11px] text-gray-200 sm:flex">
                  <span className="text-[#d97757]">✻</span>
                  Claude
                </span>
                <span className="hidden items-center gap-1 rounded-md border border-[#333] bg-[#222] px-2 py-1 text-[11px] text-gray-200 sm:flex">
                  <span className="text-[#67e8f9]">◆</span>
                  Codex
                </span>
                <span className="flex items-center rounded-md bg-[#e5e5e5] text-[11px] font-medium text-[#1a1a1a]">
                  <span className="px-2.5 py-1">Stop</span>
                  <span className="border-l border-black/15 px-1 py-1">
                    <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                </span>
              </span>
            </div>

            <div className="flex h-8 shrink-0 items-end gap-0.5 border-b border-[#2d2d2d] bg-[#161616] px-1.5">
              <span className="rounded-t-md bg-[#1f1f1f] px-3 py-1 text-[11px] text-gray-100 ring-1 ring-inset ring-[#2d2d2d]">
                All
              </span>
              {SERVICES.map((service) => (
                <span
                  key={service.name}
                  className="hidden items-center gap-1.5 px-2.5 py-1 text-[11px] text-gray-500 min-[420px]:flex"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {service.name}
                </span>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 sm:grid-cols-3">
              {SERVICES.map((service, index) => (
                <div
                  key={service.name}
                  className={`min-w-0 flex-col ${index === 0 ? "flex" : "hidden sm:flex"} ${
                    index > 0 ? "border-l border-[#2d2d2d]" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5 border-b border-[#262626] px-3 py-1.5 text-[11px]">
                    <span className="font-medium text-gray-300">{service.name}</span>
                    {service.port && (
                      <span className="rounded bg-emerald-400/10 px-1 font-mono text-[10px] text-emerald-300">
                        :{service.port}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-end overflow-hidden px-3 py-2.5 font-mono text-[10.5px] leading-[1.4rem]">
                    {service.lines.map((line) => (
                      <span
                        key={line.text}
                        className={`truncate ${line.tone ? TONE[line.tone] : "text-gray-300"}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
