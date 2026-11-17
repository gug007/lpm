import { CONFIG_INPUT } from "./configFormStyles";

export function ConfigInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={`${CONFIG_INPUT} ${mono ? "font-mono text-[12px]" : ""}`}
    />
  );
}
