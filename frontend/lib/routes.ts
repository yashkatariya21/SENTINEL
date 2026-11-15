/**
 * Which pages belong to the public brief and which belong to the desk.
 *
 * One list, three readers: the auth gate decides whether to ask for a session, the
 * API client decides whether a 401 should throw somebody out of the page they are
 * reading, and the shell decides whether to draw the desk chrome at all. Keeping it
 * in one module stops those three drifting apart — they already had, which is how a
 * stale token could bounce a visitor off the front door.
 */

/** The pages anyone may read, with no session. */
export const PUBLIC_ROUTES = ["/", "/login", "/welcome", "/about", "/trust"];

/** Where the desk starts once you are in. */
export const DESK_HOME = "/desk";

/**
 * Exact for the root, a prefix for everything else.
 *
 * `"/".startsWith("/")` is true for every path in the application, so a naive prefix
 * test for the root would treat the entire desk as public and switch the gate off.
 */
export function isPublicRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return PUBLIC_ROUTES.some(
    (route) => route !== "/" && (pathname === route || pathname.startsWith(`${route}/`)),
  );
}
