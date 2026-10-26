import { gap, line, s, type Line } from "@/components/terminal-line";

const CLAUDE_GREEN = "text-[#4eba65]";
const BOLD = "font-semibold text-gray-100";
const TEXT = "text-gray-200";
const DIM = "text-gray-500";

const AGENT_PROMPT =
  "add postgres before the api, and a deploy button that asks first";

export const AGENT_LINES: Line[] = [
  {
    ...line(s("❯ ", "text-[#707070]"), s(`${AGENT_PROMPT} `, TEXT)),
    bubble: "bg-[#373737]",
  },
  gap(s("⏺ ", CLAUDE_GREEN), s("Skill", BOLD), s("(lpm-config)", TEXT)),
  line(s("  ⎿  Successfully loaded skill", DIM)),
  gap(
    s("⏺ ", CLAUDE_GREEN),
    s("Bash", BOLD),
    s("(lpm config get --layer project --project shop --json)", TEXT),
  ),
  line(s('  ⎿  {"layer": "project", "revision": "7c2e91", …}', DIM)),
  gap(s("⏺ ", CLAUDE_GREEN), s("Write", BOLD), s("(/tmp/shop.yml)", TEXT)),
  line(s("  ⎿  Wrote 21 lines", DIM)),
  gap(
    s("⏺ ", CLAUDE_GREEN),
    s("Bash", BOLD),
    s("(lpm config apply --layer project --project shop --if-revision 7c2e91 …)", TEXT),
  ),
  line(s("  ⎿  ", DIM), s('{"applied": true, "warnings": []}', CLAUDE_GREEN)),
  gap(
    s("⏺ ", "text-gray-100"),
    s("Done. db starts before api, and Deploy asks before it runs.", TEXT),
  ),
];

export type DiffLine = { text: string; added?: boolean };

export const AGENT_DIFF: DiffLine[] = [
  { text: "services:" },
  { text: "  db: docker compose up postgres", added: true },
  { text: "  api:" },
  { text: "    cmd: npm run api" },
  { text: "    dependsOn: [db]", added: true },
  { text: "  web: npm run dev" },
  { text: "actions:" },
  { text: "  deploy:", added: true },
  { text: "    cmd: ./scripts/deploy.sh", added: true },
  { text: "    label: Deploy", added: true },
  { text: "    confirm: true", added: true },
];
