import { TerminalLine } from "@/components/terminal-line";
import { AGENT_DIFF, AGENT_LINES } from "./agent-transcript-data";

const ADDED = AGENT_DIFF.filter((l) => l.added).length;

export function AgentTranscript() {
  return (
    <figure
      data-on-dark
      className="overflow-hidden rounded-2xl border border-gray-200 bg-[#1a1a1a] shadow-sm dark:border-gray-800"
    >
      <div className="flex h-8 items-end gap-0.5 border-b border-[#2d2d2d] bg-[#161616] px-2">
        <span className="flex items-center gap-1.5 rounded-t-md bg-[#1f1f1f] px-2.5 py-1 text-[10.5px] text-gray-100 ring-1 ring-inset ring-[#2d2d2d]">
          <span className="text-[#d97757]" aria-hidden>
            ✳
          </span>
          Claude Code
        </span>
        <span className="ml-auto self-center font-mono text-[10px] text-gray-500">
          shop
        </span>
      </div>
      <div
        role="img"
        aria-label="Claude Code loads the lpm-config skill, reads the shop project's config, writes the change, and applies it. lpm answers applied: true."
        className="overflow-hidden px-3 py-3 font-mono leading-[1.35rem] [mask-image:linear-gradient(to_right,#000_88%,transparent)]"
      >
        {AGENT_LINES.map((l, i) => (
          <TerminalLine
            key={i}
            line={l}
            size="text-[10px] sm:text-[11px]"
            fallback="text-gray-300"
            gapClass="mt-2"
          />
        ))}
      </div>
      <figcaption className="border-t border-[#2d2d2d] bg-[#161616]">
        <span className="flex items-center justify-between px-3 py-2 font-mono text-[10.5px] text-gray-400">
          ~/.lpm/projects/shop.yml
          <span className="text-[#4eba65]">+{ADDED}</span>
        </span>
        <pre className="overflow-x-auto pb-3 font-mono text-[10.5px] leading-[1.15rem] sm:text-[11px]">
          {AGENT_DIFF.map(({ text, added }, i) => (
            <span
              key={i}
              className={`block px-3 ${
                added ? "bg-[#4eba65]/10 text-[#8fe0a1]" : "text-gray-400"
              }`}
            >
              <span aria-hidden className="mr-2 select-none text-gray-600">
                {added ? "+" : " "}
              </span>
              {text}
            </span>
          ))}
        </pre>
      </figcaption>
    </figure>
  );
}
