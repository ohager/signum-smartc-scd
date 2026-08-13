import { describe, it, expect } from "bun:test";
import { matchDirectiveContext } from "./directive-context";

describe("matchDirectiveContext", () => {
  it("offers directive names right after '#'", () => {
    expect(matchDirectiveContext("#")).toEqual({
      kind: "directive",
      startColumn: 1,
    });
    expect(matchDirectiveContext("#pro")).toEqual({
      kind: "directive",
      startColumn: 1,
    });
  });

  it("reports the '#' column so the range can overwrite it", () => {
    expect(matchDirectiveContext("  #pra")).toEqual({
      kind: "directive",
      startColumn: 3,
    });
  });

  it("offers properties after '#program' / '#pragma'", () => {
    expect(matchDirectiveContext("#program ")).toEqual({
      kind: "property",
      directive: "program",
    });
    expect(matchDirectiveContext("#program acti")).toEqual({
      kind: "property",
      directive: "program",
    });
    expect(matchDirectiveContext("#pragma max")).toEqual({
      kind: "property",
      directive: "pragma",
    });
    expect(matchDirectiveContext("  # pragma ")).toEqual({
      kind: "property",
      directive: "pragma",
    });
  });

  it("suggests nothing while typing a directive value", () => {
    expect(matchDirectiveContext("#program name ")).toEqual({ kind: "value" });
    expect(matchDirectiveContext("#program name MyContr")).toEqual({
      kind: "value",
    });
    expect(matchDirectiveContext("#pragma maxAuxVars 3")).toEqual({
      kind: "value",
    });
  });

  it("does not treat other directives as program/pragma", () => {
    expect(matchDirectiveContext("#define MAX 10")).toBeNull();
    expect(matchDirectiveContext("#include APIFunctions")).toBeNull();
  });

  it("ignores regular code", () => {
    expect(matchDirectiveContext("long a = getNextTx(")).toBeNull();
    expect(matchDirectiveContext("  acc += n")).toBeNull();
  });
});
