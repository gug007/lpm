import { DETECTION_ROWS } from "./detection-data";
import { DetectionCommand } from "./detection-command";

export function DetectionTable() {
  return (
    <div className="mb-4">
      <ul className="md:hidden space-y-2">
        {DETECTION_ROWS.map((row) => (
          <li
            key={row.stack}
            className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-xs"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {row.stack}
              </span>
              <span className="text-right text-[10px] text-gray-500 dark:text-gray-400">
                {row.reads}
              </span>
            </div>
            <div className="mt-2">
              <DetectionCommand row={row} />
            </div>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Named {row.name} · port {row.port}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-xs text-left">
          <caption className="sr-only">
            Project types lpm detects when you add a folder
          </caption>
          <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Stack
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Runs
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Named
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Port
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 align-top">
            {DETECTION_ROWS.map((row) => (
              <tr key={row.stack}>
                <th
                  scope="row"
                  className="px-4 py-3 font-normal text-gray-500 dark:text-gray-400"
                >
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">
                    {row.stack}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug">
                    {row.reads}
                  </span>
                </th>
                <td className="px-4 py-3">
                  <DetectionCommand row={row} />
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {row.name}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {row.port}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
