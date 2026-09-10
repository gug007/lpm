import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";
import { CONFIG_PATH } from "@/lib/links";

const ECOSYSTEM = `module.exports = {
  apps: [
    { name: "web", script: "npm", args: "run dev" },
    { name: "api", script: "./bin/api", env: { PORT: 4000 } },
  ],
};`;

const LPM_YML = `services:
  web: npm run dev
  api:
    cmd: ./bin/api
    port: 4000
    env:
      PORT: "4000"
    dependsOn: [web]
profiles:
  dev: [web, api]`;

const noteClass =
  "flex items-start gap-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400";
const bulletClass =
  "mt-2 w-1 h-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500";

export function EcosystemToLpm() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Side by side"
          title="ecosystem.config.js to .lpm.yml"
          description="The same two services, declared twice. Nothing here replaces the ecosystem file — it stays on the server."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <CodeBlock filename="ecosystem.config.js">{ECOSYSTEM}</CodeBlock>
          <CodeBlock filename=".lpm.yml">{LPM_YML}</CodeBlock>
        </div>

        <ul className="mt-2 space-y-2.5">
          <li className={noteClass}>
            <span className={bulletClass} />
            <span>
              Each <code className="font-mono">apps[]</code> entry&apos;s name
              plus <code className="font-mono">script</code>/
              <code className="font-mono">args</code> becomes one{" "}
              <code className="font-mono">services:</code> key and its command —
              a service with no options is one line.
            </span>
          </li>
          <li className={noteClass}>
            <span className={bulletClass} />
            <span>
              <code className="font-mono">dependsOn</code> sets start order,
              which <code className="font-mono">ecosystem.config.js</code> has no
              field for. It orders starts; it does not wait for readiness — that
              is <code className="font-mono">lpm wait --port</code>.
            </span>
          </li>
          <li className={noteClass}>
            <span className={bulletClass} />
            <span>
              <code className="font-mono">port:</code> is what lpm checks for
              conflicts and what <code className="font-mono">lpm wait</code>{" "}
              watches. The port your service actually binds still comes from your
              command or <code className="font-mono">env:</code>.
            </span>
          </li>
        </ul>

        <p className="mt-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Each field on the right — <code className="font-mono">cmd</code>,{" "}
          <code className="font-mono">port</code>,{" "}
          <code className="font-mono">env</code>,{" "}
          <code className="font-mono">dependsOn</code> and{" "}
          <code className="font-mono">profiles</code> — has its own entry in the{" "}
          <Link
            href={CONFIG_PATH}
            className="font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            config reference
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
