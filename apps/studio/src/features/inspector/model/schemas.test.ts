import { describe, expect, it } from "bun:test";
import { labelMapJsonSchema, watchlistJsonSchema } from "./schemas";

describe("JSON Schemas for Monaco", () => {
  it("carries the formats enum and descriptions", () => {
    const text = JSON.stringify(labelMapJsonSchema());
    expect(text).toContain('"fixed"');
    expect(text).toContain("Memory slot index");
    expect(JSON.stringify(watchlistJsonSchema())).toContain("Contract id");
  });
});
