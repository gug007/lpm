import Link from "next/link";
import { ArrowRight, Bell, Smartphone, SquareTerminal } from "lucide-react";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH } from "@/lib/links";
import { MacBannerReplica } from "./mac-banner-replica";
import { PhonePushReplica } from "./phone-push-replica";

const CARD =
  "flex flex-col rounded-2xl border border-gray-200 bg-gray-50/40 p-6 dark:border-gray-800 dark:bg-white/[0.02] sm:p-8";
const ICON =
  "flex h-10 w-10 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06]";
const BODY = "mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400";

export default function StayInLoop() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Stay in the loop"
          title="Hear back on your Mac, your iPhone, or in a terminal"
          description="You don't have to keep the Automations screen open to know how the night went."
          className="mb-12"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <div className={CARD}>
            <span className={ICON}>
              <Bell className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">
              On your Mac
            </h3>
            <p className={BODY}>
              The sidebar counts unread results until you open them. When lpm
              isn&apos;t in front, macOS banners follow each run, and a finished
              run&apos;s banner carries the first line of the answer, what a
              Claude Code run cost and how the check went.
            </p>
            <div className="mt-auto pt-6">
              <MacBannerReplica />
            </div>
          </div>
          <div className={CARD}>
            <span className={ICON}>
              <Smartphone className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">
              On your iPhone
            </h3>
            <p className={BODY}>
              The free lpm link app lists your automations with their unread
              messages. Run or stop one, pause its schedule, create or edit a
              job, open any run&apos;s transcript and answer it. Push
              notifications can tell you when a job starts, finishes, or fails
              or times out, and you pick which ones you get.
            </p>
            <Link
              href={MOBILE_PATH}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-gray-900 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-100 dark:hover:text-gray-300 dark:focus-visible:ring-white"
            >
              More about lpm link
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="mt-auto pt-6">
              <PhonePushReplica />
            </div>
          </div>
        </div>

        <div className={`${CARD} mt-6 lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-10`}>
          <div>
            <span className={ICON}>
              <SquareTerminal className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">
              From the lpm CLI
            </h3>
            <p className={BODY}>
              List, run, stop, pause and resume automations, read their history
              or live output, and reply to an AI job, from any terminal or from
              another agent. Add{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                --json
              </code>{" "}
              for output scripts can parse. The desktop app needs to be running,
              and jobs are created in the app or on the phone.
            </p>
          </div>
          <div className="mt-6 min-w-0 lg:mt-0">
            <CodeBlock filename="lpm automations">
              <Comment># Every automation across your projects</Comment>
              {"\n"}lpm automations list --all
              {"\n\n"}
              <Comment># Run one now, then read how it went (-p picks another project)</Comment>
              {"\n"}lpm automations run nightly-dependency-update
              {"\n"}lpm automations history nightly-dependency-update
              {"\n\n"}
              <Comment># Pause the schedule, or keep the conversation going</Comment>
              {"\n"}lpm automations pause nightly-dependency-update
              {"\n"}lpm automations reply nightly-dependency-update &quot;Try eslint 10 too&quot;
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
