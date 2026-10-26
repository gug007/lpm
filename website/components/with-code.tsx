// Copy marks commands and names with backticks.
export function withCode(text: string, codeClassName: string) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className={codeClassName}>
        {part}
      </code>
    ) : (
      part
    ),
  );
}
