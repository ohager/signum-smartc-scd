import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { senderCheck } from "./sender-check";

const run = (source: string) => senderCheck(buildLintContext(source)).map(({ rule, severity, line }) => ({ rule, severity, line }));

const HEAD = `long owner, count;
struct TXINFO { long txId, sender, amount, method; } currentTX;
`;

describe("sender-check", () => {
  test("fires on sender-check-fires", () => {
    expect(run(fixture("sender-check-fires"))).toEqual([
      { rule: "sender-check", severity: "warning", line: 7 },
      { rule: "sender-check", severity: "warning", line: 17 },
    ]);
  });

  test("stays quiet on sender-check-quiet", () => {
    expect(run(fixture("sender-check-quiet"))).toEqual([]);
  });

  test("a check inside the handler function counts", () => {
    const src = `${HEAD}
void set(void) {
  if (currentTX.sender != getCreator()) return;
  count = 1;
}
void main(void) {
  while ((currentTX.txId = getNextTx()) != 0) {
    switch (currentTX.method) { case 1: set(); break; default: break; }
  }
}`;
    expect(run(src)).toEqual([]);
  });

  test("a check inside the case body counts", () => {
    const src = `${HEAD}
void main(void) {
  while ((currentTX.txId = getNextTx()) != 0) {
    switch (currentTX.method) {
      case 1:
        if (owner == getSender(currentTX.txId)) count = 1;
        break;
      default: break;
    }
  }
}`;
    expect(run(src)).toEqual([]);
  });

  test("a check against an unrelated variable does not count", () => {
    const src = `${HEAD}
long other;
void main(void) {
  while ((currentTX.txId = getNextTx()) != 0) {
    if (currentTX.sender != other) continue;
    switch (currentTX.method) {
      case 1:
        count = 1;
        break;
      default:
        break;
    }
  }
}`;
    expect(run(src)).toHaveLength(1);
  });

  test("a handler that only reads is not reported", () => {
    const src = `${HEAD}
void main(void) {
  long local;
  while ((currentTX.txId = getNextTx()) != 0) {
    switch (currentTX.method) { case 1: local = count; break; default: break; }
  }
}`;
    expect(run(src)).toEqual([]);
  });

  test("a send through a called helper makes the handler a finding", () => {
    const src = `${HEAD}
void pay(void) { sendBalance(currentTX.sender); }
void relay(void) { pay(); }
void main(void) {
  while ((currentTX.txId = getNextTx()) != 0) {
    switch (currentTX.method) { case 1: relay(); break; default: break; }
  }
}`;
    expect(run(src)).toEqual([{ rule: "sender-check", severity: "warning", line: 5 }]);
  });

  test("does not run without assembly", () => {
    expect(senderCheck({ ...buildLintContext("long x;"), verbose: null })).toEqual([]);
  });
});
