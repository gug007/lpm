import type { CustomSpec } from "./statusLineTypes";

const UNSAFE_STATUS_LINE_CHARACTERS = /["$`\\]/;

export function statusLineTextError(value: string): string | null {
  return UNSAFE_STATUS_LINE_CHARACTERS.test(value)
    ? "Avoid double quotes, dollar signs, backticks, and backslashes."
    : null;
}

export function statusLineSeparatorError(value: string): string | null {
  const trimmed = value.trim();
  if ([...trimmed].length < 1 || [...trimmed].length > 3)
    return "Use 1 to 3 characters.";
  return statusLineTextError(trimmed);
}

export function statusLineIconError(value: string): string | null {
  if (UNSAFE_STATUS_LINE_CHARACTERS.test(value))
    return "Avoid double quotes, dollar signs, backticks, and backslashes.";
  if ([...value].length > 16) return "Use one emoji or a short symbol.";
  if (value !== "" && value.trim() === "")
    return "Use a visible symbol or clear the field.";
  if (value !== value.trim()) return "Remove spaces around the icon.";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    return "Control characters aren’t supported.";
  return null;
}

export function customStatusLineError(spec: CustomSpec): string | null {
  const meaningfulSegments = spec.segments.filter(
    (segment) => segment.id !== "text" || segment.text.trim() !== "",
  );
  if (meaningfulSegments.length === 0)
    return "Keep at least one item in your status line.";
  const invalidText = spec.segments.find(
    (segment) => segment.id === "text" && statusLineTextError(segment.text),
  );
  if (invalidText) return statusLineTextError(invalidText.text);
  const invalidIcon = spec.segments.find(
    (segment) => segment.icon !== undefined && statusLineIconError(segment.icon),
  );
  if (invalidIcon) return statusLineIconError(invalidIcon.icon ?? "");
  return statusLineSeparatorError(spec.separator);
}
