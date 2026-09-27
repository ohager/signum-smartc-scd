import { describe, it, expect } from "bun:test";
import { pickContract, type ContractCandidate } from "./contract";

const file = (id: string, name: string, path: string): ContractCandidate => ({
  id,
  name,
  path,
});

describe("pickContract", () => {
  it("finds nothing in a project without a contract", () => {
    expect(pickContract([])).toBeNull();
  });

  it("returns the single contract", () => {
    const only = file("a", "counter.smart.c", "/counter/counter.smart.c");
    expect(pickContract([only])).toEqual({ contract: only, ignored: [] });
  });

  it("prefers the shallowest contract when a workspace breaks the one-per-project rule", () => {
    const deep = file("d", "helper.smart.c", "/proj/lib/helper.smart.c");
    const shallow = file("s", "main.smart.c", "/proj/main.smart.c");
    const picked = pickContract([deep, shallow]);
    expect(picked!.contract).toEqual(shallow);
    expect(picked!.ignored).toEqual([deep]);
  });

  it("breaks a tie on the same depth alphabetically, so the answer never flickers", () => {
    const b = file("b", "b.smart.c", "/proj/b.smart.c");
    const a = file("a", "a.smart.c", "/proj/a.smart.c");
    const picked = pickContract([b, a]);
    expect(picked!.contract).toEqual(a);
    expect(picked!.ignored).toEqual([b]);
  });

  it("matches the suffix regardless of case, as the home page always has", () => {
    // `pickMainFile` lowercased before comparing; the shared predicate keeps
    // that, or adopting it would silently narrow the home page's rule.
    const shouty = file("s", "Counter.SMART.C", "/proj/Counter.SMART.C");
    expect(pickContract([shouty])!.contract).toEqual(shouty);
  });
});
