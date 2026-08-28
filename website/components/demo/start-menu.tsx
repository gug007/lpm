"use client";

import type { DemoProfile, DemoService } from "./projects";

type StartMenuProps = {
  profiles: DemoProfile[];
  services: DemoService[];
  runningServices: Set<string>;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
};

export function StartMenu({
  profiles,
  services,
  runningServices,
  onPickProfile,
  onToggleService,
}: StartMenuProps) {
  return (
    <div
      role="menu"
      className="switcher-in absolute right-0 top-full z-40 mt-2 min-w-[280px] max-w-[340px] origin-top-right overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] shadow-2xl"
    >
      {profiles.length > 0 && (
        <>
          <Section label="Profiles">
            {profiles.map((p) => {
              const active =
                runningServices.size > 0 &&
                p.services.length === runningServices.size &&
                p.services.every((s) => runningServices.has(s));
              return (
                <button
                  key={p.name}
                  type="button"
                  role="menuitem"
                  onClick={() => onPickProfile(p.name)}
                  className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[#2a2a2a] focus-visible:bg-[#2a2a2a] focus-visible:outline-none ${
                    active ? "text-[#e5e5e5]" : "text-[#b3b3b3]"
                  }`}
                >
                  <Dot active={active} className="mt-[6px]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate text-[13px] ${active ? "font-medium" : ""}`}
                    >
                      {p.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-[#919191]">
                      {p.services.join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </Section>
          <div className="mx-4 border-t border-[#2e2e2e]" />
        </>
      )}
      <Section label="Services">
        {services.length > 0 ? (
          services.map((s) => {
            const running = runningServices.has(s.name);
            return (
              <button
                key={s.name}
                type="button"
                role="menuitemcheckbox"
                aria-checked={running}
                onClick={() => onToggleService(s.name)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[#2a2a2a] focus-visible:bg-[#2a2a2a] focus-visible:outline-none ${
                  running ? "font-medium text-[#e5e5e5]" : "text-[#b3b3b3]"
                }`}
              >
                <Dot active={running} />
                <span className="flex-1 truncate font-mono">{s.name}</span>
                {s.port !== undefined && (
                  <span className="text-[11px] tabular-nums text-[#919191]">
                    :{s.port}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="px-4 py-2 text-[13px] italic text-[#919191]">
            No services yet
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-1.5 pt-2">
      <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#919191]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Dot({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${className}`}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />}
    </span>
  );
}
