import type { CustomSpec } from "./statusLineTypes";

const UNSAFE_STATUS_LINE_CHARACTERS = /["$`\\]/;

export function statusLineTextError(value: string): string | null {
  return UNSAFE_STATUS_LINE_CHARACTERS.test(value)
    ? "Avoid double quotes, dollar signs, backticks, and backslashes."
    : null;
}

export function statusLineLabelError(value: string): string | null {
  const textError = statusLineTextError(value);
  if (textError) return textError;
  if (value !== "" && value.trim() === "")
    return "Use visible text or clear the field.";
  if (value !== value.trim()) return "Remove spaces around the label.";
  if (/\p{Cc}/u.test(value)) return "Control characters aren’t supported.";
  if ([...value].length > 32) return "Use 32 characters or fewer.";
  return null;
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

export interface StatusLineErrorTarget {
  message: string;
  index: number | null;
  field: "items" | "text" | "label" | "icon" | "separator";
}

export function customStatusLineErrorTarget(
  spec: CustomSpec,
): StatusLineErrorTarget | null {
  const meaningfulSegments = spec.segments.filter(
    (segment) => segment.id !== "text" || segment.text.trim() !== "",
  );
  if (meaningfulSegments.length === 0)
    return {
      message: "Keep at least one item in your status line.",
      index: null,
      field: "items",
    };
  for (const [index, segment] of spec.segments.entries()) {
    const message =
      segment.id === "text" ? statusLineTextError(segment.text) : null;
    if (message) return { message, index, field: "text" };
  }
  const shown = [...spec.segments.entries()].filter(
    ([, segment]) => segment.id !== "text" || segment.text.trim() !== "",
  );
  for (const [index, segment] of shown) {
    const message =
      segment.label === undefined ? null : statusLineLabelError(segment.label);
    if (message) return { message, index, field: "label" };
  }
  for (const [index, segment] of shown) {
    const message =
      segment.icon === undefined ? null : statusLineIconError(segment.icon);
    if (message) return { message, index, field: "icon" };
  }
  const separatorMessage = statusLineSeparatorError(spec.separator);
  return separatorMessage
    ? { message: separatorMessage, index: null, field: "separator" }
    : null;
}

export function customStatusLineError(spec: CustomSpec): string | null {
  return customStatusLineErrorTarget(spec)?.message ?? null;
}
