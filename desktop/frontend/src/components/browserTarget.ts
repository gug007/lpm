// Precedence: explicit scheme → localhost (http) → domain-shaped (https) → Google search.
export function toTarget(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || v.startsWith("about:")) return v;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/.test(v)) return "http://" + v;
  if (!/\s/.test(v) && /^[^\s/]+\.[a-z]{2,}([:/?#]|$)/i.test(v)) return "https://" + v;
  return "https://www.google.com/search?q=" + encodeURIComponent(v);
}
