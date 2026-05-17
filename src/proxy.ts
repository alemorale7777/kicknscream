import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { legacyRedirectPath } from "@/lib/auth/portal";

/**
 * Auth gate + portal redirects.
 * Next 16 uses `proxy.ts` instead of `middleware.ts`.
 *
 * 1. Anything under /t/[slug]/* or /onboarding requires a session — unauthed
 *    users bounce to /auth/signin with the original URL preserved.
 * 2. Legacy /t/[slug]/<segment> paths (dashboard, bookings, schedule, etc.)
 *    308 to /t/[slug]/coach/<segment> so old bookmarks land at the new home.
 * 3. Per-role default-portal landing is NOT done here (proxy has no DB
 *    access). The coach/family/admin layout.tsx files handle that.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isProtected =
    nextUrl.pathname.startsWith("/t/") || nextUrl.pathname.startsWith("/onboarding");

  if (isProtected && !isAuthed) {
    const signin = new URL("/auth/signin", nextUrl.origin);
    signin.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(signin);
  }

  const newPath = legacyRedirectPath(nextUrl.pathname);
  if (newPath) {
    const target = new URL(newPath, nextUrl.origin);
    target.search = nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // run on everything except static assets, API routes, and files with extensions
    "/((?!api|_next/static|_next/image|favicon.ico|brand/.*|.*\\..*).*)",
  ],
};
