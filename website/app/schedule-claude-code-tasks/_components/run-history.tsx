import { Check } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { RunListReplica } from "./run-list-replica";
import { RunThreadReplica } from "./run-thread-replica";

const POINTS = [
  "Runs are listed newest first, with outcome, duration and, for Claude Code, what the run cost.",
  "Replies run in the same folder or copy the run used. Claude Code picks up the same session; other agents get the conversation so far.",
  "Keep the same agent, model and effort for a reply, or switch to a different one.",
  "While a job runs, its page streams live output with an elapsed timer and a Stop button.",
];

export default function RunHistory() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Results"
          title="Read the answer. Reply to keep it going."
          description="Every run leaves a record. Open one to read the agent's full answer, then send a follow-up like you would in a chat."
          className="mb-12"
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <figure className="flex min-w-0 flex-col">
            <div className="flex-1">
              <RunListReplica />
            </div>
            <figcaption className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
              A job&apos;s page: every run with its outcome, duration and cost.
            </figcaption>
          </figure>
          <figure className="flex min-w-0 flex-col">
            <div className="flex-1">
              <RunThreadReplica />
            </div>
            <figcaption className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
              A run opened as a conversation, with a reply already answered.
            </figcaption>
          </figure>
        </div>
        <ul className="mx-auto mt-10 grid max-w-4xl gap-x-8 gap-y-3 sm:grid-cols-2">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
