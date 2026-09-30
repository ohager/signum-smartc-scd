import { describe, expect, it } from "bun:test";
import path from "path";
import en from "./locales/en";
import { generateKeyTypes } from "../../scripts/i18n-types";

describe("generated key types", () => {
  it("are up to date with the English messages (run `bun run i18n:types`)", async () => {
    const file = path.join(import.meta.dir, "keys.generated.ts");
    expect(await Bun.file(file).text()).toBe(generateKeyTypes(en));
  });

  it("type plain, parameterised and plural leaves", () => {
    const out = generateKeyTypes({
      a: { plain: "Save", named: "Hello {name}", n: { one: "{count} x", other: "{count} xs in {dir}" } },
    });
    expect(out).toContain(`"a.plain": undefined;`);
    expect(out).toContain(`"a.named": { name: string | number };`);
    expect(out).toContain(`"a.n": { count: number; dir: string | number };`);
  });
});
