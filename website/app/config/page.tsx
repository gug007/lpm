import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { FieldTable, type Field } from "@/components/config/field-table";
import { Section } from "@/components/config/section";

export const metadata: Metadata = {
  title: "Configuration Reference",
  description:
    "Full configuration reference for lpm. Learn how to define services, actions, terminals, profiles, and global config.",
  alternates: {
    canonical: "https://lpm.cx/config",
  },
};

const projectFields: Field[] = [
  {
    name: "name",
    type: "string",
    required: true,
    description: "Project name (used as identifier)",
  },
  {
    name: "root",
    type: "string",
    required: true,
    description: (
      <>
        Project root directory. Supports <code className="font-mono">~</code>.
      </>
    ),
  },
];

const serviceFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: "Shell command to run",
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Working directory (relative to <code className="font-mono">root</code>{" "}
        or absolute). Supports <code className="font-mono">~</code>.
      </>
    ),
  },
  {
    name: "port",
    type: "int",
    required: false,
    description:
      "Port the service listens on (0-65535). Must be unique across services.",
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: "Environment variables",
  },
  {
    name: "profiles",
    type: "[]string",
    required: false,
    description: "Profiles this service belongs to",
  },
];

const actionFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: "Shell command to run",
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: "Display name in the UI",
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Working directory. Supports <code className="font-mono">~</code>.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: "Environment variables",
  },
  {
    name: "confirm",
    type: "bool",
    required: false,
    description: "Prompt for confirmation before running",
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        <code className="font-mono">button</code> or menu (default)
      </>
    ),
  },
];

const terminalFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: "Shell command to run",
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: "Display name in the UI",
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Working directory. Supports <code className="font-mono">~</code>.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: "Environment variables",
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        <code className="font-mono">button</code> or menu (default)
      </>
    ),
  },
];

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <ChevronRight
        aria-hidden
        className="w-3.5 h-3.5 mt-1 text-gray-300 dark:text-gray-700 flex-shrink-0"
      />
      <span>{children}</span>
    </li>
  );
}

export default function ConfigPage() {
  return (
    <section className="pt-28 sm:pt-36 pb-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Reference"
          title="Configuration"
          description="Everything you can put in a project config file."
          as="h1"
        />

        <Section
          title="Project"
          description="Top-level fields that identify the project."
        >
          <CodeBlock>{`name: myapp
root: ~/Projects/myapp`}</CodeBlock>
          <FieldTable fields={projectFields} />
        </Section>

        <Section
          title="Services"
          description="Long-running processes that lpm starts and stops together. At least one service is required."
        >
          <CodeBlock>
            {`services:
  `}
            <Comment># shorthand — just the command</Comment>
            {`
  worker: celery -A backend worker

  `}
            <Comment># full form</Comment>
            {`
  api:
    cmd: go run .
    cwd: ./backend            `}
            <Comment># working directory (relative to root)</Comment>
            {`
    port: 8080                `}
            <Comment># port (0-65535, must be unique)</Comment>
            {`
    env:                      `}
            <Comment># environment variables</Comment>
            {`
      DATABASE_URL: postgres://localhost/myapp`}
          </CodeBlock>
          <FieldTable fields={serviceFields} />
        </Section>

        <Section
          title="Actions"
          description={
            <>
              One-shot commands like test runners, migrations, or deploy
              scripts. Run from the app or CLI with{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300 text-xs">
                lpm run &lt;project&gt; &lt;action&gt;
              </code>
              .
            </>
          }
        >
          <CodeBlock>
            {`actions:
  test: go test ./...         `}
            <Comment># shorthand</Comment>
            {`

  migrate:                    `}
            <Comment># full form</Comment>
            {`
    cmd: rails db:migrate
    cwd: ./backend
    label: Run Migrations     `}
            <Comment># display name in the UI</Comment>
            {`
    confirm: true             `}
            <Comment># ask before running</Comment>
            {`
    display: button           `}
            <Comment># show as a button instead of in menu</Comment>
            {`
    env:
      RAILS_ENV: production`}
          </CodeBlock>
          <FieldTable fields={actionFields} />
        </Section>

        <Section
          title="Terminals"
          description="Persistent interactive shells you can open from the app."
        >
          <CodeBlock>
            {`terminals:
  console: rails console     `}
            <Comment># shorthand</Comment>
            {`

  psql:                       `}
            <Comment># full form</Comment>
            {`
    cmd: psql myapp_dev
    label: Database
    cwd: ./backend
    display: button`}
          </CodeBlock>
          <FieldTable fields={terminalFields} />
        </Section>

        <Section
          title="Profiles"
          description={
            <>
              Named subsets of services. Start a profile with{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300 text-xs">
                lpm myapp -p &lt;profile&gt;
              </code>{" "}
              or pick one from the desktop app. If no profile is specified, all
              services start.
            </>
          }
        >
          <CodeBlock>{`profiles:
  frontend-only:
    - frontend
  full-stack:
    - api
    - frontend
    - worker`}</CodeBlock>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            Each service name must reference a service defined in{" "}
            <code className="font-mono">services</code>.
          </p>
        </Section>

        <Section
          title="Global Config"
          description={
            <>
              <code className="font-mono text-gray-600 dark:text-gray-300 text-xs">
                ~/.lpm/global.yml
              </code>{" "}
              defines actions and terminals shared across all projects.
              Project-level entries take precedence when names collide.
            </>
          }
        >
          <CodeBlock filename="~/.lpm/global.yml">
            {`actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true

terminals:
  htop: htop`}
          </CodeBlock>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            Global config only supports{" "}
            <code className="font-mono">actions</code> and{" "}
            <code className="font-mono">terminals</code> — not services or
            profiles.
          </p>
        </Section>

        <Section title="Path resolution">
          <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            <Bullet>
              <code className="font-mono text-gray-600 dark:text-gray-300">
                ~
              </code>{" "}
              expands to your home directory
            </Bullet>
            <Bullet>
              Relative{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300">
                cwd
              </code>{" "}
              paths resolve relative to{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300">
                root
              </code>
            </Bullet>
            <Bullet>Absolute paths are used as-is</Bullet>
          </ul>
        </Section>

        <Section
          title="Validation"
          description="Config is validated on load and save. Validation checks:"
          last
        >
          <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            <Bullet>At least one service is defined</Bullet>
            <Bullet>
              All{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300">
                cmd
              </code>{" "}
              fields are non-empty
            </Bullet>
            <Bullet>Ports are in range 0-65535 with no duplicates</Bullet>
            <Bullet>
              All{" "}
              <code className="font-mono text-gray-600 dark:text-gray-300">
                cwd
              </code>{" "}
              paths point to existing directories
            </Bullet>
            <Bullet>Profile entries reference existing services</Bullet>
          </ul>
        </Section>
      </div>
    </section>
  );
}
