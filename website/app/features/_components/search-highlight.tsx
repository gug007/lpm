import { Fragment } from "react";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function SearchHighlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        className="rounded-sm bg-gray-900/[0.08] font-semibold text-gray-900 dark:bg-white/[0.14] dark:text-white"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
