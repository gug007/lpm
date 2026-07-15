# Validation workflow

Read this reference before writing any lpm config.

## Preferred workflow

Resolve the target before editing:

```bash
lpm config resolve --cwd . --json
```

Validate after every write:

```bash
lpm config validate <path> --json
```

Treat `valid: false` as a failed change. Fix every error and rerun validation. Review warnings and report any that affect the requested behavior.

The validator checks YAML shape, supported fields, config-layer restrictions, identity, SSH settings, commands, local directories, ports, action types, displays, modes, inputs, shortcuts, profiles, service dependencies, cycles, duplicates, and the effective merged project.

## Fallback checklist

When the installed CLI does not provide `lpm config`, first tell the user that the CLI can be updated from the lpm app’s Settings. Continue by checking the relevant items manually:

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
13. `.lpm.yml`, global config, and templates contain only fields supported by their layer.
