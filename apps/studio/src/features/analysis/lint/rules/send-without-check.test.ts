import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { sendWithoutCheck } from "./send-without-check";

const run = (source: string) => sendWithoutCheck(buildLintContext(source)).map(({ rule, severity, line }) => ({ rule, severity, line }));

describe("send-without-check", () => {
  test("fires on send-without-check-fires", () => {
    expect(run(fixture("send-without-check-fires"))).toEqual([{ rule: "send-without-check", severity: "warning", line: 8 }]);
  });

  test("stays quiet on send-without-check-quiet", () => {
    expect(run(fixture("send-without-check-quiet"))).toEqual([]);
  });

  test("a comparison of the first argument counts", () => {
    const src = `long bal;\nvoid pay(long amt, long to) {\n  if (amt <= bal) sendAmount(amt, to);\n}`;
    expect(run(src)).toEqual([]);
  });

  test("a check in another function does not count", () => {
    const src = `void a(void) { if (getCurrentBalance() > 5) { } }\nvoid b(long to) {\n  sendBalance(to);\n}`;
    expect(run(src)).toEqual([{ rule: "send-without-check", severity: "warning", line: 3 }]);
  });

  test("a check after the send does not count", () => {
    const src = `void b(long to) {\n  sendBalance(to);\n  if (getCurrentBalance() > 5) { }\n}`;
    expect(run(src)).toHaveLength(1);
  });

  test("a comparison of an unrelated value does not count", () => {
    const src = `long n;\nvoid b(long amt, long to) {\n  if (n < 3) { sendAmount(amt, to); }\n}`;
    expect(run(src)).toHaveLength(1);
  });

  test("ignores sends in comments", () => {
    expect(run(`// sendBalance(x);\nvoid b(void) { }`)).toEqual([]);
  });
});
