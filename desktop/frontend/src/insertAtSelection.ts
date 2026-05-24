/**
 * Inserts text at the input's current selection, returning the new value and
 * the resulting cursor position. If the entire value is selected (e.g. just
 * after a focus+select), inserts at the end instead of replacing — this avoids
 * wiping the field on the very first emoji click.
 */
export function insertAtSelection(
  input: HTMLInputElement | null,
  value: string,
  text: string,
): { value: string; cursor: number } {
  const selStart = input?.selectionStart ?? null;
  const selEnd = input?.selectionEnd ?? null;
  const everythingSelected =
    selStart === 0 && selEnd === value.length && value.length > 0;

  const start = everythingSelected || selStart === null ? value.length : selStart;
  const end = everythingSelected || selEnd === null ? value.length : selEnd;

  return {
    value: value.slice(0, start) + text + value.slice(end),
    cursor: start + text.length,
  };
}
