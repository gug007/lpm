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

Create a project config at `~/.lpm/projects/myapp.yml`:

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

Then:

```sh
lpm myapp           # start all services in a tmux session
lpm myapp -p api    # start only the api
lpm kill myapp      # stop the project
lpm list            # show all configured projects
lpm status          # show running projects
```

## Commands

| Command | Description |
|---------|-------------|
| `lpm <project>` | Start a project |
| `lpm kill <project>` | Stop a running project |
| `lpm list` | List all configured projects |
| `lpm status` | Show which projects are running |
| `lpm version` | Print version |

## Configuration

Project configs live in `~/.lpm/projects/<name>.yml`.

Each config defines a project root, a set of services (with command, working directory, port, and environment variables), and optional profiles to group services.

## Requirements

- [tmux](https://github.com/tmux/tmux)

## License

MIT
