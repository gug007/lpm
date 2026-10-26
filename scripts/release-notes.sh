#!/bin/sh
# release-notes.sh <previous-tag> <next-tag>
#   Has Claude write the one-line changelog entry for the next release from
#   the app's commits since the previous tag. Prints nothing when no change
#   reaches people using the app.
set -e

FROM="$1"
NEXT="$2"
ROOT=$(git rev-parse --show-toplevel)

# The website, the phone apps and the share relay ship on their own.
COMMITS=$(git -C "$ROOT" log --no-merges --format='%n## %s%n%b' --stat=100 --stat-count=12 \
  "${FROM:+$FROM..}HEAD" -- . ':!website' ':!mobile' ':!relay' | head -c 60000)

if [ -z "$COMMITS" ]; then
  exit 0
fi

# Run outside the repo with no tools, settings or MCP servers, so Claude reads
# only this prompt instead of loading a full coding session.
REPLY=$(cd "${TMPDIR:-/tmp}" && claude -p --model opus --effort low --tools "" \
  --no-session-persistence --strict-mcp-config --setting-sources project --disable-slash-commands \
  --system-prompt "You write the release notes for lpm. Follow the instructions exactly." <<EOF
You write the changelog line for lpm $NEXT. lpm is a desktop app that starts, stops and duplicates local dev projects and runs AI coding agents in a built-in terminal, with a phone companion app and a command-line tool.

Below are the commits since the previous release, with the files each one touched. Write ONE line, at most about 35 words, saying what changed for someone using lpm.

- Say what people can now do, or what got fixed, in plain product terms. Never mention file names, code, commit prefixes, libraries, or internal tools and formats such as tmux or YAML.
- Write fragments in the style of the examples: lead with the most notable change and join the rest with commas and "and".
- Leave out tests, CI, build scripts, docs, refactors and internal cleanup.
- If nothing changed for people using lpm, reply with exactly: NONE
- Reply with the line only: no quotes, no preamble, and no Markdown except backticks around a command.

Examples of earlier lines:
- A weekly recap of your agents’ work that you can share, a Claude account for each automation, and message history merged across paired computers. The notification center is gone.
- Choose how each kind of notification reaches you, and forwarded ports come back after a restart.
- Work through merge conflicts file by file, a searchable branch picker, and create, rename and delete files in the Files tree.
- Actions and terminal commands show whether they’re running, finished or failed, and updates can wait until lpm is idle, with \`lpm update\` in the CLI.
- Automations use the Claude account you chose.
- Fixed a Settings animation glitch.

Commits:
$COMMITS
EOF
)

printf '%s\n' "$REPLY" |
  awk 'NF { gsub(/^[[:space:]"]+|[[:space:]"]+$/, ""); if ($0 != "NONE") print; exit }'
