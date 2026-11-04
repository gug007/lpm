// macOS draws the close, minimise and zoom buttons into the space the app
// leaves for them (tauri.conf.json trafficLightPosition); in a browser nothing
// does, so the demo draws them there.
const COLORS = ["#ff5f57", "#febc2e", "#28c840"];

export function drawWindowButtons(): void {
  const row = document.createElement("div");
  row.setAttribute("aria-hidden", "true");
  Object.assign(row.style, {
    position: "fixed",
    left: "14px",
    top: "22px",
    display: "flex",
    gap: "8px",
    zIndex: "2147483645",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  for (const color of COLORS) {
    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      background: color,
      boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,.25)",
    } satisfies Partial<CSSStyleDeclaration>);
    row.appendChild(dot);
  }
  document.body.appendChild(row);
}
