"use client";

import { useState, type ReactNode } from "react";
import {
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";
import { FOCUS_RING } from "./ui";
import { SettingsToggle } from "./ui-kit";

const THEMES = [
  { id: "Light", icon: Sun },
  { id: "Dark", icon: Moon },
  { id: "System", icon: Monitor },
] as const;
type Theme = (typeof THEMES)[number]["id"];

export function SettingsView() {
  const [theme, setTheme] = useState<Theme>("Dark");
  const [doubleClick, setDoubleClick] = useState(true);

  return (
    <div className="relative flex flex-1 min-w-0 min-h-0 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="text-base font-semibold text-[#e5e5e5]">Settings</div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border-t border-[#2e2e2e] px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-[520px] space-y-6">
          <Section title="Appearance">
            <Row label="Theme" desc="How lpm looks on this machine">
              <div className="flex rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] p-0.5">
                {THEMES.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors ${FOCUS_RING} ${
                      theme === id
                        ? "bg-[#333333] text-[#e5e5e5] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                        : "text-[#919191] hover:text-[#b3b3b3]"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {id}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          <Section title="Behavior">
            <Row
              label="Double-click to start/stop"
              desc="Double-click a project in sidebar to toggle it"
            >
              <SettingsToggle
                checked={doubleClick}
                onChange={setDoubleClick}
                aria-label="Double-click to start/stop"
              />
            </Row>
            <Row
              label="Default project directory"
              desc="Where new projects are created"
            >
              <Value mono>~/Projects</Value>
            </Row>
          </Section>

          <Section title="AI & accounts">
            <Row label="Default AI CLI" desc="Used for new terminals and templates">
              <Value>Claude Code</Value>
            </Row>
            <Row label="Claude accounts" desc="Pin a Claude login per project">
              <Value>2 connected</Value>
            </Row>
          </Section>

          <p className="text-[11px] leading-relaxed text-[#919191]">
            You&apos;re in the interactive demo — these preview lpm&apos;s real
            Settings. Download the app to save your own.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="px-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[#919191]">
        {title}
      </h2>
      <div className="divide-y divide-[#2e2e2e] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424]">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#e5e5e5]">{label}</p>
        {desc && <p className="text-[11px] text-[#919191]">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Value({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className={`text-xs text-[#919191] ${mono ? "font-mono" : ""}`}>
      {children}
    </span>
  );
}
