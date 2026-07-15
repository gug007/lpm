#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

for skill in lpm lpm-cli lpm-config; do
  python3 - "$skill" <<'PY'
import pathlib
import re
import sys

folder = pathlib.Path(sys.argv[1])
skill_file = folder / "SKILL.md"
text = skill_file.read_text()
parts = text.split("---", 2)
if len(parts) != 3 or parts[0].strip():
    raise SystemExit(f"{skill_file}: invalid frontmatter")
fields = {}
for line in parts[1].strip().splitlines():
    match = re.fullmatch(r"([A-Za-z0-9_-]+):\s*(.*)", line)
    if not match:
        raise SystemExit(f"{skill_file}: invalid frontmatter line: {line}")
    fields[match.group(1)] = match.group(2).strip().strip('"')
if set(fields) != {"name", "description"}:
    raise SystemExit(f"{skill_file}: frontmatter must contain only name and description")
if fields["name"] != folder.name:
    raise SystemExit(f"{skill_file}: name must match folder")
if not re.fullmatch(r"[a-z0-9-]{1,63}", fields["name"]):
    raise SystemExit(f"{skill_file}: invalid skill name")
if not fields["description"] or len(fields["description"]) > 600:
    raise SystemExit(f"{skill_file}: description must be 1..600 characters")
if len(text.splitlines()) > 500:
    raise SystemExit(f"{skill_file}: SKILL.md exceeds 500 lines")

files = [skill_file, *sorted((folder / "references").glob("*.md"))] if (folder / "references").exists() else [skill_file]
for source in files:
    for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", source.read_text()):
        if target.startswith(("http://", "https://", "#")):
            continue
        local = target.split("#", 1)[0]
        if local and not (source.parent / local).exists():
            raise SystemExit(f"{source}: broken link: {target}")

metadata = folder / "agents" / "openai.yaml"
if not metadata.exists():
    raise SystemExit(f"{metadata}: missing")
metadata_text = metadata.read_text()
if f"${fields['name']}" not in metadata_text:
    raise SystemExit(f"{metadata}: default_prompt must mention ${fields['name']}")
match = re.search(r'short_description:\s*"([^"]+)"', metadata_text)
if not match or not 25 <= len(match.group(1)) <= 64:
    raise SystemExit(f"{metadata}: short_description must be 25..64 characters")
PY
done

if grep -qE 'any request about managing project workflows|Use whenever the LPM_PROJECT_NAME' lpm-config/SKILL.md lpm-cli/SKILL.md; then
  echo "skill descriptions contain an over-broad trigger" >&2
  exit 1
fi

test ! -e desktop/aiskill/SKILL.md
test ! -e desktop/frontend/src-tauri/src/SKILL.md
grep -q 'lpm-config/references/actions.md' desktop/frontend/src-tauri/src/aigen.rs
grep -q 'LPM_ACTION_REFERENCE' desktop/frontend/src-tauri/src/aigen.rs
grep -q 'Config' cli/src/main.rs
grep -q 'Validate' cli/src/config_cmd.rs

echo "skill checks passed"
