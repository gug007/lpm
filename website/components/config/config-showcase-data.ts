export const CONFIG_FILENAME = "~/.lpm/projects/myapp.yml";

export const CONFIG_EXAMPLE = `name: myapp
root: ~/Projects/myapp

# Long-running services
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

# One-shot commands and terminals
actions:
  test: pytest
  migrate:
    cmd: python manage.py migrate
    cwd: ./backend
    confirm: true
  deploy: ./scripts/deploy.sh
  claude:
    cmd: claude
    label: Claude Code
    type: terminal
`;

// The playground sizes its editor from the line count until Monaco reports its
// own height, capped at 360px. The placeholder mirrors that rule so the swap
// doesn't move the page.
const lines = CONFIG_EXAMPLE.replace(/\n+$/, "").split("\n").length;
export const EDITOR_HEIGHT = Math.min(360, Math.max(120, lines * 18 + 28));
export const TOOLBAR_HEIGHT = 46;
export const PREVIEW_HEIGHT = 280;
