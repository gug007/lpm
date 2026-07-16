import { ConfigPlayground } from "@/components/config/playground";
import { SectionHeader } from "@/components/section-header";

const HOME_EXAMPLE = `name: myapp
root: ~/Projects/myapp

# Long-running services — started from the app
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

# One-shot commands — run from the app
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
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Config"
          title="One config file. That's it."
          description="Define your services, group them into profiles, and add one-shot actions. Edit below to see it live."
          className="mb-10"
        />

        <ConfigPlayground
          filename="~/.lpm/projects/myapp.yml"
          initial={HOME_EXAMPLE}
        />

        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 mb-1">
              Services
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Long-running processes. Use string shorthand or full config with{" "}
              <code className="font-mono">cwd</code>,{" "}
              <code className="font-mono">port</code>,{" "}
              <code className="font-mono">env</code>.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 mb-1">
              Profiles
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Named groups of services. Pick a profile from the header and
              start only that subset.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-200 mb-1">
              Actions
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              One-shot commands. Appear as buttons in the app — trigger tests,
              migrations, or deploys in one click.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
