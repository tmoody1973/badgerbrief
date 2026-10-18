import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /brief is deliberately NOT gated here (MOO-332): the page renders a value
// explainer + a sample brief for signed-out visitors, and the personal data
// behind it is gated by Convex auth in the components themselves.
const isProtectedRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect(); // signed-out → redirected to sign-in; admin role check happens in the page
  }
});

// Only run Clerk where server-side auth is used (src/app/admin, src/app/api).
// On the development instance, running it on public pages sends any cookieless
// browser-style request (incl. Googlebot) on a 307 to Clerk's handshake, which
// answers `x-robots-tag: noindex` — Google dropped every page from search.
// Public pages read auth client-side via <ClerkProvider>, which needs no middleware.
export const config = {
  matcher: ["/admin(.*)", "/(api|trpc)(.*)"],
};
