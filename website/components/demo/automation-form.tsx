"use client";

import { useState } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import {
  FIELD_CLASS,
  FieldLabel,
  PrimaryButton,
  SecondaryButton,
  SelectField,
} from "./ui-kit";
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
      autoComplete="off"
      className="mb-3 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            autoFocus
            {...NO_AUTOFILL}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Morning triage"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Project">
          <SelectField
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            {projects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="What the agent should do">
          <input
            {...NO_AUTOFILL}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Review open PRs and summarise what changed"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Schedule">
          <SelectField
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
          >
            {SCHEDULES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
        <PrimaryButton type="submit">Create job</PrimaryButton>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
