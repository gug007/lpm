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
    description: (
      <>
        The shell command that starts the process — exactly what you&rsquo;d
        type into a terminal yourself, like{" "}
        <code className="font-mono">npm run dev</code> or{" "}
        <code className="font-mono">node server.js</code>. lpm keeps it running
        and shows its output in the app.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Start the service from a different folder than the project root — handy
        for monorepos where each app lives in its own subfolder like{" "}
        <code className="font-mono">./apps/web</code>. Relative paths resolve
        from <code className="font-mono">root</code>, and{" "}
        <code className="font-mono">~</code> expands to your home directory.
      </>
    ),
  },
  {
    name: "port",
    type: "int",
    required: false,
    description: (
      <>
        The port this service listens on. lpm uses it to show a clickable link
        in the toolbar and to warn you if something else is already bound.{" "}
        <strong className="font-medium text-gray-700 dark:text-gray-200">
          Each port must be unique across services
        </strong>{" "}
        in the same project.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this service — things like{" "}
        <code className="font-mono">API_URL</code> or{" "}
        <code className="font-mono">NODE_ENV</code>. Useful when you don&rsquo;t
        want to commit them to a <code className="font-mono">.env</code> file.
      </>
    ),
  },
  {
    name: "profiles",
    type: "[]string",
    required: false,
    description: (
      <>
        Names of the profiles this service belongs to. Profiles let you start a
        named subset of services instead of everything at once — see the{" "}
        <a
          href="#profiles"
          className="text-gray-600 dark:text-gray-300 underline underline-offset-2"
        >
          Profiles
        </a>{" "}
        section below.
      </>
    ),
  },
];

const actionFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: false,
    description: (
      <>
        The shell command to run — whatever you&rsquo;d type into a terminal
        yourself. Required unless the action groups child actions with{" "}
        <code className="font-mono">actions</code> below.
      </>
    ),
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: (
      <>
        The friendly name shown on the button. If you skip it, lpm uses the
        action&rsquo;s key — e.g.{" "}
        <code className="font-mono">test</code> becomes{" "}
        <code className="font-mono">test</code>.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Run the command from a different folder than the project root — useful
        for monorepos or when the action lives in a subfolder. Relative paths
        resolve from <code className="font-mono">root</code>.{" "}
        <code className="font-mono">~</code> expands to your home directory.
        Nested actions inherit this from their parent.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this action — handy for
        one-off flags like{" "}
        <code className="font-mono">NODE_ENV=production</code>. Nested actions
        inherit these from their parent.
      </>
    ),
  },
  {
    name: "confirm",
    type: "bool",
    required: false,
    description: (
      <>
        Show a confirmation dialog before running. Turn this on for anything
        you&rsquo;d regret clicking by accident — deletes, resets, production
        deploys.
      </>
    ),
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        <code className="font-mono">button</code> pins the action to the
        project toolbar so it&rsquo;s always one click away. The default,{" "}
        <code className="font-mono">menu</code>, tucks it behind the three-dot
        menu — better for things you rarely need.
      </>
    ),
  },
  {
    name: "actions",
    type: "map",
    required: false,
    description: (
      <>
        Group related commands under this action. They show up as a dropdown.
        If the parent also has a <code className="font-mono">cmd</code>, it
        renders as a split button — clicking the main part runs the parent,
        clicking the chevron opens the group.
      </>
    ),
  },
];

const terminalFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: (
      <>
        The shell command that starts the terminal — usually something
        interactive you want to keep around, like{" "}
        <code className="font-mono">claude</code>,{" "}
        <code className="font-mono">node</code>, or{" "}
        <code className="font-mono">tail -f ./logs/dev.log</code>. lpm opens it
        in a real PTY so prompts, colors, and arrow keys all work.
      </>
    ),
  },
  {
    name: "label",
    type: "string",
    required: false,
    description: (
      <>
        The friendly name shown on the button or in the menu. If you skip it,
        lpm uses the terminal&rsquo;s key — so{" "}
        <code className="font-mono">claude</code> just shows up as{" "}
        <code className="font-mono">claude</code>.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Open the terminal in a different folder than the project root — useful
        for monorepos or when your agent should start inside a specific
        package. Relative paths resolve from{" "}
        <code className="font-mono">root</code>, and{" "}
        <code className="font-mono">~</code> expands to your home directory.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this terminal — handy for
        picking a model with{" "}
        <code className="font-mono">ANTHROPIC_MODEL</code> or pointing a REPL
        at a staging database. These only apply inside this shell, nothing
        else on your system is touched.
      </>
    ),
  },
  {
    name: "display",
    type: "string",
    required: false,
    description: (
      <>
        Just like actions:{" "}
        <code className="font-mono">button</code> pins the terminal to the
        project toolbar so it&rsquo;s always one click away. The default,{" "}
        <code className="font-mono">menu</code>, tucks it behind the three-dot
        menu — better for shells you only open once in a while.
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
  # shorthand — key is the name, value is the command
  web: npm run dev

  # full form — use this when you need cwd, port, or env
  server:
    cmd: node server.js
    cwd: ./server             # run from a subfolder (great for monorepos)
    port: 4000                # unique per project; shown as a link in the app
    env:                      # extra env vars just for this service
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
  codex: codex                # shorthand — key becomes the label

  claude:                     # full form
    cmd: claude
    label: Claude Code        # nicer name than the key
    display: button           # pin to the toolbar, one click away
`;

const TERMINALS_AGENTS_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev
terminals:
  claude: claude              # AI pair programmer
  codex: codex                # another AI agent, swap at will
  node: node                  # quick REPL for poking at things
  logs: tail -f ./logs/dev.log  # live-tail your dev server logs
`;

const PROFILES_EXAMPLE = `name: myapp
root: ~/Projects/myapp
services:
  web: npm run dev              # frontend UI
  api:
    cmd: node server.js
    port: 4000                  # backend API
profiles:
  # Just the frontend — fastest startup, good for UI-only fixes
  frontend: [web]
  # Full stack — frontend + backend for feature work
  full:     [web, api]
`;

const PROFILES_MULTI_EXAMPLE = `name: shop
root: ~/Projects/shop
services:
  web: npm run dev              # React frontend
  api:
    cmd: python -m api.server
    port: 5000                  # Flask backend
  worker: celery -A tasks       # background jobs
profiles:
  # Quick UI fixes — no backend needed
  frontend: [web]
  # Normal day-to-day development — web + api
  local:    [web, api]
  # Everything, including background workers
  full:     [web, api, worker]
`;

const GLOBAL_CONFIG_EXAMPLE = `actions:
  docker-prune:
    cmd: docker system prune -f
    label: Docker Prune
    confirm: true             # asks before wiping images and caches

terminals:
  htop: htop                  # live system monitor, one click away
`;

const GLOBAL_UTILITIES_EXAMPLE = `actions:
  prune-branches:
    cmd: git branch --merged main | grep -v main | xargs git branch -d
    label: Prune merged branches
    confirm: true             # deletes local branches — ask first
  brew-upgrade:
    cmd: brew update && brew upgrade
    label: Brew upgrade       # keep Homebrew packages fresh

terminals:
  htop: htop                  # live CPU and memory
  btop: btop                  # prettier process viewer
  ncdu: ncdu ~                # explore what's eating your disk
`;

const RECIPE_MINIMAL = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev # the only thing you need to hit Start
`;

const RECIPE_TESTS = `name: blog
root: ~/Projects/blog
services:
  web: npm run dev
actions:
  # one-click buttons for the chores you used to retype
  test: npm test
  lint: npm run lint
  build: npm run build
`;

const RECIPE_NEXT_NODE = `name: webapp
root: ~/Projects/webapp
services:
  web: npm run dev # Next.js front-end
  server:
    cmd: node server.js # API the front-end talks to
    cwd: ./server # lives in a subfolder
    port: 4000 # surfaced in the app so you can open it
actions:
  deploy:
    cmd: ./scripts/deploy.sh
    confirm: true # ask before shipping
terminals:
  logs: tail -f ./logs/server.log # keep server logs one click away
`;

const RECIPE_ENV = `name: webapp
root: ~/Projects/webapp
services:
  web:
    cmd: npm run dev
    port: 3000
    env:
      # dev-only values — real secrets belong in your own .env
      API_URL: http://localhost:4000
      NEXTAUTH_SECRET: dev-secret
      NODE_ENV: development
`;

const RECIPE_MONOREPO = `name: mono
root: ~/Projects/mono
services:
  web:
    cmd: npm run dev
    cwd: ./apps/web # one app in the monorepo
    port: 3000
  docs:
    cmd: npm run dev
    cwd: ./apps/docs # another app, started together
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
              description={
                <>
                  Services are the{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    long-running processes
                  </strong>{" "}
                  that make up your project — your dev server, an API, a
                  background worker, anything you&rsquo;d normally leave running
                  in a terminal tab. lpm starts them together when you open the
                  project and stops them when you&rsquo;re done.{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    Every project needs at least one service.
                  </strong>
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                If a command runs continuously, it&rsquo;s a service. If it
                finishes and exits — tests, a build, a migration — it belongs
                in{" "}
                <a
                  href="#actions"
                  className="text-gray-600 dark:text-gray-300 underline underline-offset-2"
                >
                  Actions
                </a>{" "}
                instead. Each service can be written as a one-line shorthand
                (just the command) or as the full form when you need{" "}
                <code className="font-mono">cwd</code>,{" "}
                <code className="font-mono">port</code>, or{" "}
                <code className="font-mono">env</code>.
              </p>
              <ConfigPlayground
                filename="services.yml"
                initial={SERVICES_EXAMPLE}
              />
              <FieldTable fields={serviceFields} />

              <div className="mt-6 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Starting and stopping
                </p>
                <p>
                  You don&rsquo;t start services one by one. Click the project
                  in the sidebar and lpm spins them all up together; click stop
                  in the toolbar and they all come down. If you only want a
                  subset running — say, the web app without the worker — define
                  a{" "}
                  <a
                    href="#profiles"
                    className="text-gray-600 dark:text-gray-300 underline underline-offset-2"
                  >
                    profile
                  </a>{" "}
                  and pick it from the project switcher.
                </p>
              </div>
            </Section>

            <Section
              id="actions"
              title="Actions"
              description={
                <>
                  Actions are the commands you run once in a while — your test
                  suite, a database migration, a deploy script. Services run
                  continuously; actions fire once, do their job, and show you
                  the result. Click one in the desktop app toolbar (or tuck it
                  into the three-dot menu) and lpm runs it for you.
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Try it — click <strong className="font-medium">test</strong>{" "}
                or <strong className="font-medium">Deploy to Production</strong>{" "}
                in the preview above. Actions with{" "}
                <code className="font-mono">confirm: true</code> ask before
                running; everything else just runs.
              </p>
              <ConfigPlayground
                filename="actions.yml"
                initial={ACTIONS_EXAMPLE}
              />
              <FieldTable fields={actionFields} />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Shorthand.
                </strong>{" "}
                If all your action needs is a command, write it as a single
                line — the key becomes the label and you skip the nested form
                entirely. Great for everyday dev commands:
              </p>
              <ConfigPlayground
                filename="actions-shorthand.yml"
                initial={ACTIONS_SHORTHAND_EXAMPLE}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Destructive actions.
                </strong>{" "}
                For anything you don&rsquo;t want to click by accident — cache
                wipes, rollbacks, production deploys — add{" "}
                <code className="font-mono">confirm: true</code> to get a
                confirmation dialog, and pair it with{" "}
                <code className="font-mono">display: button</code> so the
                action lives in the toolbar where you&rsquo;ll find it:
              </p>
              <ConfigPlayground
                filename="actions-destructive.yml"
                initial={ACTIONS_DESTRUCTIVE_EXAMPLE}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Grouping related actions.
                </strong>{" "}
                Give a parent action both a <code className="font-mono">cmd</code>{" "}
                and nested <code className="font-mono">actions</code> and
                lpm renders it as a split button: the main part runs the
                parent&rsquo;s command, the chevron opens a menu with the
                children. Use this when there&rsquo;s a sensible default plus a
                few alternatives — like &ldquo;Deploy staging&rdquo; with
                production and preview tucked behind it:
              </p>
              <ConfigPlayground
                filename="actions-nested.yml"
                initial={ACTIONS_NESTED_EXAMPLE}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Dropdown-only groups.
                </strong>{" "}
                Drop the parent&rsquo;s <code className="font-mono">cmd</code>{" "}
                and the whole button becomes a dropdown. Good for a set of
                related commands with no obvious default — like a database
                toolkit (Migrate, Seed, Reset):
              </p>
              <ConfigPlayground
                filename="actions-dropdown.yml"
                initial={ACTIONS_DROPDOWN_EXAMPLE}
              />

              <div className="mt-6 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  A note on inheritance
                </p>
                <p>
                  Nested actions inherit <code className="font-mono">cwd</code>{" "}
                  and <code className="font-mono">env</code> from their parent
                  unless they override them. Set{" "}
                  <code className="font-mono">cwd: ./backend</code> on the
                  parent once and every child runs from there — no need to
                  repeat yourself.
                </p>
              </div>
            </Section>

            <Section
              id="terminals"
              title="Terminals"
              description={
                <>
                  Terminals are{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    persistent interactive shells
                  </strong>{" "}
                  you can open from the desktop app with a single click — a
                  live log tail, a Node or Python REPL, or an AI coding agent
                  like Claude Code waiting in the sidebar. Unlike a service,
                  a terminal isn&rsquo;t something lpm starts and stops for
                  you; unlike an action, it doesn&rsquo;t run once and exit.
                  It stays open, you type in it, and it remembers where you
                  left off until you close it.
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Shorthand vs. full form.
                </strong>{" "}
                If the command is all you need, a single line is enough — the
                key becomes the label. Reach for the full form when you want
                a friendlier label, pin the terminal to the toolbar with{" "}
                <code className="font-mono">display: button</code>, or set a{" "}
                <code className="font-mono">cwd</code> or{" "}
                <code className="font-mono">env</code>:
              </p>
              <ConfigPlayground
                filename="terminals.yml"
                initial={TERMINALS_EXAMPLE}
              />
              <FieldTable fields={terminalFields} />

              <div className="mt-6 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Button or menu?
                </p>
                <p>
                  Use <code className="font-mono">display: button</code> for
                  the one or two terminals you reach for every day — your main
                  coding agent, your dev log tail. Leave everything else on
                  the default <code className="font-mono">menu</code> so the
                  toolbar stays uncluttered; they&rsquo;re still one click
                  away from the three-dot menu when you need them.
                </p>
              </div>

              <p className="mt-6 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  AI coding agents, one click away.
                </strong>{" "}
                This is where terminals really shine. List the agents and
                REPLs you actually use and they&rsquo;ll be waiting in the
                sidebar the next time you open the project — no hunting for
                the right window, no remembering which folder you were in:
              </p>
              <ConfigPlayground
                filename="terminals-agents.yml"
                initial={TERMINALS_AGENTS_EXAMPLE}
              />
            </Section>

            <Section
              id="profiles"
              title="Profiles"
              description={
                <>
                  Profiles let you group services into{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    named workflows
                  </strong>{" "}
                  so you don&rsquo;t have to spin up everything every time.
                  Working on a CSS tweak? Start just the frontend. Building a
                  new feature end-to-end? Fire up the full stack. Pick the
                  profile you want from the{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    Start button&rsquo;s dropdown
                  </strong>{" "}
                  in the project toolbar, and lpm only launches those
                  services.
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Start small.
                </strong>{" "}
                Even two profiles pay off right away — a lightweight one for
                quick UI fixes and a full one for feature work. Here&rsquo;s
                the smallest useful setup: a frontend and a backend, with a{" "}
                <code className="font-mono">frontend</code> profile that
                skips the API when you don&rsquo;t need it:
              </p>
              <ConfigPlayground
                filename="profiles.yml"
                initial={PROFILES_EXAMPLE}
              />
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                Every name in a profile list must match a service defined
                above in <code className="font-mono">services</code>. Services
                can appear in as many profiles as you like — overlap is fine
                and expected.
              </p>

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Multiple profiles for different modes.
                </strong>{" "}
                Once your project grows a third or fourth service — a
                background worker, a queue, a second frontend — a single
                profile isn&rsquo;t enough. Define one profile per workflow
                you actually use, so you can jump between &ldquo;just the
                UI&rdquo;, &ldquo;normal dev&rdquo;, and &ldquo;everything
                running&rdquo; without touching the config:
              </p>
              <ConfigPlayground
                filename="profiles-multi.yml"
                initial={PROFILES_MULTI_EXAMPLE}
              />

              <div className="mt-6 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  What if I don&rsquo;t pick a profile?
                </p>
                <p>
                  No problem — profiles are optional. If you hit{" "}
                  <strong className="font-medium">Start</strong> without
                  choosing one from the dropdown, lpm starts{" "}
                  <strong className="font-medium">every service</strong> in
                  your config. Profiles are there for when you want{" "}
                  <em>less</em> than everything; skip them entirely if
                  everything is what you want.
                </p>
              </div>
            </Section>

            <Section
              id="global-config"
              title="Global Config"
              description={
                <>
                  Most of your config lives per-project, but some things
                  aren&rsquo;t tied to any one codebase — system maintenance,
                  utilities, your favorite shell. Drop those into{" "}
                  <code className="font-mono text-gray-600 dark:text-gray-300 text-xs">
                    ~/.lpm/global.yml
                  </code>{" "}
                  and they show up in{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    every project
                  </strong>{" "}
                  automatically. If a project defines an action or terminal
                  with the same name, the{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    project-level entry wins
                  </strong>
                  .
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  A minimal global file.
                </strong>{" "}
                Two things you&rsquo;ll reach for in any project: a{" "}
                <code className="font-mono">Docker Prune</code> action to
                reclaim disk space, and <code className="font-mono">htop</code>{" "}
                as a quick system monitor. Notice there&rsquo;s no{" "}
                <code className="font-mono">name</code> or{" "}
                <code className="font-mono">root</code> — global config skips
                both.
              </p>
              <ConfigPlayground
                filename="~/.lpm/global.yml"
                initial={GLOBAL_CONFIG_EXAMPLE}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  System-wide utilities.
                </strong>{" "}
                A fuller example: prune merged git branches, upgrade Homebrew,
                and keep a few system monitors one click away. These all live
                above individual projects — click them from any project and
                they just work.
              </p>
              <ConfigPlayground
                filename="~/.lpm/global.yml"
                initial={GLOBAL_UTILITIES_EXAMPLE}
              />

              <div className="mt-6 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Only actions and terminals
                </p>
                <p>
                  Global config supports{" "}
                  <code className="font-mono">actions</code> and{" "}
                  <code className="font-mono">terminals</code> — that&rsquo;s
                  it. No <code className="font-mono">services</code>, no{" "}
                  <code className="font-mono">profiles</code>. Long-running
                  processes and profile groupings always belong to a specific
                  project, so they have to live in a project file.
                </p>
              </div>
            </Section>

            <Section
              id="recipes"
              title="Recipes"
              description={
                <>
                  Full working configs you can copy and adapt. The sections
                  above each show{" "}
                  <strong className="font-medium text-gray-700 dark:text-gray-200">
                    one concept in isolation
                  </strong>
                  ; the recipes here stitch services, actions, and terminals
                  together into configs that mirror how a real project looks on
                  day one. Find the recipe closest to your stack, paste it into
                  a new project, and tweak from there.
                </>
              }
            >
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Minimal blog.
                </strong>{" "}
                Start here if you just want one dev server and nothing else —
                a personal blog, a tiny side project, the &ldquo;hello
                world&rdquo; version of lpm. One service, no actions, no
                ceremony.
              </p>
              <ConfigPlayground
                filename="blog.yml"
                initial={RECIPE_MINIMAL}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Blog with tests and linting.
                </strong>{" "}
                Add this when your tests, linter, or build start taking long
                enough that retyping them feels wasteful. Same dev server as
                above, plus three one-click buttons in the toolbar.
              </p>
              <ConfigPlayground
                filename="blog.yml"
                initial={RECIPE_TESTS}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Next.js plus a Node API.
                </strong>{" "}
                For the classic two-process web app: a Next.js front-end in
                the project root and a Node backend in{" "}
                <code className="font-mono">./server</code>. Shows how to set{" "}
                <code className="font-mono">cwd</code> per service, expose a
                port, add a guarded deploy, and pin a log tail to its own
                terminal tab.
              </p>
              <ConfigPlayground
                filename="webapp.yml"
                initial={RECIPE_NEXT_NODE}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Next.js with dev env vars.
                </strong>{" "}
                Pick this when your app needs a handful of environment
                variables to boot locally and you&rsquo;re tired of remembering
                them. lpm injects them every time the service starts — keep
                real secrets in your own <code className="font-mono">.env</code>{" "}
                file, not here.
              </p>
              <ConfigPlayground
                filename="webapp.yml"
                initial={RECIPE_ENV}
              />

              <p className="mt-8 mb-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                <strong className="font-medium text-gray-700 dark:text-gray-200">
                  Monorepo with an app and docs.
                </strong>{" "}
                For a repo that holds more than one thing you want running at
                once — say an app in <code className="font-mono">apps/web</code>{" "}
                and a docs site in <code className="font-mono">apps/docs</code>.
                Both services live under one project and start together, each
                from its own folder.
              </p>
              <ConfigPlayground
                filename="mono.yml"
                initial={RECIPE_MONOREPO}
              />

              <div className="mt-8 mb-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
                  How to use a recipe
                </p>
                <p>
                  Copy the one closest to your stack, change{" "}
                  <code className="font-mono">name</code> and{" "}
                  <code className="font-mono">root</code> to match your
                  project, then swap in your own commands. If a piece looks
                  unfamiliar, jump back to the matching section above and
                  tinker with its playground — every reference section has
                  one at the top, and your edits stay live until you reload.
                </p>
              </div>
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
