import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { FieldTable, type Field } from "@/components/config/field-table";
import { Section } from "@/components/config/section";
import { TableOfContents } from "@/components/config/toc";

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
    required: false,
    description: (
      <>
        Shell command to run. Required unless{" "}
        <code className="font-mono">actions</code> is set.
      </>
    ),
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
        Inherited by nested actions.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: "Environment variables. Inherited by nested actions.",
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
  {
    name: "actions",
    type: "map",
    required: false,
    description: (
      <>
        Nested child actions. Renders as a dropdown. If the parent also has{" "}
        <code className="font-mono">cmd</code>, renders as a split button.
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
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Reference"
          title="Configuration"
          description="Everything you can put in a project config file."
          as="h1"
        />

        <div className="lg:flex lg:gap-12">
          <aside className="hidden lg:block lg:w-44 lg:flex-shrink-0">
            <div className="sticky top-20">
              <TableOfContents />
            </div>
          </aside>

          <div className="lg:flex-1 lg:min-w-0 lg:max-w-3xl">
            <Section
              id="project"
              title="Project"
              description="Top-level fields that identify the project."
            >
              <CodeBlock>{`name: myapp
root: ~/Projects/myapp`}</CodeBlock>
              <FieldTable fields={projectFields} />
            </Section>

            <Section
              id="services"
              title="Services"
              description="Long-running processes that the desktop app starts and stops together. At least one service is required."
            >
              <CodeBlock>
                {`services:
  `}
                <Comment># shorthand — just the command</Comment>
                {`
  web: npm run dev

  `}
                <Comment># full form</Comment>
                {`
  server:
    cmd: node server.js
    cwd: ./server             `}
                <Comment># working directory (relative to root)</Comment>
                {`
    port: 4000                `}
                <Comment># port (0-65535, must be unique)</Comment>
                {`
    env:                      `}
                <Comment># environment variables</Comment>
                {`
      API_KEY: dev-secret`}
              </CodeBlock>
              <FieldTable fields={serviceFields} />
            </Section>

            <Section
              id="actions"
              title="Actions"
              description="One-shot commands like test runners, migrations, or deploy scripts. Trigger them from the project panel in the desktop app."
            >
              <CodeBlock>
                {`actions:
  test: npm test              `}
                <Comment># shorthand</Comment>
                {`

  deploy:                     `}
                <Comment># full form</Comment>
                {`
    cmd: ./scripts/deploy.sh
    label: Deploy to Production `}
                <Comment># display name in the UI</Comment>
                {`
    confirm: true             `}
                <Comment># ask before running</Comment>
                {`
    display: button           `}
                <Comment># show as a button instead of in menu</Comment>
                {`
    env:
      NODE_ENV: production`}
              </CodeBlock>
              <FieldTable fields={actionFields} />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Shorthand form for common dev commands:
              </p>
              <CodeBlock>{`actions:
  test: npm test
  lint: npm run lint
  build: npm run build
  typecheck: npx tsc --noEmit
  format: npx prettier --write .`}</CodeBlock>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Destructive operations use{" "}
                <code className="font-mono">confirm</code> and typically display as
                a button:
              </p>
              <CodeBlock>{`actions:
  reset-cache:
    cmd: rm -rf .next node_modules/.cache
    label: Reset Cache
    confirm: true
    display: button
  rollback:
    cmd: ./scripts/rollback.sh
    label: Rollback Deploy
    confirm: true
    env:
      NODE_ENV: production`}</CodeBlock>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Nest actions to create a dropdown menu. When the parent has a{" "}
                <code className="font-mono">cmd</code>, it renders as a split
                button — clicking the main area runs the parent, clicking the
                chevron opens the dropdown:
              </p>
              <CodeBlock>
                {`actions:
  deploy:
    cmd: ./deploy.sh staging     `}
                <Comment># split button — main click runs this</Comment>
                {`
    label: 🚀 Deploy
    display: button
    confirm: true
    actions:                     `}
                <Comment># chevron opens these</Comment>
                {`
      production:
        cmd: ./deploy.sh production
        label: 🔴 Production
        confirm: true
      preview:
        cmd: ./deploy.sh preview
        label: 👁️ Preview`}
              </CodeBlock>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Without a <code className="font-mono">cmd</code>, the whole
                button becomes a dropdown trigger:
              </p>
              <CodeBlock>{`actions:
  db:
    label: 🗄️ Database
    display: button
    cwd: ./backend
    actions:
      migrate:
        cmd: python manage.py migrate
        label: 📦 Migrate
      seed:
        cmd: python manage.py seed
        label: 🌱 Seed
      reset:
        cmd: python manage.py flush
        label: 💣 Reset
        confirm: true`}</CodeBlock>

              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Children inherit <code className="font-mono">cwd</code> and{" "}
                <code className="font-mono">env</code> from their parent unless
                they override them.
              </p>
            </Section>

            <Section
              id="terminals"
              title="Terminals"
              description="Persistent interactive shells you can open from the app."
            >
              <CodeBlock>
                {`terminals:
  codex: codex                `}
                <Comment># shorthand</Comment>
                {`

  claude:                     `}
                <Comment># full form</Comment>
                {`
    cmd: claude
    label: Claude Code
    display: button`}
              </CodeBlock>
              <FieldTable fields={terminalFields} />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Keep your AI coding agents one click away:
              </p>
              <CodeBlock>{`terminals:
  claude: claude
  codex: codex
  node: node
  logs: tail -f ./logs/dev.log`}</CodeBlock>
            </Section>

            <Section
              id="profiles"
              title="Profiles"
              description="Named subsets of services. Pick a profile from the project switcher in the desktop app. If no profile is selected, all services start."
            >
              <CodeBlock>{`profiles:
  minimal: [web]
  full:    [web, server]`}</CodeBlock>
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                Each service name must reference a service defined in{" "}
                <code className="font-mono">services</code>. Services can appear in
                any number of profiles — overlap is fine.
              </p>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Define multiple profiles to match different workflows:
              </p>
              <CodeBlock>{`profiles:
  minimal: [web]
  local:   [web, server]
  full:    [web, server, worker]`}</CodeBlock>
            </Section>

            <Section
              id="global-config"
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

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                System-wide utilities shared across every project:
              </p>
              <CodeBlock filename="~/.lpm/global.yml">
                {`actions:
  prune-branches:
    cmd: git branch --merged main | grep -v main | xargs git branch -d
    label: Prune merged branches
    confirm: true
  brew-upgrade:
    cmd: brew update && brew upgrade
    label: Brew upgrade

terminals:
  htop: htop
  btop: btop
  ncdu: ncdu ~`}
              </CodeBlock>
            </Section>

            <Section
              id="recipes"
              title="Recipes"
              description="Common configurations combining services, actions, and terminals."
            >
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Minimal Next.js app:
              </p>
              <CodeBlock>{`name: blog
root: ~/Projects/blog
services:
  web: npm run dev`}</CodeBlock>

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js app with tests and linting:
              </p>
              <CodeBlock>{`name: blog
root: ~/Projects/blog
services:
  web: npm run dev
actions:
  test: npm test
  lint: npm run lint
  build: npm run build`}</CodeBlock>

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js front-end paired with a Node server API:
              </p>
              <CodeBlock>{`services:
  web: npm run dev
  server:
    cmd: node server.js
    cwd: ./server
    port: 4000
actions:
  deploy:
    cmd: ./scripts/deploy.sh
    confirm: true
terminals:
  logs: tail -f ./logs/server.log`}</CodeBlock>

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js with env vars for local dev:
              </p>
              <CodeBlock>{`services:
  web:
    cmd: npm run dev
    port: 3000
    env:
      API_URL: http://localhost:4000
      NEXTAUTH_SECRET: dev-secret
      NODE_ENV: development`}</CodeBlock>

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Monorepo with a Next.js app and a docs site:
              </p>
              <CodeBlock>{`services:
  web:
    cmd: npm run dev
    cwd: ./apps/web
    port: 3000
  docs:
    cmd: npm run dev
    cwd: ./apps/docs
    port: 3001`}</CodeBlock>
            </Section>

            <Section id="path-resolution" title="Path resolution">
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
              id="validation"
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
        </div>
      </div>
    </section>
  );
}
