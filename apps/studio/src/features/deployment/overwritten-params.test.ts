import { describe, expect, it } from "bun:test";
import { compileVerbose, findOverwrittenParams } from "./overwritten-params";

const src = (body: string) =>
  `long owner;\nlong fee = 5;\nlong counter;\nlong rate;\n${body}\nvoid main() { counter++; rate = 1; sendAmount(fee, owner); }\n`;

const detect = (source: string, names: string[]) => {
  const v = compileVerbose(source)!;
  return findOverwrittenParams(v.assembly, v.memory, names.map((n) => v.memory.indexOf(n)));
};
const indexOf = (source: string, name: string) => compileVerbose(source)!.memory.indexOf(name);

describe("findOverwrittenParams", () => {
  it("finds a global initialiser", () =>
    expect(detect(src(""), ["fee"])).toEqual([{ index: indexOf(src(""), "fee"), line: 2 }]));

  it("finds an assignment and a conditional assignment in init code", () =>
    expect(detect(src("rate = 7;\nif (counter == 0) { owner = 1; }"), ["rate", "owner"]).map((o) => o.line)).toEqual([5, 6]));

  it("ignores writes inside main and in functions", () =>
    expect(detect(src("") + "void helper() { owner = 2; }\n", ["owner", "rate"])).toEqual([]));

  it("works when the source disables verbose assembly", () => {
    const source = "#pragma verboseAssembly false\n" + src("");
    expect(detect(source, ["fee"])).toEqual([{ index: indexOf(source, "fee"), line: 3 }]);
  });

  it("does not count a const assignment, which is initial data, not code", () =>
    expect(detect(src("const rate = 9;"), ["rate"])).toEqual([]));

  it("returns null for a source that does not compile", () => expect(compileVerbose("long x = ;")).toBeNull());
});

describe("findOverwrittenParams through calls", () => {
  it("follows a function called from top-level code", () => {
    const source = "long owner;\nlong other;\nsetup();\nvoid main(void) { other++; }\nvoid setup(void) { owner = 3; }\n";
    expect(detect(source, ["owner", "other"])).toEqual([{ index: indexOf(source, "owner"), line: 3 }]);
  });

  it("follows nested calls and survives recursion", () => {
    const source =
      "long owner;\nouter();\nvoid main(void) { }\nvoid outer(void) { inner(); }\nvoid inner(void) { if (owner == 0) { inner(); } owner = 1; }\n";
    expect(detect(source, ["owner"])).toEqual([{ index: indexOf(source, "owner"), line: 2 }]);
  });

  it("does not count functions called only from main", () => {
    const source = "long owner;\nvoid main(void) { setup(); }\nvoid setup(void) { owner = 3; }\n";
    expect(detect(source, ["owner"])).toEqual([]);
  });
});
