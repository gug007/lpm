import type { ReleaseStat } from "@/lib/github-stats";
import { dateFmt, numberFmt } from "./format";

// Hundreds of rows, so the styling sits on the table and each row stays bare.
export function OlderReleasesTable({ releases }: { releases: ReleaseStat[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm [&_td]:py-2 [&_td]:pl-5 [&_td:last-child]:pr-5 [&_td:nth-child(2)]:w-full [&_td:nth-child(2)]:pl-2 [&_td:nth-child(2)]:text-xs [&_td:nth-child(2)]:text-gray-500 dark:[&_td:nth-child(2)]:text-gray-400 [&_td:first-child]:whitespace-nowrap [&_td:last-child]:text-right [&_td:last-child]:tabular-nums [&_td:last-child]:text-gray-700 dark:[&_td:last-child]:text-gray-300 [&_tr+tr]:border-t [&_tr+tr]:border-gray-100 dark:[&_tr+tr]:border-gray-800/60 [&_a]:font-semibold [&_a]:text-gray-900 dark:[&_a]:text-gray-100 [&_a:hover]:underline">
        <thead className="sr-only">
          <tr>
            <th>Release</th>
            <th>Date</th>
            <th>Downloads</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r) => (
            <tr key={r.tag}>
              <td>
                <a href={r.url}>{r.tag}</a>
              </td>
              <td>{r.publishedAt ? dateFmt.format(new Date(r.publishedAt)) : ""}</td>
              <td>{numberFmt.format(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
