import { describe, it, expect } from "bun:test";
import { scanSymbols, stripCommentsAndStrings } from "./symbol-scanner";

describe("stripCommentsAndStrings", () => {
  it("removes line comments but keeps line count", () => {
    const out = stripCommentsAndStrings("long a; // long b;\nlong c;");
    expect(out.split("\n").length).toBe(2);
    expect(out).not.toContain("long b");
    expect(out).toContain("long a;");
    expect(out).toContain("long c;");
  });

  it("removes string contents", () => {
    const out = stripCommentsAndStrings('long a = "long z;";');
    expect(out).not.toContain("long z");
    expect(out).toContain("long a =");
  });
});

describe("scanSymbols", () => {
  it("extracts multi-declaration variables", () => {
    const s = scanSymbols("long a, b, c;");
    expect(s.variables.map((v) => v.name)).toEqual(["a", "b", "c"]);
    expect(s.variables[0].declaration).toBe("long");
  });

  it("extracts fixed variable with initializer", () => {
    const s = scanSymbols("fixed price = 1.5;");
    expect(s.variables.map((v) => v.name)).toEqual(["price"]);
    expect(s.variables[0].declaration).toBe("fixed");
  });

  it("flags pointers and arrays", () => {
    const s = scanSymbols("long * ptr;\nlong arr[4];");
    const byName = Object.fromEntries(s.variables.map((v) => [v.name, v]));
    expect(byName["ptr"].isPointer).toBe(true);
    expect(byName["arr"].isArray).toBe(true);
  });

  it("extracts const as constant", () => {
    const s = scanSymbols("const long MAX = 10;");
    expect(s.constants.map((c) => c.name)).toEqual(["MAX"]);
    expect(s.variables).toHaveLength(0);
  });

  it("extracts object-like and function-like macros", () => {
    const s = scanSymbols("#define TOKEN 123\n#define ADD(a, b) ((a)+(b))");
    const byName = Object.fromEntries(s.macros.map((m) => [m.name, m]));
    expect(byName["TOKEN"].value).toBe("123");
    expect(byName["TOKEN"].params).toBeUndefined();
    expect(byName["ADD"].params).toEqual(["a", "b"]);
  });

  it("extracts function definitions with params", () => {
    const s = scanSymbols("long doThing(long x, fixed y) {\n  return x;\n}");
    expect(s.functions).toHaveLength(1);
    expect(s.functions[0].name).toBe("doThing");
    expect(s.functions[0].returnType).toBe("long");
    expect(s.functions[0].params).toEqual([
      { type: "long", name: "x" },
      { type: "fixed", name: "y" },
    ]);
  });

  it("extracts struct types with members and struct instances", () => {
    const s = scanSymbols("struct Point {\n  long x;\n  long y;\n};\nstruct Point p;");
    expect(s.structs).toHaveLength(1);
    expect(s.structs[0].name).toBe("Point");
    expect(s.structs[0].members.map((m) => m.name)).toEqual(["x", "y"]);
    const p = s.variables.find((v) => v.name === "p");
    expect(p?.declaration).toBe("struct");
    expect(p?.typeName).toBe("Point");
  });

  it("extracts labels but not case/default", () => {
    const s = scanSymbols("myLabel:\n  goto myLabel;\ncase 1:");
    expect(s.labels.map((l) => l.name)).toEqual(["myLabel"]);
  });

  it("ignores commented-out declarations", () => {
    const s = scanSymbols("// long ghost;\nlong real;");
    expect(s.variables.map((v) => v.name)).toEqual(["real"]);
  });

  it("does not split declarators on commas inside initializers", () => {
    const s = scanSymbols("long a = mdv(1, 2), b;");
    expect(s.variables.map((v) => v.name)).toEqual(["a", "b"]);
  });

  it("extracts multi-line function signatures", () => {
    const s = scanSymbols("long doThing(\n  long x,\n  fixed y\n) {\n  return x;\n}");
    expect(s.functions).toHaveLength(1);
    expect(s.functions[0].name).toBe("doThing");
    expect(s.functions[0].params).toEqual([
      { type: "long", name: "x" },
      { type: "fixed", name: "y" },
    ]);
  });
});
