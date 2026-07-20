import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /brief is deliberately NOT gated here (MOO-332): the page renders a value
// explainer + a sample brief for signed-out visitors, and the personal data
// behind it is gated by Convex auth in the components themselves.
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/chat(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect(); // signed-out → redirected to sign-in; admin role check happens in the page
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
