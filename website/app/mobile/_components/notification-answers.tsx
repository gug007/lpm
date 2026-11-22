import {
  ANSWER_PUSH,
  PERMISSION_PUSH,
  type Push,
} from "@/components/home/paired-devices-data";
import { PushCard } from "@/components/home/paired-devices-push";

const ALERTS: { push: Push; caption: string }[] = [
  {
    push: PERMISSION_PUSH,
    caption: "A Claude Code or Codex permission prompt: Allow or Deny.",
  },
  {
    push: ANSWER_PUSH,
    caption: "Any agent's finished turn: Reply with a line of text.",
  },
];

// Both kinds of alert lpm Link can answer without opening, drawn the way the
// phone shows them once the notification is opened up.
export default function NotificationAnswers() {
  return (
    <figure className="mt-10 rounded-3xl bg-[radial-gradient(120%_90%_at_50%_0%,#1f2937_0%,#111113_65%)] px-5 py-8 sm:px-10 sm:py-10">
      <div
        aria-hidden="true"
        className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2 sm:gap-8"
      >
        {ALERTS.map(({ push, caption }) => (
          <div key={push.title} className="flex flex-col gap-3">
            <div className="[zoom:1.25]">
              <PushCard push={push} expanded className="bg-white/[0.13]" />
            </div>
            <p className="text-pretty text-center text-[13px] leading-snug text-gray-400">
              {caption}
            </p>
          </div>
        ))}
      </div>
      <figcaption className="mx-auto mt-6 max-w-xl text-pretty text-center text-[13px] leading-relaxed text-gray-300 sm:mt-8">
        <span className="sr-only">
          A permission prompt from Codex in the storefront project with Allow
          and Deny buttons, and a finished Claude Code turn in auth-service
          asking to commit and open a PR, with Reply, Review Changes and Open
          Tab buttons.{" "}
        </span>
        Each answer needs your phone unlocked, and reaches your computer even
        when lpm Link was closed. If the agent has already moved on, nothing is
        typed and the phone tells you why.
      </figcaption>
    </figure>
  );
}
