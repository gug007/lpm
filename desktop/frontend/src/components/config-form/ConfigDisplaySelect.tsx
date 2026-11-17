import { isFooterDisplay, isHeaderDisplay } from "../../types";
import { ConfigSelect } from "./ConfigSelect";

export function ConfigDisplaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inZone = !isHeaderDisplay(value) && !isFooterDisplay(value) && value !== "menu";
  return (
    <ConfigSelect
      value={value === "button" ? "" : value}
      onChange={onChange}
      options={[
        { value: "", label: "Header (default)" },
        { value: "footer", label: "Footer" },
        ...(value === "menu" ? [{ value: "menu", label: "Menu (legacy)" }] : []),
        ...(inZone ? [{ value, label: `Zone “${value}”` }] : []),
      ]}
    />
  );
}
