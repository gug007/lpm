"use client";

import { useState, type ReactNode } from "react";
import {
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";

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
              <div className="flex rounded-lg border border-[#2e2e2e] bg-[#242424] p-0.5">
                {THEMES.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      theme === id
                        ? "bg-[#333333] text-[#e5e5e5]"
                        : "text-[#919191] hover:text-[#e5e5e5]"
                    }`}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2} />
                    {id}
                  </button>
                ))}
              </div>
            </Row>
          </Section>

          <Section title="Behavior">
            <ToggleRow
              label="Double-click a project to start / stop"
              on={doubleClick}
              onToggle={() => setDoubleClick((v) => !v)}
            />
            <Row
              label="Default project directory"
              desc="Where new projects are created"
            >
              <Value>~/Projects</Value>
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

          <p className="text-[11px] leading-relaxed text-[#666]">
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
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#919191]">
        {title}
      </div>
      <div className="overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#1d1d1d]">
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
    <div className="flex items-center justify-between gap-4 border-b border-[#2e2e2e] px-3.5 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] text-[#e5e5e5]">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] text-[#919191]">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="text-[12px] text-[#b3b3b3]">{children}</span>;
}

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2e2e2e] px-3.5 py-3 last:border-b-0">
      <div className="text-[13px] text-[#e5e5e5]">{label}</div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={`inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-[#3a3a3a]"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            on ? "translate-x-[16px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
