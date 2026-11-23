// Which release was the newest on a day, and who was on it.
const SHOWN = 4;
const isRelease = (version) => /^\d+\.\d+\.\d+$/.test(version);

// Newest last; a prerelease comes before its release.
export function compareVersions(a, b) {
  const [left, right] = [a, b].map((v) => v.split("-")[0].split(".").map(Number));
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  const [pre, other] = [a, b].map((v) => v.split("-").slice(1).join("-"));
  if (!pre || !other) return Number(!pre) - Number(!other);
  return pre.localeCompare(other, "en", { numeric: true });
}

// The tagged releases, with any release seen in use whose tag isn't fetched here.
export function releaseList(tags, versions) {
  const list = new Map(tags.map((tag) => [tag.version, { ...tag, tagged: true }]));
  for (const { version, day } of versions) {
    if (!isRelease(version)) continue;
    const known = list.get(version);
    if (!known) list.set(version, { version, day, tagged: false });
    else if (!known.tagged && day < known.day) known.day = day;
  }
  return [...list.values()].sort((a, b) => compareVersions(a.version, b.version));
}

export function newestOn(releases, day) {
  return releases.filter((release) => release.day <= day).at(-1)?.version;
}

// The versions of one day, newest first, the rest added up.
export function versionRows(rows, releases, newest) {
  const before = newest && releases.filter((r) => compareVersions(r.version, newest) < 0).at(-1)?.version;
  const kind = (version) => (newest && compareVersions(version, newest) >= 0 ? "newest" : version === before ? "prev" : "older");
  const list = rows.map(({ version, n }) => ({ name: `v${version}`, n, kind: kind(version), version }));
  if (newest && list.length && !list.some((row) => row.version === newest)) list.push({ name: `v${newest}`, n: 0, kind: "newest", version: newest });
  list.sort((a, b) => compareVersions(b.version, a.version));
  const out = list.slice(0, SHOWN).map(({ version, ...row }) => ({ ...row, newest: version === newest }));
  const rest = list.slice(SHOWN);
  if (rest.length === 1) out.push({ name: rest[0].name, n: rest[0].n, kind: rest[0].kind, newest: false });
  else if (rest.length) out.push({ name: `${rest.length} older versions`, n: rest.reduce((sum, row) => sum + row.n, 0), kind: "older", newest: false });
  return out;
}
