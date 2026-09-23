type Token = { text: string; className?: string };

// Monaco's own YAML colours ("vs" / "vs-dark"), so the static copy reads the
// same as the editor that replaces it on larger screens.
const KEY = "text-[#008080] dark:text-[#3dc9b0]";
const STRING = "text-[#0451a5] dark:text-[#ce9178]";
const NUMBER = "text-[#098658] dark:text-[#b5cea8]";
const KEYWORD = "text-[#0000ff] dark:text-[#569cd6]";
const COMMENT = "text-[#008000] dark:text-[#6a9955]";

function valueClass(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return NUMBER;
  if (/^(true|false|null)$/.test(value)) return KEYWORD;
  return STRING;
}

function tokenize(line: string): Token[] {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  if (trimmed.startsWith("#")) {
    return [{ text: indent }, { text: trimmed, className: COMMENT }];
  }
  const match = /^([^:#]+):(\s*)(.*)$/.exec(trimmed);
  if (!match) return [{ text: line }];
  const [, key, gap, rest] = match;
  const hash = rest.search(/\s#/);
  const value = hash === -1 ? rest : rest.slice(0, hash);
  const comment = hash === -1 ? "" : rest.slice(hash);
  return [
    { text: indent },
    { text: key, className: KEY },
    { text: `:${gap}` },
    { text: value, className: valueClass(value.trim()) },
    { text: comment, className: COMMENT },
  ];
}

export function ConfigYaml({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const lines = source.replace(/\n+$/, "").split("\n");
  return (
    <pre
      className={`m-0 overflow-x-auto py-3 pr-4 font-mono text-xs leading-[18px] text-gray-700 dark:text-gray-300 ${className}`}
    >
      <code>
        {lines.map((line, i) => (
          <span key={i} className="block min-h-[18px] whitespace-pre">
            <span
              aria-hidden="true"
              className="mr-3 inline-block w-7 select-none text-right tabular-nums text-gray-500"
            >
              {i + 1}
            </span>
            {tokenize(line).map((token, j) =>
              token.className ? (
                <span key={j} className={token.className}>
                  {token.text}
                </span>
              ) : (
                token.text
              ),
            )}
          </span>
        ))}
      </code>
    </pre>
  );
}
