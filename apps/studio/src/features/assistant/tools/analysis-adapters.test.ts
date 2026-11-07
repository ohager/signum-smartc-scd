import { describe, it, expect } from "bun:test";
import { createAssistantAnalysis } from "./analysis-adapters";
import { AssistantFailure } from "./errors";

function fakeClient(answers: unknown[]) {
  const keys: string[] = [];
  return {
    keys,
    lint: async (key: string): Promise<any> => (keys.push(key), answers.shift() ?? null),
    gas: async (key: string): Promise<any> => (keys.push(key), answers.shift() ?? null),
  };
}

describe("assistant analysis adapters", () => {
  it("gives every request its own key", async () => {
    const c = fakeClient([{ compiled: true, findings: [] }, { compiled: true, findings: [] }]);
    const a = createAssistantAnalysis(c);
    await a.lint("s", []);
    await a.lint("s", []);
    expect(new Set(c.keys).size).toBe(2);
    expect(c.keys.every((k) => k.startsWith("assistant:"))).toBe(true);
  });

  it("retries once after a superseded (null) answer", async () => {
    const c = fakeClient([null, { ok: false, error: { line: 1, column: 1, message: "m" } }]);
    const r = await createAssistantAnalysis(c).gas("s", undefined);
    expect(r).toEqual({ ok: false, error: { line: 1, column: 1, message: "m" } });
    expect(c.keys).toHaveLength(2);
  });

  it("fails with internal when the worker keeps answering null", async () => {
    const c = fakeClient([null, null]);
    try {
      await createAssistantAnalysis(c).lint("s", []);
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AssistantFailure);
      expect((e as AssistantFailure).code).toBe("internal");
    }
  });
});
