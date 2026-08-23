import type * as Monaco from "monaco-editor";
import { transpileAll } from "./transpile";
import { runRequest } from "./runner/run-request";
import type { TestEvent } from "./runner/types";

/**
 * TEMPORARY probe proving Monaco transpiles to runnable CommonJS.
 * Deleted once the UI exists. Call from the browser console: `__probeTranspile()`.
 */
export function installTranspileProbe(monaco: typeof Monaco) {
  (globalThis as any).__probeTranspile = async () => {
    const modules = await transpileAll(monaco, {
      "/probe/scenarios.ts": `export const Answer = 42n;`,
      "/probe/a.test.ts": `
import { describe, it, expect } from "vitest";
import { Answer } from "./scenarios";
describe("probe", () => {
  it("links a relative import and compares bigints", () => {
    expect(Answer).toBe(42n);
  });
});`,
    });

    console.log("EMITTED JS:\n", modules["/probe/a.test.ts"]?.js);
    console.log("HAS SOURCEMAP:", Boolean(modules["/probe/a.test.ts"]?.sourceMap));

    const events: TestEvent[] = [];
    await runRequest(
      { modules, rawFiles: {}, entryPaths: ["/probe/a.test.ts"] },
      (e) => events.push(e),
    );
    console.log("EVENTS:", events);
    return events;
  };
}
