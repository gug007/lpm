import { NextResponse, type NextRequest } from "next/server";
import {
  CONSENT_COUNTRIES,
  REGION_ASK,
  REGION_COOKIE,
  REGION_SKIP,
} from "@/lib/consent";

const YEAR = 60 * 60 * 24 * 365;

// Notes once per browser whether the visitor is in a country where lpm.cx asks
// before Google's tags store anything. The matcher skips requests that already
// carry the cookie, so this runs on a visitor's first page and not after. Its
// values must be literals for Next.js to read them at build time, so the
// cookie's name is spelled out there.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const country = request.headers.get("x-vercel-ip-country");
  if (!country) return response;
  response.cookies.set(
    REGION_COOKIE,
    CONSENT_COUNTRIES.includes(country) ? REGION_ASK : REGION_SKIP,
    { path: "/", maxAge: YEAR, sameSite: "lax", secure: true },
  );
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/|api/|demo-app/|join|.*\\.[a-z0-9]+$).*)",
      missing: [{ type: "cookie", key: "lpm-consent-region" }],
    },
  ],
};
