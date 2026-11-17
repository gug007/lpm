import { codexStatusLineColor, type CodexStatusLineColorScheme } from "./codexStatusLineColors";
import { previewableCodexItems } from "./codexStatusLineOptions";

// A Codex status line's samples, dot-separated, in Codex's theme colors.
export function CodexStatusLineItems({
  items,
  useColors,
  scheme,
}: {
  items: readonly string[];
  useColors: boolean;
  scheme: CodexStatusLineColorScheme;
}) {
  return previewableCodexItems(items).map(({ item, option }, index) => (
    <span key={`${item}:${index}`} className="contents">
      {index > 0 && (
        <span aria-hidden className="px-1.5" style={{ opacity: 0.38 }}>
          ·
        </span>
      )}
      <span
        data-status-line-item={item}
        className="whitespace-nowrap"
        style={{
          color: useColors ? codexStatusLineColor(option.accent, scheme) : undefined,
          opacity: useColors ? 1 : 0.65,
          textDecoration: option.id === "pull-request-number" ? "underline" : undefined,
        }}
      >
        {option.preview}
      </span>
    </span>
  ));
}
