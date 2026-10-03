# Validation workflow

Read this reference before preparing any lpm config change.

## Preferred workflow

Resolve the target before editing:

```bash
lpm config resolve --cwd . --json
```

Read the live layer and capture its revision:

```bash
lpm config get --layer project --project <name> --json
```

Prepare the candidate in a temporary file, never at the returned live `path`. Apply it transactionally:

```bash
lpm config apply --layer project --project <name> \
  --if-revision <revision> --file <candidate-path> --json
```

Use `--layer repo --project <name>`, `--layer global`, or `--layer template --template <name>` for the other layers. Use `--create` on both commands only when intentionally creating a missing project or template.

Treat any result other than `applied: true` as a failed change. Validation failures never alter the destination. Fix every error in the candidate and retry. On `revision_conflict`, discard the stale base, run `get` again, and merge the intended change into the latest content. Review warnings and report any that affect the requested behavior.

The apply validator checks YAML shape, supported fields, config-layer restrictions, identity, the Claude account id, the status badge, SSH settings, commands, local directories, ports, action types, displays, modes, inputs, shortcuts, profiles, zones and layers, service dependencies, cycles, duplicates, and the effective merged project. It warns, without failing, on the deprecated `terminals:` section, legacy `display: menu`, an entry with no command or children (expected for a sparse override), and a `primary` that names none of the entry's own children. A `global` or `template` candidate is also checked against every project's effective config: only errors the candidate introduces fail the apply; a project that already fails to load, or already has errors without the candidate, produces a warning instead.

## No-write fallback

When the app is not running or the installed CLI does not provide `config get` and `config apply`, tell the user to start or update lpm from Settings. Do not modify the live file directly. You may inspect the configuration read-only and use this checklist to prepare a proposed candidate:

1. The YAML parses as a mapping and contains no invented fields.
2. A personal project sets exactly one of `root` and `ssh`. `ssh.port` is an unquoted integer; `ssh.host`, `user`, `key`, and `dir` are strings. `claudeAccount`, when present, is a string of letters, digits, `-`, or `_` (or empty). `work_status`, when present, is left as the app wrote it.
3. A local project resolves every `cwd` to an existing directory.
4. Services and executable action leaves have non-empty commands after layering; every service entry has its own `cmd`; a non-duplicate project has at least one service.
5. Service ports are unique; all ports are between 0 and 65535.
6. `portConflict` is `ask`, `free`, or `fail`.
7. `display` is `header`, `footer`, or a zone name without `:`; accept `menu` only as legacy, never `button`. `zones` entries are mappings with only `rows` (1–3), `label`, `position`, `display` (`header` or `footer`) and `layers` (a mapping of layer key, without `:` or `/`, to a mapping with only `label` and `position`); `layer` on an action is a string; a zone name is not empty, contains no `:` or `/`, and is not `header`, `footer`, `menu` or `button`. Templates and duplicates hold no `zones`.
8. Action fields are only `cmd`, `label`, `emoji`, `color`, `shortcut`, `cwd`, `env`, `port`, `portConflict`, `confirm`, `display`, `layer`, `position`, `primary`, `type`, `reuse`, `mode`, `prompt`, `inputs`, and `actions`, for `terminals:` entries too. `color`, `layer`, `primary`, and `prompt` are strings; a mistyped action or input field makes the app drop every action in that file. A `shortcut` has `cmd`, `ctrl`, or `alt`/`opt`, optionally `shift`, and exactly one key.
9. `type` is `terminal`, `command`, or `background` when set.
10. `mode` is `remote` or `sync`; `sync` requires SSH.
11. Input fields are only `label`, `type` (`text`, `password`, `radio`), `required`, `placeholder`, `default`, `persist`, `options`, and `position`. Radio inputs have options and a matching default; option mappings have both `label` and `value`.
12. Profiles and `dependsOn` reference defined services; dependency graphs are acyclic. A service sets `dependsOn` or `depends_on`, not both.
13. `parent_name` references an existing project.
14. `worktree`, when present, is a boolean; `true` requires `parent_name`.
15. `.lpm.yml` holds only `extends`, `services`, `actions`, `terminals`, `profiles`, and `zones`; `global.yml` only `extends`, `actions`, `terminals`, and `zones`; a template only `actions` and `terminals`.
