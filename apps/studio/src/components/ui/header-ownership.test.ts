import { describe, expect, it } from "bun:test";
import { Glob } from "bun";

/**
 * The header carries identity and the rail. Nothing else.
 *
 * Actions used to be pushed into it from three features through a global atom,
 * which is why its contents depended on which feature mounted last and why the
 * buttons arrived a frame after the page. The machinery is gone; this is what
 * keeps it gone, because the failure mode of its return is quiet — a button
 * that appears late, in a place that does not own it.
 */
const SOURCE = new Glob("**/*.{ts,tsx}");
const ROOT = new URL("../../", import.meta.url).pathname; // apps/studio/src/
const SELF = "components/ui/header-ownership.test.ts";

async function sourcesMentioning(needle: string) {
  const hits: string[] = [];
  for await (const path of SOURCE.scan({ cwd: ROOT })) {
    // This file names all three on purpose, and would otherwise find itself.
    if (path === SELF) continue;
    if ((await Bun.file(ROOT + path).text()).includes(needle)) hits.push(path);
  }
  return hits.sort();
}

describe("page header ownership", () => {
  it("has no header-action store left", async () => {
    expect(await sourcesMentioning("page-header-actions-atoms")).toEqual([]);
  });

  it("is reached by no feature", async () => {
    expect(await sourcesMentioning("usePageHeaderActions")).toEqual([]);
  });

  // The module path rather than the name: prose may still say what this
  // replaced, but nothing may import it.
  it("keeps no second toolbar idiom", async () => {
    expect(await sourcesMentioning("editor-toolbar")).toEqual([]);
  });
});
