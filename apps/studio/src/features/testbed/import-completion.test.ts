import { describe, expect, it } from "bun:test";
import { importSpecifierAt } from "./import-completion";

describe("importSpecifierAt", () => {
  it("named import", () => expect(importSpecifierAt('import { a } from "./li')).toBe("./li"));
  it("default import with single quotes", () => expect(importSpecifierAt("import C from '../")).toBe("../"));
  it("side-effect import", () => expect(importSpecifierAt('import "./')).toBe("./"));
  it("type import", () => expect(importSpecifierAt('import type { T } from "../t')).toBe("../t"));
  it("re-export", () => expect(importSpecifierAt('export { x } from "./')).toBe("./"));
  it("empty specifier", () => expect(importSpecifierAt('import {} from "')).toBe(""));
  it("ordinary string", () => expect(importSpecifierAt('const s = "./foo')).toBeNull());
  it("string in an export declaration", () => expect(importSpecifierAt('export const s = "./foo')).toBeNull());
  it("after the closing quote", () => expect(importSpecifierAt('import { a } from "./lib"; ')).toBeNull());
});
