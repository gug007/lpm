import { ConfigPlayground } from "@/components/config/playground";

const HOME_EXAMPLE = `name: myapp
root: ~/Projects/myapp

# Long-running services — started with lpm start
services:
  api:
    cmd: python manage.py runserver
    cwd: ./backend
    port: 8000
  frontend:
    cmd: npm run dev
    cwd: ./frontend
  worker: celery -A backend worker

# Named subsets of services
profiles:
  default: [api, frontend]
  full: [api, frontend, worker]

# One-shot commands — run from app or CLI
actions:
  test: pytest
  migrate:
    cmd: python manage.py migrate
    cwd: ./backend
    confirm: true
  deploy: ./scripts/deploy.sh
`;

export function ConfigExample() {
  return (
    <section className="pb-20">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          One config file. That&apos;s it.
        </h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-8">
          Define your services, group them into profiles, and add one-shot
          actions. Edit below to see it live.
        </p>

        <ConfigPlayground
          filename="~/.lpm/projects/myapp.yml"
          initial={HOME_EXAMPLE}
        />

        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-gray-900 dark:text-gray-200 mb-0.5">
              Services
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              Long-running processes. Use string shorthand or full config with{" "}
              <code className="font-mono">cwd</code>,{" "}
              <code className="font-mono">port</code>,{" "}
              <code className="font-mono">env</code>.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-gray-900 dark:text-gray-200 mb-0.5">
              Profiles
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              Named groups of services. Start a subset with{" "}
              <code className="font-mono">lpm myapp -p full</code> or pick from
              the app.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-2.5">
            <p className="text-[11px] font-medium text-gray-900 dark:text-gray-200 mb-0.5">
              Actions
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
              One-shot commands. Run from the desktop app or CLI with{" "}
              <code className="font-mono">lpm run myapp deploy</code>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
