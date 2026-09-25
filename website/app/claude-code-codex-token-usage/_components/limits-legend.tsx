import { LEGEND } from "./limits-data";

export default function LimitsLegend() {
  return (
    <ul className="mx-auto mt-10 grid max-w-5xl gap-6 text-sm leading-relaxed text-gray-500 sm:grid-cols-3 dark:text-gray-400">
      {LEGEND.map(({ lead, text }) => (
        <li key={lead}>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{lead}</span>{" "}
          {text}
        </li>
      ))}
    </ul>
  );
}
