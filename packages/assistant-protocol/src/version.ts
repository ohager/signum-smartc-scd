import { z } from "zod";
import { CATALOG, type ToolDef } from "./catalog";

export const PROTOCOL_VERSION = 1;
export const SUPPORTED_PROTOCOL_VERSIONS = [1];

/* Object keys are sorted recursively so the hash does not depend on declaration order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/*
 * Relay and Studio compare this hash on hello: equal versions with different catalogs
 * would otherwise fail in confusing ways. The snapshot test pins it so a catalog change
 * forces a conscious PROTOCOL_VERSION decision.
 */
export async function catalogHash(catalog: readonly ToolDef[] = CATALOG): Promise<string> {
  const entries = [...catalog]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.input) }));
  const bytes = new TextEncoder().encode(canonical(entries));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
