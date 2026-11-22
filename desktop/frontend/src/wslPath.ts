// The distro a WSL project lives in, read from its root the way wsl.rs reads it:
// `\\wsl.localhost\<distro>\…`, `\\wsl$\<distro>\…` or `\\?\UNC\wsl$\<distro>\…`,
// with either slash. Null for any other folder.
const HOSTS = ["wsl.localhost", "wsl$"];

export function wslDistroOf(root: string | null | undefined): string | null {
  if (!root) return null;
  const path = root.trim().replace(/\//g, "\\");
  const rest = path.startsWith("\\\\?\\UNC\\")
    ? path.slice(8)
    : path.startsWith("\\\\")
      ? path.slice(2)
      : null;
  if (rest === null) return null;
  const [host, distro] = rest.split("\\").filter(Boolean);
  if (!host || !distro || !HOSTS.includes(host.toLowerCase())) return null;
  return distro;
}
