import { describe, it, expect } from "bun:test";
import { gasReport, PLANCK_PER_STEP } from "./gas-report";

function contract(directive: string) {
  return `
#program name Probe
${directive}
#pragma optimizationLevel 3
#pragma maxAuxVars 3

#define M_A 1
#define M_B 2

long counter;
struct TXINFO { long txId; long sender; long msg[4]; long amount; } cur;

void main() {
    while ((cur.txId = getNextTx()) != 0) {
        cur.sender = getSender(cur.txId);
        readMessage(cur.txId, 0, cur.msg);
        switch (cur.msg[0]) {
            case M_A: handleA(cur.msg[1]); break;
            case M_B: counter = 2; break;
        }
    }
}

void handleA(long n) {
    long i = 0;
    while (i < n) { counter += i; ++i; }
}
`;
}

describe("gasReport", () => {
  it("flags an activation amount below the worst case", () => {
    const r = gasReport(contract("#program activationAmount 1000000"));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.activationAmountPlanck).toBe(1_000_000n);
    expect(r.activationLine).toBe(3);
    expect(r.activationTooLow).toBe(true);
    expect(r.worstCasePlanck).toBe(BigInt(r.worstCaseSteps) * PLANCK_PER_STEP);
    expect(r.worstCase.handler).toBe("handleA");
    expect(r.capHit).toBe(true);
    expect(r.worstCaseComplete).toBe(true);
  });

  it("accepts a sufficient activation amount", () => {
    const r = gasReport(contract("#program activationAmount 1_0000_0000"));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.activationAmountPlanck).toBe(100_000_000n);
    expect(r.activationTooLow).toBe(false);
  });

  it("adds post-loop cost to the worst method", () => {
    const src = `
#program name PostLoop
#program activationAmount 1_0000_0000
#pragma optimizationLevel 3
#pragma maxAuxVars 3
#define M_A 1
long total;
struct TXINFO { long txId; long sender; long msg[4]; long amount; } cur;
void main() {
    while ((cur.txId = getNextTx()) != 0) {
        cur.sender = getSender(cur.txId);
        readMessage(cur.txId, 0, cur.msg);
        switch (cur.msg[0]) { case M_A: total += 1; break; case 2: total += 2; break; }
    }
    setMapValue(1, 1, total);
}
`;
    const r = gasReport(src);
    if (!r.ok) throw new Error(r.error.message);
    const post = r.analysis.postLoop!;
    expect(post.maxSteps).toBeGreaterThan(0);
    const worstMethod = Math.max(...r.analysis.methods.map((m) => m.maxSteps));
    expect(r.worstCaseSteps).toBe(worstMethod + post.maxSteps);
  });

  it("returns the compile error", () => {
    const r = gasReport("void main() { long a = ; }");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.line).toBeGreaterThan(0);
    expect(r.error.message.length).toBeGreaterThan(0);
  });

  it("marks the worst case incomplete without a switch dispatcher", () => {
    const src = `
#program name IfElse
#program activationAmount 1000000
#pragma optimizationLevel 3
#pragma maxAuxVars 3
long total;
struct TXINFO { long txId; long sender; long msg[4]; long amount; } cur;
void main() {
    while ((cur.txId = getNextTx()) != 0) {
        readMessage(cur.txId, 0, cur.msg);
        if (cur.msg[0] == 1) { total += 1; } else { total += 2; }
    }
}
`;
    const r = gasReport(src);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.analysis.methods.length).toBe(0);
    expect(r.worstCaseComplete).toBe(false);
  });
});
