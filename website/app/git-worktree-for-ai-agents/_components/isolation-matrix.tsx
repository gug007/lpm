import { Check, Minus, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Cell = boolean | "partial" | string;

type Row = {
  label: string;
  cells: [Cell, Cell, Cell, Cell, Cell];
};

const COLUMNS = [
  { name: "git worktree", sub: "raw Git", mono: true },
  { name: "claude --worktree", sub: "Claude Code", mono: true },
  { name: "Codex worktrees", sub: "Codex app", mono: false },
  { name: "lpm Worktree", sub: "lpm", mono: false },
  { name: "lpm Duplicate", sub: "lpm", mono: false },
];

const ROWS: Row[] = [
  {
    label: "Isolated working directory",
    cells: [true, true, true, true, true],
  },
  {
    label: "Git repository",
    cells: ["shared", "shared", "shared", "shared", "independent"],
  },
  {
    label: "Created and removed for you",
    cells: [false, true, true, true, true],
  },
  {
    label: "Carries .env and other ignored files",
    cells: [false, ".worktreeinclude", false, false, true],
  },
  {
    label: "Carries installed dependencies",
    cells: [false, false, false, "reinstall", true],
  },
  {
    label: "Starts from your uncommitted work",
    cells: [false, false, false, false, true],
  },
  {
    label: "Two agents on the same branch",
    cells: [false, false, false, false, true],
  },
  {
    label: "Create many at once",
    cells: [false, false, "one per thread", "1–50", "1–50"],
  },
  {
    label: "Queue the same prompt on each",
    cells: [false, false, false, true, true],
  },
  {
    label: "Inherits the project's services and actions",
    cells: [false, false, false, true, true],
  },
  {
    label: "Works with any terminal agent",
    cells: [false, "Claude only", "Codex only", true, true],
  },
  {
    label: "Isolates ports, databases, Docker volumes",
    cells: [false, false, false, false, false],
  },
];

function CellValue({ value }: { value: Cell }) {
  if (value === "partial") {
    return (
      <>
        <Minus
          aria-hidden
          className="mx-auto h-4 w-4 text-gray-400 dark:text-gray-500"
        />
        <span className="sr-only">Partial</span>
      </>
    );
  }
  if (typeof value === "string") {
    return (
      <span className="block text-center text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  return value ? (
    <>
      <Check
        aria-hidden
        className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400"
      />
      <span className="sr-only">Yes</span>
    </>
  ) : (
    <>
      <X
        aria-hidden
        className="mx-auto h-4 w-4 text-gray-300 dark:text-gray-600"
      />
      <span className="sr-only">No</span>
    </>
  );
}

function MobileCellValue({ value }: { value: Cell }) {
  if (typeof value === "string" && value !== "partial") {
    return (
      <span className="text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <Check aria-hidden className="h-3.5 w-3.5" />
        Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <X aria-hidden className="h-3.5 w-3.5" />
        No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
      <Minus aria-hidden className="h-3.5 w-3.5" />
      Partial
    </span>
  );
}

export default function IsolationMatrix() {
  return (
    <section id="matrix" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Five ways to isolate an agent"
          title="Git worktree vs lpm Worktree vs lpm Duplicate"
          description="The same table with the two built-in agent flags alongside them, so you can see exactly where each boundary is drawn."
          className="mb-12"
        />

        <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 md:block dark:border-gray-800">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025]">
                <th
                  scope="col"
                  className="w-[26%] px-5 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                >
                  Capability
                </th>
                {COLUMNS.map((column, index) => (
                  <th
                    key={column.name}
                    scope="col"
                    className={`px-4 py-4 text-center align-bottom ${
                      index === COLUMNS.length - 1
                        ? "bg-emerald-50/60 dark:bg-emerald-400/[0.045]"
                        : ""
                    }`}
                  >
                    <span
                      className={`block text-[13px] font-semibold ${
                        column.mono ? "font-mono" : ""
                      } ${
                        index === COLUMNS.length - 1
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {column.name}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">
                      {column.sub}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, rowIndex) => (
                <tr
                  key={row.label}
                  className={
                    rowIndex < ROWS.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="px-5 py-4 text-left align-middle font-medium text-gray-800 dark:text-gray-200"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, cellIndex) => (
                    <td
                      key={COLUMNS[cellIndex].name}
                      className={`px-4 py-4 align-middle ${
                        cellIndex === COLUMNS.length - 1
                          ? "bg-emerald-50/35 dark:bg-emerald-400/[0.025]"
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

        <div className="space-y-4 md:hidden">
          {ROWS.map((row) => (
            <article
              key={row.label}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <h3 className="border-b border-gray-200 bg-gray-50/80 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-gray-800 dark:bg-white/[0.025] dark:text-gray-100">
                {row.label}
              </h3>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {row.cells.every((cell) => cell === row.cells[0]) ? (
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[12px] text-gray-500 dark:text-gray-400">
                      All five
                    </dt>
                    <dd className="shrink-0 text-right">
                      <MobileCellValue value={row.cells[0]} />
                    </dd>
                  </div>
                ) : (
                  row.cells.map((cell, index) => {
                    const isLpmDuplicate = index === COLUMNS.length - 1;
                    return (
                      <div
                        key={COLUMNS[index].name}
                        className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                          isLpmDuplicate
                            ? "bg-emerald-50/40 dark:bg-emerald-400/[0.03]"
                            : ""
                        }`}
                      >
                        <dt
                          className={`text-[12px] ${
                            COLUMNS[index].mono ? "font-mono" : ""
                          } ${
                            isLpmDuplicate
                              ? "font-semibold text-emerald-800 dark:text-emerald-300"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {COLUMNS[index].name}
                        </dt>
                        <dd className="shrink-0 text-right">
                          <MobileCellValue value={cell} />
                        </dd>
                      </div>
                    );
                  })
                )}
              </dl>
            </article>
          ))}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          The last one is worth reading twice. Nothing above reserves a port,
          namespaces a database, or forks a Docker volume — including both lpm
          entries. Filesystem isolation is where all five stop, and it is the
          collision developers running parallel agents hit most often. lpm
          already catches the port half of it at start time and tells you which
          process is holding the port; assigning each copy its own is what we
          are building next, and this line will change when it ships.
        </p>
      </div>
    </section>
  );
}
