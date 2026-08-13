"use client";

import { useState } from "react";
import type { DemoJob } from "./automations";

const SCHEDULES = [
  { value: "Every day at 09:00", next: "next run in 11h 12m" },
  { value: "Every hour", next: "next run in 24m" },
  { value: "Weekdays at 18:00", next: "next run in 7h 42m" },
  { value: "Manual", next: "" },
] as const;

type AutomationFormProps = {
  projects: string[];
  onCreate: (job: Omit<DemoJob, "id">) => void;
  onCancel: () => void;
};

export function AutomationForm({ projects, onCreate, onCancel }: AutomationFormProps) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState<string>(SCHEDULES[0].value);
  const [project, setProject] = useState(projects[0] ?? "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const name = label.trim() || "New job";
    const picked = SCHEDULES.find((s) => s.value === schedule) ?? SCHEDULES[0];
    onCreate({
      label: name,
      emoji: "🕒",
      description: prompt.trim() || "Runs an agent on a schedule and reports back here.",
      scope: project,
      schedule: picked.value,
      nextRun: picked.next,
      enabled: true,
      running: false,
      lastRun: "",
      unread: 0,
      messages: [],
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mb-3 rounded-xl border border-[#2e2e2e] bg-[#1d1d1d] p-3.5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Morning triage"
            className="w-full rounded-lg border border-[#2e2e2e] bg-[#161616] px-2.5 py-1.5 text-[12px] text-[#e5e5e5] outline-none placeholder:text-[#8a8a8a] focus:border-[#454545]"
          />
        </Field>
        <Field label="Project">
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="w-full rounded-lg border border-[#2e2e2e] bg-[#161616] px-2.5 py-1.5 text-[12px] text-[#e5e5e5] outline-none focus:border-[#454545]"
          >
            {projects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What the agent should do">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Review open PRs and summarise what changed"
            className="w-full rounded-lg border border-[#2e2e2e] bg-[#161616] px-2.5 py-1.5 text-[12px] text-[#e5e5e5] outline-none placeholder:text-[#8a8a8a] focus:border-[#454545]"
          />
        </Field>
        <Field label="Schedule">
          <select
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className="w-full rounded-lg border border-[#2e2e2e] bg-[#161616] px-2.5 py-1.5 text-[12px] text-[#e5e5e5] outline-none focus:border-[#454545]"
          >
            {SCHEDULES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1.5 text-[12px] text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#e5e5e5] px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] transition-opacity hover:opacity-90"
        >
          Create job
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[#919191]">
        {label}
      </span>
      {children}
    </label>
  );
}
