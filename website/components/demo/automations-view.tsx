"use client";

import { useState } from "react";
import { History, Play, Plus, Square } from "lucide-react";
import { AutomationForm } from "./automation-form";
import {
  JOB_RESULT_DOT,
  jobStatusLine,
  unreadJobCount,
  type DemoJob,
} from "./automations";

const RUN_MS = 2600;

const RUN_MESSAGE = "Ran on demand — 3 files touched, suite green.";

type AutomationsViewProps = {
  jobs: DemoJob[];
  setJobs: (update: (jobs: DemoJob[]) => DemoJob[]) => void;
  projects: string[];
};

export function AutomationsView({ jobs, setJobs, projects }: AutomationsViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const patch = (id: string, mutate: (job: DemoJob) => DemoJob) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? mutate(job) : job)));
  };

  // The job list lives above this view, so a run left in flight keeps going
  // when you switch away — the same as a real headless run. Stopping the job
  // clears `running`, which is what the timer checks before finishing it.
  const runNow = (id: string) => {
    patch(id, (job) => ({ ...job, running: true }));
    setTimeout(() => {
      patch(id, (job) =>
        job.running
          ? {
              ...job,
              running: false,
              lastResult: "ok",
              lastRun: "just now",
              unread: job.unread + 1,
              messages: [...job.messages, { at: "now", text: RUN_MESSAGE }],
            }
          : job,
      );
    }, RUN_MS);
  };

  const stopRun = (id: string) => patch(id, (job) => ({ ...job, running: false }));

  const openJob = (id: string) => {
    setOpen((prev) => (prev === id ? null : id));
    patch(id, (job) => (job.unread > 0 ? { ...job, unread: 0 } : job));
  };

  const unread = unreadJobCount(jobs);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <History className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Automations</div>
            {unread > 0 && (
              <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#60a5fa] px-1.5 text-[10px] font-semibold leading-none tabular-nums text-[#1a1a1a]">
                {unread}
              </span>
            )}
          </div>
          <div className="text-[10px] text-[#919191]">
            {unread > 0
              ? `${unread} ${unread === 1 ? "job has" : "jobs have"} new messages since you last looked`
              : "Every scheduled job across your projects, in one place"}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {unread > 0 && (
            <button
              type="button"
              onClick={() => setJobs((prev) => prev.map((job) => ({ ...job, unread: 0 })))}
              className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-[#e5e5e5] px-2.5 py-1.5 text-[11px] font-medium text-[#1a1a1a] transition-opacity hover:opacity-90"
          >
            <Plus className="h-3 w-3" strokeWidth={2.25} />
            New job
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2e2e2e] px-3 py-3 sm:px-4">
        {adding && (
          <AutomationForm
            projects={projects}
            onCancel={() => setAdding(false)}
            onCreate={(job) => {
              setJobs((prev) => [{ ...job, id: `job-${prev.length + 1}` }, ...prev]);
              setAdding(false);
            }}
          />
        )}
        <div className="flex flex-col">
          {jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              open={open === job.id}
              onOpen={() => openJob(job.id)}
              onRunNow={() => runNow(job.id)}
              onStop={() => stopRun(job.id)}
              onToggleEnabled={() =>
                patch(job.id, (current) => ({ ...current, enabled: !current.enabled }))
              }
            />
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-[#666]">
          Jobs run an agent in the project on your machine — on a schedule or on demand — and leave
          what they did here.
        </p>
      </div>
    </div>
  );
}

function JobRow({
  job,
  open,
  onOpen,
  onRunNow,
  onStop,
  onToggleEnabled,
}: {
  job: DemoJob;
  open: boolean;
  onOpen: () => void;
  onRunNow: () => void;
  onStop: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div
      className={`group rounded-lg px-1.5 py-2.5 transition-colors hover:bg-[#222222] ${
        job.unread > 0 ? "bg-[#60a5fa]/[0.06]" : ""
      } ${job.enabled ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex w-1.5 shrink-0 justify-center pt-[7px]">
          {job.unread > 0 && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#60a5fa]" />
          )}
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#2a2a2a] text-[13px]">
          {job.emoji}
        </span>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 shrink truncate text-[13px] text-[#e5e5e5] ${
                job.unread > 0 ? "font-semibold" : "font-medium"
              }`}
            >
              {job.label}
            </span>
            <span className="shrink-0 rounded border border-[#2e2e2e] px-1.5 py-px text-[9px] uppercase tracking-wide text-[#919191]">
              {job.scope}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-[#b3b3b3]">
            {job.description}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[#919191]">
            {job.running ? (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#22d3ee]" />
            ) : (
              job.lastResult && (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${JOB_RESULT_DOT[job.lastResult]}`}
                />
              )
            )}
            <span className={`min-w-0 truncate ${job.running ? "text-[#22d3ee]" : ""}`}>
              {job.unread > 0 && !job.running && (
                <span className="font-medium text-[#60a5fa]">
                  {job.unread} new {job.unread === 1 ? "message" : "messages"} ·{" "}
                </span>
              )}
              {jobStatusLine(job)}
            </span>
          </span>
        </button>
        {job.running ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop"
            aria-label={`Stop ${job.label}`}
            className="shrink-0 rounded-md p-1.5 text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#f87171]"
          >
            <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunNow}
            title="Run now"
            aria-label={`Run ${job.label} now`}
            className="shrink-0 rounded-md p-1.5 text-[#919191] opacity-0 transition-opacity hover:bg-[#2a2a2a] hover:text-[#e5e5e5] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Play className="h-3 w-3" strokeWidth={2} fill="currentColor" />
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={job.enabled}
          aria-label={`${job.enabled ? "Pause" : "Resume"} ${job.label}`}
          onClick={onToggleEnabled}
          className={`mt-1 inline-flex h-[16px] w-7 shrink-0 items-center rounded-full transition-colors ${
            job.enabled ? "bg-emerald-500" : "bg-[#3a3a3a]"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
              job.enabled ? "translate-x-[14px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>

      {open && (
        <div className="ml-[46px] mt-2 flex flex-col gap-1.5 border-l border-[#2e2e2e] pl-3">
          {job.messages.length === 0 ? (
            <span className="text-[11px] text-[#919191]">
              No runs yet — hit play to run it once now.
            </span>
          ) : (
            job.messages.map((message, index) => (
              <span key={index} className="flex gap-2 text-[11px] leading-snug text-[#b3b3b3]">
                <span className="shrink-0 tabular-nums text-[#666]">{message.at}</span>
                <span className="min-w-0">{message.text}</span>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}
