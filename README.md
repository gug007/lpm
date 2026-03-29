<p align="center">
  <b>lpm</b> — local project manager
  <br>
  <i>Start, stop, and switch between dev projects with a single command.</i>
</p>

<p align="center">
  <a href="https://github.com/gug007/lpm/releases/latest"><img src="https://img.shields.io/github/v/release/gug007/lpm" alt="Release"></a>
  <a href="https://github.com/gug007/lpm/actions"><img src="https://github.com/gug007/lpm/actions/workflows/release.yml/badge.svg" alt="Build"></a>
  <a href="https://github.com/gug007/lpm/blob/main/LICENSE"><img src="https://img.shields.io/github/license/gug007/lpm" alt="License"></a>
</p>

---

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gug007/lpm/main/install.sh | bash
```

## Quick start

```sh
cd ~/Projects/myapp
lpm init          # detects services, creates config
lpm myapp         # start all services
lpm switch other  # stop myapp, start other
lpm kill          # stop everything
```

`lpm init` auto-detects Rails, Node, Go, Django, Flask, and Docker Compose projects.

## Examples

**Simple — Next.js app**

```yaml
# ~/.lpm/projects/storefront.yml
name: storefront
root: ~/Projects/storefront
services:
  dev: npm run dev
```

**Full stack — multiple services with profiles**

```yaml
# ~/.lpm/projects/myapp.yml
name: myapp
root: ~/Projects/myapp
services:
  api:
    cmd: rails s -p 3000
    cwd: ./backend
    port: 3000
    env:
      RAILS_ENV: development
  frontend: npm run dev
  sidekiq: bundle exec sidekiq
profiles:
  default: [api, frontend]
  full: [api, frontend, sidekiq]
```

Services can be a simple string (`dev: npm run dev`) or a full object when you need `cwd`, `port`, or `env`.

```sh
lpm myapp            # starts api + frontend
lpm myapp -p full    # starts everything
```

## Commands

| Command | Description |
|---------|-------------|
| `lpm <project>` | Start a project |
| `lpm switch <project>` | Stop all running projects, start another |
| `lpm kill [project]` | Stop a project (all if no name given) |
| `lpm init [name]` | Create config from current directory |
| `lpm edit <project>` | Open config in `$EDITOR` |
| `lpm list` | List all projects |
| `lpm status <project>` | Show project details |
| `lpm remove <project>` | Remove a project |
| `lpm open <project>` | Open project in Finder |

## Configuration

Configs live in `~/.lpm/projects/<name>.yml`. Each config has:

- **root** — project directory
- **services** — named services with `cmd`, `cwd`, `port`, and `env`
- **profiles** — groups of services to start together

## License

MIT
