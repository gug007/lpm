import { getChangelogReleases } from "@/lib/changelog";
import { changelogDays } from "@/lib/changelog-days";

export const revalidate = 3600;

export async function GET() {
  const days = changelogDays(await getChangelogReleases());
  return Response.json(days, { headers: { "X-Robots-Tag": "noindex" } });
}
