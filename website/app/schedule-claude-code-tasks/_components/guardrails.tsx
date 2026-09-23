import { SectionHeader } from "@/components/section-header";
import { PrecheckReplica } from "./precheck-replica";
import { VerifyReplica } from "./verify-replica";

export default function Guardrails() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Guardrails"
          title="Run only when there's work. Check the work after."
          description="Two optional commands keep scheduled agents from burning tokens on nothing and from calling a broken build done."
          className="mb-12"
        />
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:grid-rows-[auto_auto_auto] md:gap-x-8 md:gap-y-0">
          <div className="md:row-span-3 md:grid md:grid-rows-subgrid">
            <PrecheckReplica />
            <h3 className="mt-6 text-base font-semibold text-gray-900 dark:text-gray-100">
              A check before the run
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Give the job a cheap command, such as &ldquo;are there new upstream
              commits?&rdquo;. The job runs only when it succeeds. Otherwise the
              run is logged as Nothing to do and no notification goes out. Press
              Test to see straight away whether the job would run.
            </p>
          </div>
          <div className="md:row-span-3 md:grid md:grid-rows-subgrid">
            <VerifyReplica />
            <h3 className="mt-6 text-base font-semibold text-gray-900 dark:text-gray-100">
              A check after the run
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Add your test suite as a follow-up to a prompt or command job. It
              runs where the job ran, and the run is marked checks passed or
              checks failed in its history and in the notification, so
              &ldquo;done&rdquo; means the tests agree.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
