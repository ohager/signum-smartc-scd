import { describe, it, expect } from "bun:test";
import { enabledApiFunctions, scanApiIncludes } from "./api-includes";

describe("scanApiIncludes", () => {
  it("finds nothing in a plain contract", () => {
    expect(scanApiIncludes("long a;\nvoid main() {}")).toEqual({
      APIFunctions: false,
      fixedAPIFunctions: false,
    });
  });

  it("detects both includes, with or without an explicit value", () => {
    expect(
      scanApiIncludes("#include APIFunctions\n  # include fixedAPIFunctions true"),
    ).toEqual({ APIFunctions: true, fixedAPIFunctions: true });
    expect(scanApiIncludes("#include APIFunctions 1")).toMatchObject({
      APIFunctions: true,
    });
  });

  it("honours an explicit false, and the last line wins like in the compiler", () => {
    expect(scanApiIncludes("#include APIFunctions false")).toMatchObject({
      APIFunctions: false,
    });
    expect(
      scanApiIncludes("#include APIFunctions\n#include APIFunctions 0"),
    ).toMatchObject({ APIFunctions: false });
  });

  it("ignores commented-out includes", () => {
    expect(scanApiIncludes("// #include APIFunctions")).toMatchObject({
      APIFunctions: false,
    });
  });
});

describe("enabledApiFunctions", () => {
  it("returns only the tables the source includes", () => {
    expect(enabledApiFunctions("")).toEqual({});
    const plain = enabledApiFunctions("#include APIFunctions");
    expect(plain.Get_A1).toBeDefined();
    expect(plain.F_Get_A1).toBeUndefined();
    const fixed = enabledApiFunctions("#include fixedAPIFunctions");
    expect(fixed.F_Get_A1).toBeDefined();
    expect(fixed.Get_A1).toBeUndefined();
  });
});
