import Link from "next/link";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";
import { CONFIG_PATH } from "@/lib/links";

const CONVERTED = `services:
  web:
    cmd: bin/rails server -p 3000
    port: 3000
    env:
      PORT: "3000"
  css: bin/rails tailwindcss:watch
  redis:
    cmd: redis-server
    port: 6379
  worker:
    cmd: bundle exec sidekiq
    dependsOn: [redis]

profiles:
  default: [web, css]
  full: [web, css, redis, worker]`;

type Gotcha = {
  term: ReactNode;
  key: string;
  body: ReactNode;
};

const GOTCHAS: Gotcha[] = [
  {
    key: "port",
    term: (
      <>
        <code className="font-mono">$PORT</code> is not set for you.
      </>
    ),
    body: (
      <>
        Foreman assigns a port per process type and Overmind steps one per
        process. lpm does not: <code className="font-mono">port:</code>{" "}
        is what it watches for conflicts, not something it exports, and an
        imported line that only says <code className="font-mono">$PORT</code>{" "}
        arrives with no port at all. Set it yourself —{" "}
        <code className="font-mono">env: {"{ PORT: \"3000\" }"}</code>{" "}— or
        hard-code the flag the way Rails&apos; own{" "}
        <code className="font-mono">Procfile.dev</code>{" "}already does.
      </>
    ),
  },
  {
    key: "env",
    term: (
      <>
        <code className="font-mono">.env</code> is not loaded automatically.
      </>
    ),
    body: (
      <>
        <code className="font-mono">foreman start</code> reads{" "}
        <code className="font-mono">.env</code> from the working directory;
        Overmind reads <code className="font-mono">.overmind.env</code> and then{" "}
        <code className="font-mono">.env</code>. lpm exports exactly the{" "}
        <code className="font-mono">env:</code> map you write, so move the handful
        of variables you need there, or keep loading{" "}
        <code className="font-mono">.env</code> inside the command with dotenv.
      </>
    ),
  },
  {
    key: "formation",
    term: (
      <>
        <code className="font-mono break-words sm:whitespace-nowrap">foreman start -m web=2,worker=0</code>{" "}
        becomes a profile.
      </>
    ),
    body: (
      <>
        <code className="font-mono">
          profiles: {"{ default: [web, css], full: [web, css, redis, worker] }"}
        </code>
        , then{" "}
        <code className="font-mono whitespace-nowrap">
          lpm start --profile full
        </code>
        . Named
        subsets instead of a per-run flag — and no process scaling: one entry is
        one process.
      </>
    ),
  },
  {
    key: "export",
    term: (
      <>
        Keep <code className="font-mono">foreman export</code>.
      </>
    ),
    body: "If you generate launchd or systemd units for a server, that is still Foreman's job. lpm has no export; it is the local loop only.",
  },
];

export function Migrate() {
  return (
    <section id="migrate" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Migration"
          title="Your Procfile, line by line"
          description={
            <>
              Adding the folder brings the three Procfile lines across, and the{" "}
              <code className="font-mono whitespace-nowrap">-p 3000</code>{" "}on web becomes the
              port lpm watches. What you add by hand is the Redis line a
              Procfile usually leaves out and the start order it has no room
              for. Every field is listed in the{" "}
              <Link
                href={CONFIG_PATH}
                className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              >
                config reference
              </Link>
              .
            </>
          }
        />

        <CodeBlock filename="~/.lpm/projects/myapp.yml">{CONVERTED}</CodeBlock>

        <dl className="mt-8 space-y-6">
          {GOTCHAS.map((gotcha) => (
            <div key={gotcha.key}>
              <dt className="font-semibold leading-snug text-gray-900 dark:text-gray-100">
                {gotcha.term}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {gotcha.body}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Which verbs need the app running, since this is the one thing{" "}
          <code className="font-mono">foreman start</code> never made you think
          about. <code className="font-mono">lpm start</code>,{" "}
          <code className="font-mono">lpm stop</code>,{" "}
          <code className="font-mono">lpm run</code> and{" "}
          <code className="font-mono">lpm service css restart</code> are requests
          to the app, and fail with a usage error when it is closed.{" "}
          <code className="font-mono">lpm list</code> and{" "}
          <code className="font-mono">lpm logs css</code> go straight to the
          services and answer from any shell, open app or not.{" "}
          <code className="font-mono">lpm status</code>, which reports what your
          agents are doing, needs it too.
        </p>
      </div>
    </section>
  );
}
