# lpm

Local Project Manager — start, stop, and switch between dev projects with a single command.

LPM uses tmux to run project services in named sessions. Configure once, then launch everything with `lpm <project>`.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
```

Or with Go:

```sh
go install github.com/gug007/lpm@latest
```

## Quick start

```sh
cd ~/Projects/myapp
lpm init                # detects services and creates config
lpm myapp               # start all services in a tmux session
```

`lpm init` auto-detects common setups: Rails, Node (Next.js, Vite, React), Go, Django, Flask, Docker Compose, and Sidekiq.

Or create a config manually at `~/.lpm/projects/myapp.yml`:

```yaml
name: myapp
root: ~/Projects/myapp
services:
  backend:
    cmd: go run .
    cwd: ./api
    port: 8080
  frontend:
    cmd: npm run dev
    cwd: ./web
    port: 3000
profiles:
  default: [backend, frontend]
  api: [backend]
```

```sh
lpm myapp           # start all services in a tmux session
lpm myapp -p api    # start only the api profile
lpm kill myapp      # stop the project
lpm list            # show all configured projects
```

## Commands

| Command | Description |
|---------|-------------|
| `lpm <project>` | Start a project and attach to its tmux session |
| `lpm init [name]` | Initialize a project from the current directory |
| `lpm remove <project>` | Remove a project config (alias: `rm`) |
| `lpm kill <project>` | Stop a running project |
| `lpm list` | List all configured projects (alias: `ls`) |
| `lpm status` | Show which projects are running |
| `lpm open <project>` | Open the project root in Finder |
| `lpm version` | Print version |

## Examples

### Simple — static site with a dev server

```yaml
# ~/.lpm/projects/blog.yml
name: blog
root: ~/Projects/blog
services:
  dev:
    cmd: npm run dev
    port: 3000
```

```sh
lpm blog        # start and attach
lpm kill blog   # stop
```

### Full stack — Rails + React + background workers

```yaml
# ~/.lpm/projects/shopify-clone.yml
name: shopify-clone
root: ~/Projects/shopify-clone
services:
  api:
    cmd: rails s -p 3000
    cwd: ./backend
    port: 3000
    env:
      RAILS_ENV: development
      DATABASE_URL: postgres://localhost/shop_dev
  frontend:
    cmd: npm run dev
    cwd: ./frontend
    port: 5173
  sidekiq:
    cmd: bundle exec sidekiq
    cwd: ./backend
  redis:
    cmd: redis-server
profiles:
  default: [api, frontend]
  full: [api, frontend, sidekiq, redis]
  api: [api, redis]
```

```sh
lpm shopify-clone            # starts api + frontend
lpm shopify-clone -p full    # starts everything
lpm shopify-clone -p api     # starts api + redis only
```

## Configuration

Project configs live in `~/.lpm/projects/<name>.yml`.

Each config defines a project root, a set of services (with command, working directory, port, and environment variables), and optional profiles to group services.

## Requirements

- [tmux](https://github.com/tmux/tmux)

## License

MIT
