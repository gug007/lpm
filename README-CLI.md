# lpm CLI

The command-line interface for [lpm — Local Project Manager](README.md). Start, stop, and switch between dev projects from your terminal.

The CLI and [desktop app](README.md) share the same config and state — start a project from the app, stop it from the terminal. Use whichever fits your workflow, or both.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
```

Supports macOS (Apple Silicon & Intel).

## Quick start

```sh
cd ~/Projects/myapp
lpm init          # detects services, creates config
lpm myapp         # start in background, show status
lpm start myapp   # start and open terminal to session
lpm switch other  # stop myapp, start other
lpm kill          # stop everything
```

`lpm init` auto-detects Rails, Node.js, Next.js, Vite, React, Go, Django, Flask, and Docker Compose projects.

## Examples

**Simple — Next.js app**

```yaml
# ~/.lpm/projects/storefront.yml
name: storefront
root: ~/Projects/storefront
services:
  dev: npm run dev
```

```sh
lpm storefront         # start in background
lpm start storefront   # start and open terminal
lpm kill storefront    # stop
```

**Full stack — Python API + Next.js frontend + worker**

```yaml
# ~/.lpm/projects/myapp.yml
name: myapp
root: ~/Projects/myapp

services:
  api:
    cmd: python manage.py runserver
    cwd: ./backend
    port: 8000
  frontend:
    cmd: npm run dev
    cwd: ./frontend
  worker: celery -A backend worker

profiles:
  default: [api, frontend]
  full: [api, frontend, worker]

actions:
  test: pytest
  migrate:
    cmd: python manage.py migrate
    cwd: ./backend
    confirm: true
  deploy: ./scripts/deploy.sh
```

Services can be a simple string (`dev: npm run dev`) or a full object when you need `cwd`, `port`, or `env`. Actions are one-shot commands — test runners, migrations, deploy scripts.

`confirm: true` shows a confirmation dialog before running. Actions can be run from the CLI or from the desktop app via the Actions button.

```sh
lpm myapp              # starts api + frontend
lpm myapp -p full      # starts everything
lpm run myapp test     # run tests
lpm run myapp deploy   # deploy
```

## Commands

| Command                      | Description                          |
| ---------------------------- | ------------------------------------ |
| `lpm <project>`              | Start in background                  |
| `lpm start <project>`        | Start and open terminal              |
| `lpm switch <project>`       | Stop all, start another              |
| `lpm kill [project]`         | Stop a project (all if none given)   |
| `lpm list`                   | List all projects                    |
| `lpm status <project>`       | Show project details                 |
| `lpm init [name]`            | Create config from current directory |
| `lpm edit <project>`         | Open config in `$EDITOR`             |
| `lpm remove <project>`       | Remove a project                     |
| `lpm open <project>`         | View a running project's live output |
| `lpm run <project> <action>` | Run a project action                 |

Tab completion is available for all commands.

## Project Configuration

Configs live in `~/.lpm/projects/<name>.yml`. Each config has:

- **root** — project directory
- **services** — named services with `cmd`, `cwd`, `port`, and `env`
- **profiles** — groups of services to start together

Configs are validated on load — lpm will catch missing commands, invalid ports, duplicate ports, and nonexistent directories before starting anything.

## AI Agent Skill

This repo includes an agent skill that lets your AI coding agent create and manage lpm configs for you. Install it via [skills.sh](https://skills.sh):

```bash
# Interactive — shows available skills
npx skills add gug007/lpm

# Or install directly
npx skills add gug007/lpm -s lpm-config

# Globally (all projects)
npx skills add gug007/lpm -s lpm-config -g
```

Then just tell your agent "set up lpm for this project" and it will analyze your codebase, discover services, and write the config. It understands all lpm config options including actions with inputs, terminal actions, action groups, profiles, and duplicate projects.

See [lpm-config/README.md](lpm-config/README.md) for details.
