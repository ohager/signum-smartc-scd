/*
 * The relay only talks to a browser tab that is really the Studio: any web page can open
 * a WebSocket to localhost, so the Origin header is the gate. Never add a generic
 * *.vercel.app pattern; anyone can deploy there.
 */
export const STUDIO_ORIGINS: readonly string[] = ["https://smartc-studio.signum-network.dev"];

/** Preview deployments of the Studio project; filled in once the project's preview URL pattern is known. */
export const PREVIEW_ORIGINS: readonly RegExp[] = [];

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowedOrigin(origin: string | undefined, extra: readonly string[] = []): boolean {
  if (!origin) return false;
  return STUDIO_ORIGINS.includes(origin) || PREVIEW_ORIGINS.some((r) => r.test(origin)) || LOCAL.test(origin) || extra.includes(origin);
}
