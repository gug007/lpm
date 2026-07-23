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

The apply validator checks YAML shape, supported fields, config-layer restrictions, identity, SSH settings, commands, local directories, ports, action types, displays, modes, inputs, shortcuts, profiles, service dependencies, cycles, duplicates, and the effective merged project.

## No-write fallback

When the app is not running or the installed CLI does not provide `config get` and `config apply`, tell the user to start or update lpm from Settings. Do not modify the live file directly. You may inspect the configuration read-only and use this checklist to prepare a proposed candidate:

1. The YAML parses as a mapping and contains no invented fields.
2. A personal project sets exactly one of `root` and `ssh`.
3. A local project resolves every `cwd` to an existing directory.
4. Services and executable action leaves have non-empty commands after layering.
5. Service ports are unique; all ports are between 0 and 65535.
6. `portConflict` is `ask`, `free`, or `fail`.
7. `display` is `header` or `footer`; accept `menu` only as legacy.
8. `type` is `terminal`, `command`, or `background` when set.
9. `mode` is `remote` or `sync`; `sync` requires SSH.
10. Radio inputs have options and a matching default.
11. Profiles and `dependsOn` reference defined services; dependency graphs are acyclic.
12. `parent_name` references an existing project.
13. `worktree`, when present, is a boolean; `true` requires `parent_name`.
14. `.lpm.yml`, global config, and templates contain only fields supported by their layer.
