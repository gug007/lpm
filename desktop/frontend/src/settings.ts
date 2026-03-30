export const SETTINGS = {
  DOUBLE_CLICK: "lpm-dblclick",
} as const;

export function getSetting(key: string): boolean {
  return localStorage.getItem(key) === "true";
}

export function setSetting(key: string, value: boolean) {
  localStorage.setItem(key, String(value));
}
