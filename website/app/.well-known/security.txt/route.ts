import { SECURITY_PATH, SECURITY_REPORT_URL, SITE_URL } from "@/lib/links";

export const dynamic = "force-static";

// RFC 9116 wants Expires under a year out. The file is built with each
// deploy, so it moves forward on its own as long as the site ships.
const VALID_DAYS = 180;

export function GET() {
  const expires = new Date(Date.now() + VALID_DAYS * 86_400_000);
  const body = [
    `Contact: ${SECURITY_REPORT_URL}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    `Policy: ${SITE_URL}${SECURITY_PATH}#report`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
