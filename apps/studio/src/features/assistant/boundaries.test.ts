import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/*
 * The assistant works on code, never on funds (spec §5). Wallet, deploy and chain
 * access must therefore be unreachable from this feature, and this test makes that a
 * build-time fact instead of a review convention.
 */
const ROOT = resolve(import.meta.dir, "..", "..");
/* `(\.tsx?)?`: the codebase also imports with the extension, e.g. `@/lib/wallet.ts`. */
const FORBIDDEN_SPECIFIERS = [
  /^@signumjs\//,
  /^@\/lib\/wallet(\.tsx?)?(\/|$)/,
  /^@\/hooks\/use-wallet-status(\.tsx?)?(\/|$)/,
  /^@\/stores\/wallet-atoms(\.tsx?)?(\/|$)/,
  /^@\/features\/deployment\/deploy-request(\.tsx?)?(\/|$)/,
];
/* Same targets, as paths under src/, to catch relative imports that resolve to them. */
const FORBIDDEN_PATHS = ["lib/wallet", "hooks/use-wallet-status", "stores/wallet-atoms", "features/deployment/deploy-request"];

function specifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
  for (const m of source.matchAll(re)) out.push(m[1]!);
  return out;
}

function violation(file: string, spec: string): boolean {
  if (FORBIDDEN_SPECIFIERS.some((r) => r.test(spec))) return true;
  if (!spec.startsWith(".")) return false;
  const target = relative(ROOT, resolve(dirname(file), spec)).split("\\").join("/").replace(/\.tsx?$/, "");
  return FORBIDDEN_PATHS.some((p) => target === p || target.startsWith(`${p}/`));
}

describe("assistant feature boundaries", () => {
  it("detects forbidden imports (self-check)", () => {
    const file = join(ROOT, "features/assistant/tools/x.ts");
    expect(violation(file, "@signumjs/core")).toBe(true);
    expect(violation(file, "@/lib/wallet")).toBe(true);
    expect(violation(file, "@/features/deployment/deploy-request")).toBe(true);
    expect(violation(file, "../../../lib/wallet")).toBe(true);
    expect(violation(file, "../../../stores/wallet-atoms")).toBe(true);
    expect(violation(file, "@/lib/wallet.ts")).toBe(true);
    expect(violation(file, "@/lib/wallet.tsx")).toBe(true);
    expect(violation(file, "@/hooks/use-wallet-status.ts")).toBe(true);
    expect(violation(file, "@/stores/wallet-atoms.ts")).toBe(true);
    expect(violation(file, "@/features/deployment/deploy-request.tsx")).toBe(true);
    expect(violation(file, "../../../lib/wallet.ts")).toBe(true);
    expect(violation(file, "../../../stores/wallet-atoms.tsx")).toBe(true);
    expect(violation(file, "@/lib/wallet-format.ts")).toBe(false);
    expect(violation(file, "./errors")).toBe(false);
    expect(violation(file, "@/lib/string")).toBe(false);
    expect(specifiers(`import { a } from "@signumjs/core";\nconst b = await import('@/lib/wallet');`)).toEqual(["@signumjs/core", "@/lib/wallet"]);
  });

  it("no assistant source imports wallet, deploy or chain code", () => {
    const base = join(ROOT, "features/assistant");
    const offenders: string[] = [];
    let count = 0;
    for (const rel of new Bun.Glob("**/*.{ts,tsx}").scanSync(base)) {
      /* This file names the forbidden specifiers on purpose, in its self-check. */
      if (rel === "boundaries.test.ts") continue;
      const file = join(base, rel);
      count++;
      for (const spec of specifiers(readFileSync(file, "utf8"))) {
        if (violation(file, spec)) offenders.push(`${rel}: ${spec}`);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
