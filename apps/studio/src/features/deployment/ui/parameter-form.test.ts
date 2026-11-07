import { describe, expect, it } from "bun:test";
import type { SlotLabel } from "@/features/inspector/model/label-map";
import { parametersReady } from "./parameter-form";

const p = (index: number): SlotLabel => ({ index, name: `p${index}`, format: "long", param: true });

describe("parametersReady", () => {
  it("needs every overwrite confirmed and no field errors", () => {
    const f = [{ slot: p(1), raw: 0n }, { slot: p(2), raw: 0n }];
    expect(parametersReady(f, [{ index: 2, line: 5 }], new Set())).toBe(false);
    expect(parametersReady(f, [{ index: 2, line: 5 }], new Set([2]))).toBe(true);
    expect(parametersReady([{ slot: p(1), raw: 0n, error: "invalid" }], [], new Set())).toBe(false);
  });
});
