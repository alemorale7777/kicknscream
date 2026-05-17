import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Auth gate for tenant pages and onboarding.
 * Next 16 uses `proxy.ts` instead of `middleware.ts`.
 *
 * Anything under /t/[slug]/* or /onboarding requires a session; unauthed
 * users bounce to /auth/signin with the original URL preserved.
 *
 * Per-role default-portal landing is handled by each portal layout
 * (coach/family/admin) via isPortalAllowed() — proxy has no DB access.
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

  return NextResponse.next();
});

export const config = {
  matcher: [
    // run on everything except static assets, API routes, and files with extensions
    "/((?!api|_next/static|_next/image|favicon.ico|brand/.*|.*\\..*).*)",
  ],
};
