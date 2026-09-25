import { dayTotal, type DayPoint } from "./stats-derive";
import { dayLabel, formatTokenCount, formatUsd } from "./stats-format";

export default function StatsChartTable({
  days,
  caption,
  now,
}: {
  days: DayPoint[];
  caption: string;
  now: number | null;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Claude Code</th>
            <th scope="col">Codex</th>
            <th scope="col">Total</th>
            <th scope="col">Estimated cost</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.ago}>
              <th scope="row">{dayLabel(day.ago, now)}</th>
              <td>{formatTokenCount(day.claude)}</td>
              <td>{formatTokenCount(day.codex)}</td>
              <td>{formatTokenCount(dayTotal(day))}</td>
              <td>{`≈ ${formatUsd(day.cost.claude + day.cost.codex)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
