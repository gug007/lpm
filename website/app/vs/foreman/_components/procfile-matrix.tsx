import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Cell = boolean | string;

type Row = {
  label: string;
  cells: [Cell, Cell, Cell];
};

const COLUMNS = ["lpm", "Foreman", "Overmind"] as const;

const ROWS: Row[] = [
  {
    label: "Re-reads Procfile.dev every time it starts",
    cells: ["imports it once, when you add the folder", true, true],
  },
  {
    label: "Sets $PORT for each process type",
    cells: ["you write it in env:", "-p base, +100 a line", "-p base, -P step"],
  },
  {
    label: "Reads a .env file without being asked",
    cells: [false, ".env in the working directory", ".overmind.env, then .env"],
  },
  {
    label: "All output interleaved on one stdout stream",
    cells: [false, true, false],
  },
  {
    label: "Exports launchd or systemd units for deploy",
    cells: [false, "foreman export", false],
  },
  {
    label: "Installs on a Windows or Linux workstation",
    cells: [
      "Mac app; Linux only as a remote host",
      "Linux, macOS",
      "Linux, *BSD, macOS",
    ],
  },
  {
    label: "Attach a shell to one running process",
    cells: ["panes are read-only", false, "overmind connect"],
  },
  {
    label: "Run two copies of web from one line",
    cells: ["one entry, one process", "-m web=2", "-m web=2"],
  },
  {
    label: "One command brings the whole stack up",
    cells: ["one click, or lpm start with the app running", true, true],
  },
  {
    label: "A live pane per process, all visible at once",
    cells: [true, false, "a tmux window each"],
  },
  {
    label: "Restart css without restarting web",
    cells: ["lpm service css restart", false, "overmind restart css"],
  },
  {
    label: "One process dying leaves the others alive",
    cells: [
      true,
      "one exit ends the formation",
      "only with -c or --any-can-die",
    ],
  },
  {
    label: "The stack outlives the terminal you started it in",
    cells: [
      "quit the app, services stay up",
      false,
      "its tmux session, detach with Ctrl-b d",
    ],
  },
  {
    label: "What you install before the first run",
    cells: ["the app; no tmux, no Ruby", "Ruby, then the gem", "tmux, then the binary"],
  },
  {
    label: "Redis is started before Sidekiq",
    cells: ["dependsOn: [redis]", false, false],
  },
  {
    label: "Names what is already holding :3000",
    cells: [true, false, false],
  },
  {
    label: "Run a named subset instead of a per-run flag",
    cells: ["profiles:", "-m web=2,worker=0", "-l web,worker"],
  },
  {
    label: "Two Rails apps up at once in one window",
    cells: [true, false, false],
  },
  {
    label: "A second Claude Code or Codex agent gets its own checkout",
    cells: ["1–50 worktrees or copies", false, false],
  },
  {
    label: "A desktop window rather than a foreground command",
    cells: [true, "a foreground command", "a foreground command plus tmux"],
  },
  {
    label: "Licence on the gem, the binary and the app",
    cells: ["MIT", "MIT", "MIT"],
  },
];

// The wrapper is positioned so the absolutely positioned `sr-only` label
// resolves against the cell rather than the page, which is what keeps it inside
// the scroller once the table is wider than the window.
function CellValue({ value }: { value: Cell }) {
  if (typeof value === "string") {
    return (
      <span className="block text-center text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  return value ? (
    <span className="relative block">
      <Check
        aria-hidden="true"
        className="mx-auto h-4 w-4 text-gray-900 dark:text-white"
      />
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="relative block">
      <X
        aria-hidden="true"
        className="mx-auto h-4 w-4 text-gray-500 dark:text-gray-400"
      />
      <span className="sr-only">No</span>
    </span>
  );
}

function MobileCellValue({ value }: { value: Cell }) {
  if (typeof value === "string") {
    return (
      <span className="text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white">
      <Check aria-hidden="true" className="h-3.5 w-3.5" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <X aria-hidden="true" className="h-3.5 w-3.5" />
      No
    </span>
  );
}

export function ProcfileMatrix() {
  return (
    <section id="matrix" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="All three, side by side"
          title="The same three lines, three ways"
          description="Nine of these twenty-one rows go to Foreman or Overmind. They are the first nine."
        />

        <div className="hidden md:block overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]">
                  <th
                    scope="col"
                    className="w-2/5 px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                  >
                    Capability
                  </th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={`px-3 py-4 text-center font-semibold ${
                        column === "lpm"
                          ? "bg-gray-100/70 text-gray-900 dark:bg-white/[0.04] dark:text-white"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, rowIndex) => (
                  <tr
                    key={row.label}
                    className={
                      rowIndex !== ROWS.length - 1
                        ? "border-b border-gray-200 dark:border-gray-800"
                        : ""
                    }
                  >
                    <th
                      scope="row"
                      className="px-5 py-4 text-left font-normal text-gray-700 dark:text-gray-300"
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={COLUMNS[cellIndex]}
                        className={`px-3 py-4 align-middle ${
                          COLUMNS[cellIndex] === "lpm"
                            ? "bg-gray-100/70 dark:bg-white/[0.04]"
                            : ""
                        }`}
                      >
                        <CellValue value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="space-y-3 md:hidden">
          {ROWS.map((row) => (
            <li
              key={row.label}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-3 text-sm leading-snug text-gray-700 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
                {row.label}
              </div>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {row.cells.every((cell) => cell === row.cells[0]) ? (
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[12px] text-gray-500 dark:text-gray-400">
                      All three
                    </dt>
                    <dd className="shrink-0 text-right">
                      <MobileCellValue value={row.cells[0]} />
                    </dd>
                  </div>
                ) : (
                  row.cells.map((cell, index) => (
                    <div
                      key={COLUMNS[index]}
                      className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                        COLUMNS[index] === "lpm"
                          ? "bg-gray-100/70 dark:bg-white/[0.04]"
                          : ""
                      }`}
                    >
                      <dt
                        className={`text-[12px] ${
                          COLUMNS[index] === "lpm"
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {COLUMNS[index]}
                      </dt>
                      <dd className="min-w-0 text-right">
                        <MobileCellValue value={cell} />
                      </dd>
                    </div>
                  ))
                )}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
