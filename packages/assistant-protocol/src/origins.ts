/*
 * The relay only talks to a browser tab that is really the Studio: any web page can open
 * a WebSocket to localhost, so the Origin header is the gate. Never add a generic
 * *.vercel.app pattern; anyone can deploy there.
 */
/** The port the relay listens on unless started with --port. */
export const DEFAULT_RELAY_PORT = 6890;

export const STUDIO_ORIGINS: readonly string[] = ["https://smartc-studio.signum-network.dev"];

/** Preview deployments of the Studio project; filled in once the project's preview URL pattern is known. */
export const PREVIEW_ORIGINS: readonly RegExp[] = [];

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/*
 * Localhost origins are off by default. Any local dev server (another project's Vite,
 * a malicious npm script's HTTP server) serves from localhost, so allowing them all
 * would let such a page connect in the Studio's place and, once the user clicks Allow
 * in what looks like the usual dialog, drive the agent's tools. Developing the Studio
 * itself needs them, so the relay opts in with --dev; one explicit extra origin keeps
 * working without it.
 */
export function isAllowedOrigin(origin: string | undefined, extra: readonly string[] = [], opts: { allowLocalhost?: boolean } = {}): boolean {
  if (!origin) return false;
  return (
    STUDIO_ORIGINS.includes(origin) ||
    PREVIEW_ORIGINS.some((r) => r.test(origin)) ||
    (opts.allowLocalhost === true && LOCAL.test(origin)) ||
    extra.includes(origin)
  );
}
