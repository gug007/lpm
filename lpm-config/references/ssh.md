# SSH projects

Read this reference for remote projects and local sync-mode actions.

Use `ssh` instead of `root`:

```yaml
name: prod-api
ssh:
  host: api.example.com
  user: deploy
  port: 22
  key: ~/.ssh/id_ed25519
  dir: ~/apps/api

services:
  api:
    cmd: bin/server
    port: 8080
```

| Field | Rule |
|---|---|
| `host` | Required and non-empty. |
| `user` | Required and non-empty. |
| `port` | Optional integer from 0 to 65535; defaults to 22. |
| `key` | Optional local identity-file path with `~` support. |
| `dir` | Optional remote working directory; absolute or `~`-prefixed. |

Service, action, and terminal `cwd` values are remote paths and are not checked on the local filesystem. Relative values resolve from `ssh.dir`.

## Action modes

- Omit `mode` or use `mode: remote` to run on the host.
- Use `mode: sync` to rsync `ssh.dir` into a local mirror, run locally, and sync changes back.

```yaml
actions:
  claude:
    cmd: claude
    type: terminal
    mode: sync

  format:
    cmd: prettier --write .
    mode: sync
    display: footer
```

Reject `mode: sync` on local projects. Sync mode requires `rsync` locally and on the host. Children inherit `mode` unless they override it.
