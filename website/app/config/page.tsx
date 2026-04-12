import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { FieldTable, type Field } from "@/components/config/field-table";
import { ConfigPlayground } from "@/components/config/playground";
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
    description: (
      <>
        The label you&rsquo;ll see in the sidebar of the desktop app. Pick
        something short you&rsquo;ll recognize at a glance, like{" "}
        <code className="font-mono">myapp</code> or{" "}
        <code className="font-mono">blog</code>.
      </>
    ),
  },
  {
    name: "root",
    type: "string",
    required: true,
    description: (
      <>
        The folder on your computer where this project lives. Every other path
        in the config (like <code className="font-mono">cwd</code>) is
        interpreted relative to this folder.{" "}
        <code className="font-mono">~</code> is a shortcut for your home
        directory (e.g.{" "}
        <code className="font-mono">~/Projects/myapp</code>).
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

const PROJECT_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
`;

const SERVICES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  # shorthand — just the command
  web: npm run dev

  # full form
  server:
    cmd: node server.js
    cwd: ./server             # working directory (relative to root)
    port: 4000                # port (0-65535, must be unique)
    env:                      # environment variables
      API_KEY: dev-secret
`;

const ACTIONS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  test: npm test              # shorthand

  deploy:                     # full form
    cmd: ./scripts/deploy.sh
    label: Deploy to Production  # display name in the UI
    confirm: true             # ask before running
    display: button           # show as a button instead of in menu
    env:
      NODE_ENV: production
`;

const ACTIONS_SHORTHAND_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  test: npm test
  lint: npm run lint
  build: npm run build
  typecheck: npx tsc --noEmit
  format: npx prettier --write .
`;

const ACTIONS_DESTRUCTIVE_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
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
      NODE_ENV: production
`;

const ACTIONS_NESTED_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
  deploy:
    cmd: ./deploy.sh staging     # split button — main click runs this
    label: 🚀 Deploy
    display: button
    confirm: true
    actions:                     # chevron opens these
      production:
        cmd: ./deploy.sh production
        label: 🔴 Production
        confirm: true
      preview:
        cmd: ./deploy.sh preview
        label: 👁️ Preview
`;

const ACTIONS_DROPDOWN_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
actions:
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
        confirm: true
`;

const TERMINALS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
terminals:
  codex: codex                # shorthand

  claude:                     # full form
    cmd: claude
    label: Claude Code
    display: button
`;

const TERMINALS_AGENTS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
terminals:
  claude: claude
  codex: codex
  node: node
  logs: tail -f ./logs/dev.log
`;

const PROFILES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
  server:
    cmd: node server.js
    port: 4000
profiles:
  minimal: [web]
  full:    [web, server]
`;

const PROFILES_MULTI_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
  server:
    cmd: node server.js
    port: 4000
  worker: celery -A backend worker
profiles:
  minimal: [web]
  local:   [web, server]
  full:    [web, server, worker]
`;

const GLOBAL_CONFIG_EXAMPLE = `actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true

terminals:
  htop: htop
`;

const GLOBAL_UTILITIES_EXAMPLE = `actions:
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
  ncdu: ncdu ~
`;

const RECIPE_MINIMAL = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev
`;

const RECIPE_TESTS = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev
actions:
  test: npm test
  lint: npm run lint
  build: npm run build
`;

const RECIPE_NEXT_NODE = `name: webapp
root: ~/Projects/webapp
services:
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
  logs: tail -f ./logs/server.log
`;

const RECIPE_ENV = `name: webapp
root: ~/Projects/webapp
services:
  web:
    cmd: npm run dev
    port: 3000
    env:
      API_URL: http://localhost:4000
      NEXTAUTH_SECRET: dev-secret
      NODE_ENV: development
`;

const RECIPE_MONOREPO = `name: mono
root: ~/Projects/mono
services:
  web:
    cmd: npm run dev
    cwd: ./apps/web
    port: 3000
  docs:
    cmd: npm run dev
    cwd: ./apps/docs
    port: 3001
`;

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
              description={
                <>
                  A project is one app you want to manage with lpm — a website,
                  an API, a blog, anything you&rsquo;d normally start in a
                  terminal. Every config begins with two things:{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    a name
                  </strong>{" "}
                  and{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    the folder it lives in
                  </strong>
                  .
                </>
              }
            >
              <ConfigPlayground
                filename="project.yml"
                initial={PROJECT_EXAMPLE}
              />

              <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  You don&rsquo;t have to write this from scratch
                </p>
                <p>
                  The easiest way to add a project is from the desktop app:
                  click the <strong className="font-medium">+</strong> button
                  in the sidebar, point it at your project folder, and lpm will
                  create the file for you and detect your services. You can
                  always come back and edit it later from the app.
                </p>
              </div>

              <FieldTable fields={projectFields} />
            </Section>

            <Section
              id="services"
              title="Services"
              description="Long-running processes that the desktop app starts and stops together. At least one service is required."
            >
              <ConfigPlayground
                filename="services.yml"
                initial={SERVICES_EXAMPLE}
              />
              <FieldTable fields={serviceFields} />
            </Section>

            <Section
              id="actions"
              title="Actions"
              description="One-shot commands like test runners, migrations, or deploy scripts. Trigger them from the project panel in the desktop app."
            >
              <ConfigPlayground
                filename="actions.yml"
                initial={ACTIONS_EXAMPLE}
              />
              <FieldTable fields={actionFields} />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Shorthand form for common dev commands:
              </p>
              <ConfigPlayground
                filename="actions-shorthand.yml"
                initial={ACTIONS_SHORTHAND_EXAMPLE}
              />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Destructive operations use{" "}
                <code className="font-mono">confirm</code> and typically display as
                a button:
              </p>
              <ConfigPlayground
                filename="actions-destructive.yml"
                initial={ACTIONS_DESTRUCTIVE_EXAMPLE}
              />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Nest actions to create a dropdown menu. When the parent has a{" "}
                <code className="font-mono">cmd</code>, it renders as a split
                button — clicking the main area runs the parent, clicking the
                chevron opens the dropdown:
              </p>
              <ConfigPlayground
                filename="actions-nested.yml"
                initial={ACTIONS_NESTED_EXAMPLE}
              />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Without a <code className="font-mono">cmd</code>, the whole
                button becomes a dropdown trigger:
              </p>
              <ConfigPlayground
                filename="actions-dropdown.yml"
                initial={ACTIONS_DROPDOWN_EXAMPLE}
              />

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
              <ConfigPlayground
                filename="terminals.yml"
                initial={TERMINALS_EXAMPLE}
              />
              <FieldTable fields={terminalFields} />

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Keep your AI coding agents one click away:
              </p>
              <ConfigPlayground
                filename="terminals-agents.yml"
                initial={TERMINALS_AGENTS_EXAMPLE}
              />
            </Section>

            <Section
              id="profiles"
              title="Profiles"
              description="Named subsets of services. Pick a profile from the project switcher in the desktop app. If no profile is selected, all services start."
            >
              <ConfigPlayground
                filename="profiles.yml"
                initial={PROFILES_EXAMPLE}
              />
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                Each service name must reference a service defined in{" "}
                <code className="font-mono">services</code>. Services can appear in
                any number of profiles — overlap is fine.
              </p>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Define multiple profiles to match different workflows:
              </p>
              <ConfigPlayground
                filename="profiles-multi.yml"
                initial={PROFILES_MULTI_EXAMPLE}
              />
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
              <ConfigPlayground
                filename="~/.lpm/global.yml"
                initial={GLOBAL_CONFIG_EXAMPLE}
              />
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                Global config only supports{" "}
                <code className="font-mono">actions</code> and{" "}
                <code className="font-mono">terminals</code> — not services or
                profiles.
              </p>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                System-wide utilities shared across every project:
              </p>
              <ConfigPlayground
                filename="~/.lpm/global.yml"
                initial={GLOBAL_UTILITIES_EXAMPLE}
              />
            </Section>

            <Section
              id="recipes"
              title="Recipes"
              description="Common configurations combining services, actions, and terminals."
            >
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Minimal Next.js app:
              </p>
              <ConfigPlayground
                filename="blog.yml"
                initial={RECIPE_MINIMAL}
              />

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js app with tests and linting:
              </p>
              <ConfigPlayground
                filename="blog.yml"
                initial={RECIPE_TESTS}
              />

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js front-end paired with a Node server API:
              </p>
              <ConfigPlayground
                filename="webapp.yml"
                initial={RECIPE_NEXT_NODE}
              />

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Next.js with env vars for local dev:
              </p>
              <ConfigPlayground
                filename="webapp.yml"
                initial={RECIPE_ENV}
              />

              <p className="mt-6 mb-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Monorepo with a Next.js app and a docs site:
              </p>
              <ConfigPlayground
                filename="mono.yml"
                initial={RECIPE_MONOREPO}
              />
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
