# SC-Simulator + Step-Debugger — Implementation Plan (Plan 1: Walking Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full debug pipeline end-to-end in the browser: open a `.smart.c`, compile it for debug, load it into the embedded SC-Simulator, run a scenario, single-step, and see the current SmartC source line highlighted with live variable values.

**Architecture:** All UI/logic depends only on a typed `SimulatorEngine` interface (the isolation seam); a real SC-Simulator adapter and a deterministic fake both implement it. A pure `source-map` maps assembly↔source lines; a pure `scenario-io` handles the `.scenario.json` model; a `DebugController` orchestrates compile→load→run→step and is unit-tested against the fake engine.

**Tech Stack:** TypeScript, React 19, `@monaco-editor/react`, `monaco-editor`, `smartc-signum-compiler` v2.3.0, deleterium's SC-Simulator (embedded), jotai, Bun (`bun test`, `bun run build`).

**Spec:** `docs/superpowers/specs/2026-08-08-sc-simulator-debugger-design.md`

**Out of scope for Plan 1 (→ Plan 2):** breakpoints + `continue`, assembly view + source/asm toggle, full Inspector (registers/watch/call-stack/breakpoints tabs), bottom dock (console/emitted-txs/balance tabs), the full scenario **form** editor. Plan 1 loads a sibling `<contract>.scenario.json` (or a built-in default) and shows a minimal Variables list + current-line highlight + run/step/reset toolbar.

---

## File Structure (Plan 1)

```
apps/studio/src/features/simulator/
  engine/
    engine.types.ts        EngineState, DebugState, SimulatorEngine, LoadedContract, EmittedTx, DebugStatus
    fake-engine.ts         FakeEngine implements SimulatorEngine (deterministic, for tests/UI)  (+ .test.ts)
    simulator-engine.ts    ScSimulatorEngine adapter (SPIKE-INFORMED)                            (+ .test.ts integration)
  scenario/
    scenario.types.ts      ScenarioFile, TimelineEntry
    scenario-io.ts         parseScenario / serializeScenario / validateScenario / defaultScenario (+ .test.ts)
  source-map.ts            SourceMap, buildSourceMap, resolveSourceLine (SPIKE-INFORMED fixture)  (+ .test.ts)
  compile-for-debug.ts     compileForDebug(source) → { machineCode, assembly, sourceMap }         (SPIKE-INFORMED)
  debug-controller.ts      DebugController: start/step/stepOver/reset over an engine + source map (+ .test.ts)
  ui/
    debug-toolbar.tsx      run / step / reset + status badge
    variables-panel.tsx    minimal name→value table
    use-debug-decorations.ts  current-line Monaco decoration
    debug-view.tsx         composes toolbar + editor + variables; owns the DebugController lifecycle
docs/superpowers/notes/
  sc-simulator-api.md      Spike findings (NOT product code)
```

**Testability:** `scenario-io`, `source-map`, `debug-controller`, `fake-engine` are pure/DOM-free → `bun test`. The real engine adapter gets a node-capable integration test. UI = `bun run build` + manual smoke.

**Test/build convention:** from repo root — `bun test <path>`; `cd apps/studio && bun run build`. Tests use `bun:test`.

---

## Slice 1 — Spike: learn SC-Simulator's API (throwaway)

Resolves the only real unknowns. Deliverable is a findings doc, not product code.

### Task 1.1: Study deleterium's SC-Simulator, decide sourcing, drive it once (throwaway)

**Facts** (repo `https://github.com/deleterium/SC-Simulator`, default branch `main`, **BSD-3-Clause**):
- The only external **package** is the compiler (`smartc-signum-compiler`, already a dep). The **simulator** is deleterium's own app: TypeScript engine under `src/` (constants in `src/index.ts`), interactive UI in `try.html` / `try.js`. Build/run: `npm ci && npm run build && npm run start`.
- There is a **packageable build of the simulator class** (`tsconfig.pkg.json`, `esbuild.pkg.config.js`, `npm run pack:pkg` / `publish:pkg`) intended for headless Jest/Vitest use — the owner's `signum-smartc-testbed` likely already drives this.
- The engine **runs assembly, not bytecode** ("cannot directly interpret bytecode") → we feed it `getAssemblyCode()`, and it steps **assembly lines** (matches our source-map granularity, 1 hop).
- It takes **transactions as JSON**, runs contracts in **block order**, supports **breakpoints + memory inspection**, and tracks contract **status** (running / frozen / dead / …).

**Files:**
- Create: `docs/superpowers/notes/sc-simulator-api.md`
- Possibly create (if the decision is to vendor): `apps/studio/src/features/simulator/vendor/sc-simulator/**` (BSD-3, headers retained + a `NOTICE`).
- Scratch (do NOT commit): a throwaway script/HTML under `apps/studio/scratch/`.

- [ ] **Step 1: Decide how we source the engine — investigate both tracks, record the decision + rationale in the notes:**
  - **(a) Depend on the packaged simulator class.** Check whether `pack:pkg`/`publish:pkg` is published and under what name, and **`grep` `signum-smartc-testbed`'s `package.json`** for the simulator dependency it already uses (the owner drives this sim in their testbed). If a maintained package exposes load/step/inspect, prefer depending on it for the **core engine** (least maintenance).
  - **(b) Vendor the engine + driving code (BSD-3).** If no consumable package covers the interactive parts, copy the needed `src/` engine modules and the relevant `try.js` driving logic into `apps/studio/src/features/simulator/vendor/sc-simulator/`, **retaining the BSD-3 copyright header on every file** and adding a `NOTICE` crediting deleterium. Use `try.js` as the reference for how stepping / breakpoints / memory-inspection are invoked.

- [ ] **Step 2: Scratch proof.** Compile a known contract to **assembly** and drive the engine (packaged or vendored): load the assembly, apply a tiny transactions-JSON scenario, step one instruction, read state.
  ```ts
  import { SmartC } from "smartc-signum-compiler";
  const src = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";
  const c = new SmartC({ language: "C", sourceCode: src }); c.compile();
  const assembly = c.getAssemblyCode();   // ← the engine consumes THIS (NOT ByteCode)
  // ...construct the simulator, load `assembly`, feed a transactions JSON, step(), read state...
  ```

- [ ] **Step 3: Write findings** to the notes doc, explicitly:
  - Sourcing decision (package name, or vendored file list + attribution).
  - How to construct/init the simulator; the **transactions-JSON scenario shape** (informs `scenario-io`'s translation).
  - `load(assembly)`, single-step, run-to-breakpoint, reset call shapes.
  - State accessors → current **assembly line**, **memory** (by variable name — cross-reference `getMachineCode().Memory` names — or by address, and how to map name→address), **registers**, **balance**, **emitted transactions**, **status**, **step count**. Confirm current position is an **assembly line** (expected).

- [ ] **Step 4: Capture a verbose-assembly sample.** Compile with verbose enabled (confirm the mechanism — likely `#pragma verboseAssembly true` as the first line) and paste the resulting assembly (with source-line comments) into the notes, noting the exact comment syntax (feeds Slice 3's fixture).

- [ ] **Step 5: Commit** the notes doc (and, if vendoring, the `vendor/sc-simulator/**` files with BSD-3 headers + `NOTICE`).
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add docs/superpowers/notes/sc-simulator-api.md
# if vendored: git add apps/studio/src/features/simulator/vendor
git commit -m "docs(sim): SC-Simulator spike findings + engine sourcing decision (BSD-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Escalate (BLOCKED)** if neither a consumable package nor a vendorable engine can be driven headlessly or in-browser — the design's "embed engine, own UI" decision would need revisiting. Do not proceed to Slice 4 without a documented load/step/state API in the notes.

---

## Slice 2 — Engine interface, fake engine, scenario model (all pure, fully coded now)

### Task 2.1: Engine types

**Files:**
- Create: `apps/studio/src/features/simulator/engine/engine.types.ts`

- [ ] **Step 1: Implement**
```ts
export type DebugStatus = "ready" | "running" | "halted" | "finished" | "error";

export interface EmittedTx {
  recipient: string;
  amount: string; // NQT as string to preserve 64-bit precision
  message?: string;
}

/** State as reported by the engine adapter (no source-line resolution). */
export interface EngineState {
  currentAsmLine: number; // 0-based index into the assembly listing
  memory: Record<string, string>; // variable name -> value
  registers: Record<string, string>;
  balance: string; // contract balance (NQT) as string
  emittedTx: EmittedTx[];
  status: DebugStatus;
  steps: number;
}

/** Engine state enriched by the controller with the resolved source line. */
export interface DebugState extends EngineState {
  currentSourceLine: number | null; // 1-based; null if the asm line has no mapping
}

export interface LoadedContract {
  assembly: string; // AssemblyCode text — the engine runs ASSEMBLY, not bytecode
}

import type { ScenarioFile } from "../scenario/scenario.types";

export interface SimulatorEngine {
  load(contract: LoadedContract): void;
  applyScenario(scenario: ScenarioFile): void;
  step(): EngineState;
  stepOver(): EngineState;
  reset(): EngineState;
  getState(): EngineState;
}
```

### Task 2.2: Scenario types

**Files:**
- Create: `apps/studio/src/features/simulator/scenario/scenario.types.ts`

- [ ] **Step 1: Implement**
```ts
export type TimelineEntry =
  | { type: "tx"; sender: string; amount: string; message?: string }
  | { type: "blocks"; count: number };

export interface ScenarioFile {
  version: 1;
  contract: { creator: string; activationAmount: string };
  accounts: { id: string; balance: string }[];
  timeline: TimelineEntry[];
}
```

### Task 2.3: Scenario IO — test first

**Files:**
- Create: `apps/studio/src/features/simulator/scenario/scenario-io.test.ts`

- [ ] **Step 1: Write failing test**
```ts
import { describe, it, expect } from "bun:test";
import {
  parseScenario,
  serializeScenario,
  validateScenario,
  defaultScenario,
} from "./scenario-io";

describe("scenario-io", () => {
  it("defaultScenario is valid and round-trips", () => {
    const s = defaultScenario();
    const round = parseScenario(serializeScenario(s));
    expect(round).toEqual(s);
  });

  it("validateScenario accepts a good scenario", () => {
    const r = validateScenario(defaultScenario());
    expect(r.valid).toBe(true);
  });

  it("validateScenario reports errors for a bad scenario", () => {
    const r = validateScenario({ version: 1, timeline: "nope" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.length).toBeGreaterThan(0);
  });

  it("parseScenario throws on invalid JSON", () => {
    expect(() => parseScenario("{ not json")).toThrow();
  });

  it("parseScenario throws on structurally invalid scenario", () => {
    expect(() => parseScenario(JSON.stringify({ version: 2 }))).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing)
Run: `bun test apps/studio/src/features/simulator/scenario/scenario-io.test.ts`
Expected: FAIL "Cannot find module './scenario-io'".

### Task 2.4: Scenario IO — implement

**Files:**
- Create: `apps/studio/src/features/simulator/scenario/scenario-io.ts`

- [ ] **Step 1: Implement**
```ts
import type { ScenarioFile, TimelineEntry } from "./scenario.types";

export function defaultScenario(): ScenarioFile {
  return {
    version: 1,
    contract: { creator: "S-ALIC-E000-0000-00000", activationAmount: "1_0000_0000" },
    accounts: [{ id: "alice", balance: "100_0000_0000" }],
    timeline: [{ type: "tx", sender: "alice", amount: "5_0000_0000" }],
  };
}

export type ValidationResult =
  | { valid: true; scenario: ScenarioFile }
  | { valid: false; errors: string[] };

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function validateScenario(value: unknown): ValidationResult {
  const errors: string[] = [];
  const v = value as any;
  if (!v || typeof v !== "object") return { valid: false, errors: ["not an object"] };
  if (v.version !== 1) errors.push("version must be 1");
  if (!v.contract || !isString(v.contract.creator) || !isString(v.contract.activationAmount))
    errors.push("contract.creator and contract.activationAmount are required strings");
  if (!Array.isArray(v.accounts)) errors.push("accounts must be an array");
  else
    v.accounts.forEach((a: any, i: number) => {
      if (!isString(a?.id) || !isString(a?.balance)) errors.push(`accounts[${i}] needs string id and balance`);
    });
  if (!Array.isArray(v.timeline)) errors.push("timeline must be an array");
  else
    v.timeline.forEach((e: any, i: number) => {
      if (e?.type === "tx") {
        if (!isString(e.sender) || !isString(e.amount)) errors.push(`timeline[${i}] tx needs string sender and amount`);
      } else if (e?.type === "blocks") {
        if (typeof e.count !== "number" || e.count < 1) errors.push(`timeline[${i}] blocks needs count >= 1`);
      } else {
        errors.push(`timeline[${i}] has unknown type`);
      }
    });
  if (errors.length) return { valid: false, errors };
  return { valid: true, scenario: value as ScenarioFile };
}

export function parseScenario(json: string): ScenarioFile {
  const parsed = JSON.parse(json); // throws on bad JSON
  const result = validateScenario(parsed);
  if (!result.valid) throw new Error("Invalid scenario: " + result.errors.join("; "));
  return result.scenario;
}

export function serializeScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, 2);
}
```

- [ ] **Step 2: Run — expect PASS**
Run: `bun test apps/studio/src/features/simulator/scenario/scenario-io.test.ts`
Expected: PASS (5 tests).

### Task 2.5: Fake engine — test first

**Files:**
- Create: `apps/studio/src/features/simulator/engine/fake-engine.test.ts`

- [ ] **Step 1: Write failing test**
```ts
import { describe, it, expect } from "bun:test";
import { FakeEngine } from "./fake-engine";
import { defaultScenario } from "../scenario/scenario-io";

describe("FakeEngine", () => {
  it("advances step count and asm line on step()", () => {
    const e = new FakeEngine();
    e.load({ assembly: "line0\nline1\nline2" });
    e.applyScenario(defaultScenario());
    const s1 = e.step();
    expect(s1.steps).toBe(1);
    expect(s1.currentAsmLine).toBe(1);
    const s2 = e.step();
    expect(s2.steps).toBe(2);
    expect(s2.currentAsmLine).toBe(2);
  });

  it("reset returns to the initial state", () => {
    const e = new FakeEngine();
    e.load({ assembly: "a\nb" });
    e.applyScenario(defaultScenario());
    e.step();
    const r = e.reset();
    expect(r.steps).toBe(0);
    expect(r.currentAsmLine).toBe(0);
    expect(r.status).toBe("ready");
  });

  it("finishes at the last asm line", () => {
    const e = new FakeEngine();
    e.load({ assembly: "a\nb" });
    e.applyScenario(defaultScenario());
    e.step(); // line 1
    const last = e.step(); // clamp at last, finished
    expect(last.status).toBe("finished");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `bun test apps/studio/src/features/simulator/engine/fake-engine.test.ts`
Expected: FAIL "Cannot find module './fake-engine'".

### Task 2.6: Fake engine — implement

**Files:**
- Create: `apps/studio/src/features/simulator/engine/fake-engine.ts`

- [ ] **Step 1: Implement**
```ts
import type { EngineState, LoadedContract, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";

/** Deterministic in-memory engine for testing the controller and UI without SC-Simulator. */
export class FakeEngine implements SimulatorEngine {
  private lineCount = 0;
  private line = 0;
  private steps = 0;
  private finished = false;

  load(contract: LoadedContract): void {
    this.lineCount = contract.assembly.split("\n").length;
    this.reset();
  }
  applyScenario(_scenario: ScenarioFile): void {
    this.reset();
  }
  step(): EngineState {
    if (this.line < this.lineCount - 1) {
      this.line++;
      this.steps++;
    } else {
      this.finished = true;
    }
    return this.getState();
  }
  stepOver(): EngineState {
    return this.step();
  }
  reset(): EngineState {
    this.line = 0;
    this.steps = 0;
    this.finished = false;
    return this.getState();
  }
  getState(): EngineState {
    return {
      currentAsmLine: this.line,
      memory: { n: String(this.steps), acc: String(this.steps + 1) },
      registers: { r0: "0" },
      balance: "100_0000_0000",
      emittedTx: [],
      status: this.finished ? "finished" : this.steps === 0 ? "ready" : "running",
      steps: this.steps,
    };
  }
}
```

- [ ] **Step 2: Run — expect PASS**
Run: `bun test apps/studio/src/features/simulator/engine/fake-engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit Slice 2**
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/engine apps/studio/src/features/simulator/scenario
git commit -m "feat(sim): engine interface, deterministic fake engine, scenario model + IO

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 3 — Source map (SPIKE-INFORMED fixture)

### Task 3.1: Source map — test first

**Files:**
- Create: `apps/studio/src/features/simulator/source-map.test.ts`

- [ ] **Step 1: Write failing test.** Replace the `VERBOSE_ASM` fixture string below with the **real captured snippet from `docs/superpowers/notes/sc-simulator-api.md`** (Slice 1). The assertions check that assembly lines carrying a source-line comment map to that source line, and that `resolveSourceLine` returns null for unmapped lines. Adjust the expected line numbers to match the captured snippet.
```ts
import { describe, it, expect } from "bun:test";
import { buildSourceMap, resolveSourceLine } from "./source-map";

// NOTE: replace with the real verbose-assembly sample captured in the spike notes.
const VERBOSE_ASM = [
  "^comment line 1 long n, acc;",
  "SET @n #0000000000000003",
  "^comment line 2 acc = n + 1;",
  "SET @acc $n",
  "ADD @acc #0000000000000001",
].join("\n");

describe("source-map", () => {
  it("maps assembly lines to their source line", () => {
    // injectedLineOffset = 0 for this fixture (no pragma injected)
    const map = buildSourceMap(VERBOSE_ASM, 0);
    // asm line 1 ("SET @n ...") belongs to source line 1
    expect(resolveSourceLine(map, 1)).toBe(1);
    // asm line 3 ("SET @acc $n") belongs to source line 2
    expect(resolveSourceLine(map, 3)).toBe(2);
  });

  it("returns null for an unmapped asm line", () => {
    const map = buildSourceMap(VERBOSE_ASM, 0);
    expect(resolveSourceLine(map, 999)).toBeNull();
  });

  it("subtracts the injected-line offset so highlights land on user lines", () => {
    const map = buildSourceMap(VERBOSE_ASM, 1); // pragma injected as line 1 => shift down by 1
    expect(resolveSourceLine(map, 1)).toBe(0); // (1 - 1); user line numbering compensated
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `bun test apps/studio/src/features/simulator/source-map.test.ts`
Expected: FAIL "Cannot find module './source-map'".

### Task 3.2: Source map — implement

**Files:**
- Create: `apps/studio/src/features/simulator/source-map.ts`

- [ ] **Step 1: Implement.** The comment-detection regex below assumes SmartC verbose comments of the form `^comment line <N> ...`. **Confirm/adjust the regex against the captured spike sample** — if the real syntax differs (e.g. `; line N`), change ONLY the `LINE_COMMENT` regex; the algorithm stays.
```ts
export interface SourceMap {
  asmToSource: Map<number, number>; // asmLine(0-based) -> sourceLine(1-based, offset-compensated)
}

const LINE_COMMENT = /^\^comment line (\d+)\b/;

/**
 * Builds an asm-line -> source-line map from verbose assembly.
 * A source-line comment applies to the assembly lines that follow it until the next comment.
 * `injectedLineOffset` is subtracted so that a `#pragma` we injected for verbose output does
 * not shift the reported source lines off the user's real lines.
 */
export function buildSourceMap(verboseAssembly: string, injectedLineOffset: number): SourceMap {
  const asmToSource = new Map<number, number>();
  const lines = verboseAssembly.split("\n");
  let currentSource: number | null = null;
  lines.forEach((line, asmLine) => {
    const m = LINE_COMMENT.exec(line.trim());
    if (m) {
      currentSource = parseInt(m[1], 10) - injectedLineOffset;
      return; // the comment line itself maps to nothing
    }
    if (currentSource !== null) asmToSource.set(asmLine, currentSource);
  });
  return { asmToSource };
}

export function resolveSourceLine(map: SourceMap, asmLine: number): number | null {
  return map.asmToSource.has(asmLine) ? map.asmToSource.get(asmLine)! : null;
}
```

- [ ] **Step 2: Run — expect PASS** (after aligning the fixture + regex with the spike sample)
Run: `bun test apps/studio/src/features/simulator/source-map.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/source-map.ts apps/studio/src/features/simulator/source-map.test.ts
git commit -m "feat(sim): assembly<->source line map from verbose assembly

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 4 — compile-for-debug + real engine adapter (SPIKE-INFORMED)

### Task 4.1: compile-for-debug

**Files:**
- Create: `apps/studio/src/features/simulator/compile-for-debug.ts`
- Create: `apps/studio/src/features/simulator/compile-for-debug.test.ts`

- [ ] **Step 1: Write test first**
```ts
import { describe, it, expect } from "bun:test";
import { compileForDebug } from "./compile-for-debug";

describe("compileForDebug", () => {
  it("returns machineCode, assembly and a source map for valid source", () => {
    const r = compileForDebug("#pragma maxAuxVars 2\nlong n;\nvoid main() { n = 1; }");
    expect(typeof r.machineCode).toBe("string");
    expect(r.assembly.length).toBeGreaterThan(0);
    expect(r.sourceMap.asmToSource.size).toBeGreaterThan(0);
  });

  it("throws on a contract that does not compile", () => {
    expect(() => compileForDebug("long ;;; broken")).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `bun test apps/studio/src/features/simulator/compile-for-debug.test.ts`
Expected: FAIL "Cannot find module './compile-for-debug'".

- [ ] **Step 3: Implement.** Enable verbose assembly per the spike notes. The version below injects `#pragma verboseAssembly true` as a first line if absent and passes `injectedLineOffset` accordingly. **Adjust the pragma text / enabling mechanism to what the spike confirmed.**
```ts
import { SmartC } from "smartc-signum-compiler";
import { buildSourceMap, type SourceMap } from "./source-map";

export interface DebugCompilation {
  machineCode: string;
  assembly: string;
  sourceMap: SourceMap;
}

const VERBOSE_PRAGMA = "#pragma verboseAssembly true";

export function compileForDebug(source: string): DebugCompilation {
  const hasVerbose = /#pragma\s+verboseAssembly/.test(source);
  const injectedLineOffset = hasVerbose ? 0 : 1;
  const effectiveSource = hasVerbose ? source : `${VERBOSE_PRAGMA}\n${source}`;

  const compiler = new SmartC({ language: "C", sourceCode: effectiveSource });
  compiler.compile(); // throws on error
  const mc = compiler.getMachineCode();

  return {
    machineCode: mc.ByteCode,
    assembly: mc.AssemblyCode,
    sourceMap: buildSourceMap(mc.AssemblyCode, injectedLineOffset),
  };
}
```

- [ ] **Step 4: Run — expect PASS** (adjust if `getMachineCode()` field names differ — confirmed real via `contractTypes.d.ts`: `ByteCode`, `AssemblyCode`)
Run: `bun test apps/studio/src/features/simulator/compile-for-debug.test.ts`
Expected: PASS.

### Task 4.2: Real SC-Simulator adapter

**Files:**
- Create: `apps/studio/src/features/simulator/engine/simulator-engine.ts`
- Create: `apps/studio/src/features/simulator/engine/simulator-engine.test.ts`

- [ ] **Step 1: Implement `ScSimulatorEngine implements SimulatorEngine`** using the load/step/reset/state API recorded in `docs/superpowers/notes/sc-simulator-api.md`. It MUST satisfy the exact `SimulatorEngine` interface from `engine.types.ts` (so it is drop-in interchangeable with `FakeEngine`). Structure:
```ts
import type { EngineState, LoadedContract, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
// import { <sim modules> } from "<path from spike notes>";

export class ScSimulatorEngine implements SimulatorEngine {
  // hold the sim instance + loaded program + translated scenario
  load(contract: LoadedContract): void { /* load contract.assembly (assembly, NOT bytecode) per notes */ }
  applyScenario(scenario: ScenarioFile): void { /* translate ScenarioFile -> sim setup per notes */ }
  step(): EngineState { /* advance one instruction; return readState() */ }
  stepOver(): EngineState { /* if the sim lacks step-over, alias to step(); note it */ }
  reset(): EngineState { /* reset sim to loaded state */ }
  getState(): EngineState { return this.readState(); }
  // private readState(): EngineState  — map sim state to EngineState:
  //   currentAsmLine, memory (use mc.Memory names -> values), registers, balance, emittedTx, status, steps
}
```
Map the simulator's memory to `EngineState.memory` keyed by **variable name** (use the compiled `Memory` name list if the sim exposes values by address). If the sim cannot provide a datum (e.g. emitted txs), return an empty/default and note it as a Plan-2 gap in the notes doc — do NOT fabricate.

- [ ] **Step 2: Write an integration test** with concrete, engine-agnostic behavioral assertions (do not hardcode internals):
```ts
import { describe, it, expect } from "bun:test";
import { ScSimulatorEngine } from "./simulator-engine";
import { compileForDebug } from "../compile-for-debug";
import { defaultScenario } from "../scenario/scenario-io";

describe("ScSimulatorEngine (integration)", () => {
  it("loads a compiled contract, steps, and reports advancing state", () => {
    const { assembly } = compileForDebug(
      "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }",
    );
    const e = new ScSimulatorEngine();
    e.load({ assembly });
    e.applyScenario(defaultScenario());
    const before = e.getState();
    const after = e.step();
    expect(after.steps).toBeGreaterThan(before.steps);
    expect(typeof after.currentAsmLine).toBe("number");
  });

  it("eventually reaches a terminal status when stepping to the end", () => {
    const { assembly } = compileForDebug(
      "#pragma maxAuxVars 2\nlong n;\nvoid main() { n = 1; }",
    );
    const e = new ScSimulatorEngine();
    e.load({ assembly });
    e.applyScenario(defaultScenario());
    let s = e.getState();
    for (let i = 0; i < 1000 && s.status !== "finished" && s.status !== "halted"; i++) s = e.step();
    expect(["finished", "halted"]).toContain(s.status);
  });
});
```

- [ ] **Step 3: Run tests**
Run: `bun test apps/studio/src/features/simulator/engine/simulator-engine.test.ts`
Expected: PASS. If the sim needs browser-only globals and can't run under `bun test`, mark the test `it.skip` with a comment explaining, verify manually in the browser during Slice 6 instead, and report this as DONE_WITH_CONCERNS.

- [ ] **Step 4: Commit Slice 4**
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/compile-for-debug.ts apps/studio/src/features/simulator/compile-for-debug.test.ts apps/studio/src/features/simulator/engine/simulator-engine.ts apps/studio/src/features/simulator/engine/simulator-engine.test.ts
git commit -m "feat(sim): compile-for-debug + SC-Simulator engine adapter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 5 — Debug controller + jotai store

### Task 5.1: DebugController — test first (with FakeEngine)

**Files:**
- Create: `apps/studio/src/features/simulator/debug-controller.test.ts`

- [ ] **Step 1: Write failing test**
```ts
import { describe, it, expect } from "bun:test";
import { DebugController } from "./debug-controller";
import { FakeEngine } from "./engine/fake-engine";
import { buildSourceMap } from "./source-map";
import { defaultScenario } from "./scenario/scenario-io";

const asm = "^comment line 1 x\nSET @n #1\nSET @acc #2";

describe("DebugController", () => {
  it("starts paused at entry with a resolved source line and memory", () => {
    const c = new DebugController(new FakeEngine());
    const state = c.start(
      { machineCode: "00", assembly: asm, sourceMap: buildSourceMap(asm, 0) },
      defaultScenario(),
    );
    expect(state.steps).toBe(0);
    expect(state.currentSourceLine === null || typeof state.currentSourceLine === "number").toBe(true);
    expect(Object.keys(state.memory).length).toBeGreaterThan(0);
  });

  it("step advances and re-resolves the source line", () => {
    const c = new DebugController(new FakeEngine());
    c.start({ machineCode: "00", assembly: asm, sourceMap: buildSourceMap(asm, 0) }, defaultScenario());
    const s = c.step();
    expect(s.steps).toBe(1);
    expect(s.currentSourceLine).toBe(1); // asm line 1 -> source line 1
  });

  it("reset returns to step 0", () => {
    const c = new DebugController(new FakeEngine());
    c.start({ machineCode: "00", assembly: asm, sourceMap: buildSourceMap(asm, 0) }, defaultScenario());
    c.step();
    expect(c.reset().steps).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `bun test apps/studio/src/features/simulator/debug-controller.test.ts`
Expected: FAIL "Cannot find module './debug-controller'".

### Task 5.2: DebugController — implement

**Files:**
- Create: `apps/studio/src/features/simulator/debug-controller.ts`

- [ ] **Step 1: Implement**
```ts
import type { SimulatorEngine, EngineState, DebugState } from "./engine/engine.types";
import type { ScenarioFile } from "./scenario/scenario.types";
import { resolveSourceLine, type SourceMap } from "./source-map";

export interface DebugProgram {
  machineCode: string;
  assembly: string;
  sourceMap: SourceMap;
}

export class DebugController {
  private sourceMap: SourceMap | null = null;
  constructor(private engine: SimulatorEngine) {}

  private enrich(s: EngineState): DebugState {
    const currentSourceLine = this.sourceMap ? resolveSourceLine(this.sourceMap, s.currentAsmLine) : null;
    return { ...s, currentSourceLine };
  }

  start(program: DebugProgram, scenario: ScenarioFile): DebugState {
    this.sourceMap = program.sourceMap;
    this.engine.load({ assembly: program.assembly });
    this.engine.applyScenario(scenario);
    return this.enrich(this.engine.getState());
  }
  step(): DebugState {
    return this.enrich(this.engine.step());
  }
  stepOver(): DebugState {
    return this.enrich(this.engine.stepOver());
  }
  reset(): DebugState {
    return this.enrich(this.engine.reset());
  }
}
```

- [ ] **Step 2: Run — expect PASS**
Run: `bun test apps/studio/src/features/simulator/debug-controller.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Build check**
Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`.

- [ ] **Step 4: Commit Slice 5**
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/debug-controller.ts apps/studio/src/features/simulator/debug-controller.test.ts
git commit -m "feat(sim): debug controller (source-line enrichment over the engine seam)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

*(No jotai store in Plan 1 — `DebugView` owns its `DebugController` directly. A shared store lands in Plan 2 when the toolbar/inspector/dock become separate components.)*

---

## Slice 6 — Minimal end-to-end debug UI

Delivers the walking skeleton: a **Debug** action on a `.smart.c` file opens a debug view with a run/step/reset toolbar, current-line highlight in the editor, and a variables list. Scenario = a sibling `<name>.scenario.json` if present, else `defaultScenario()`.

### Task 6.1: Debug toolbar

**Files:**
- Create: `apps/studio/src/features/simulator/ui/debug-toolbar.tsx`

- [ ] **Step 1: Implement**
```tsx
import type { DebugState } from "../engine/engine.types";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onReset: () => void;
}

export function DebugToolbar({ state, onStep, onReset }: Props) {
  const status = state?.status ?? "ready";
  return (
    <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
      <button className="px-2 py-0.5 border rounded" onClick={onStep} disabled={status === "finished" || status === "halted"}>
        Step
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>Reset</button>
      <span className="ml-auto opacity-70">
        {status} · step {state?.steps ?? 0}
      </span>
    </div>
  );
}
```

### Task 6.2: Variables panel

**Files:**
- Create: `apps/studio/src/features/simulator/ui/variables-panel.tsx`

- [ ] **Step 1: Implement**
```tsx
import type { DebugState } from "../engine/engine.types";

export function VariablesPanel({ state }: { state: DebugState | null }) {
  const entries = Object.entries(state?.memory ?? {});
  return (
    <div className="p-2 text-xs font-mono">
      <div className="uppercase opacity-60 mb-1">Variables</div>
      {entries.length === 0 && <div className="opacity-50">— run to inspect —</div>}
      {entries.map(([name, value]) => (
        <div key={name} className="flex justify-between gap-4">
          <span>{name}</span>
          <span className="opacity-80">{value}</span>
        </div>
      ))}
    </div>
  );
}
```

### Task 6.3: Current-line decoration hook

**Files:**
- Create: `apps/studio/src/features/simulator/ui/use-debug-decorations.ts`

- [ ] **Step 1: Implement** (applies a line highlight to a Monaco editor for the current source line)
```ts
import { useEffect } from "react";
import type * as Monaco from "monaco-editor";

export function useDebugDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  currentSourceLine: number | null,
) {
  useEffect(() => {
    if (!editor || !monaco) return;
    const decorations = editor.createDecorationsCollection(
      currentSourceLine
        ? [
            {
              range: new monaco.Range(currentSourceLine, 1, currentSourceLine, 1),
              options: { isWholeLine: true, className: "debug-current-line", linesDecorationsClassName: "debug-current-gutter" },
            },
          ]
        : [],
    );
    if (currentSourceLine) editor.revealLineInCenterIfOutsideViewport(currentSourceLine);
    return () => decorations.clear();
  }, [editor, monaco, currentSourceLine]);
}
```
Add the highlight CSS to `apps/studio/src/index.css`:
```css
.debug-current-line { background: rgba(80, 160, 255, 0.18); }
.debug-current-gutter { background: #5aa0ff; width: 3px !important; margin-left: 3px; }
```

### Task 6.4: Debug view + Debug action wiring

**Files:**
- Create: `apps/studio/src/features/simulator/ui/debug-view.tsx`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx` (add a "Debug" page-header action that navigates into debug mode; reuse the existing `usePageHeaderActions` pattern used for "Compile")

- [ ] **Step 1: Implement `debug-view.tsx`** — composes toolbar + a read-only Monaco of the source with the decoration + the variables panel; owns the controller lifecycle:
```tsx
import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { SMARTC_LANGUAGE_ID, registerSmartC } from "@/features/smartc-editor/language/register.ts";
import { DebugController } from "../debug-controller";
import { ScSimulatorEngine } from "../engine/simulator-engine";
import { compileForDebug } from "../compile-for-debug";
import { parseScenario, defaultScenario } from "../scenario/scenario-io";
import type { DebugState } from "../engine/engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
import { DebugToolbar } from "./debug-toolbar";
import { VariablesPanel } from "./variables-panel";
import { useDebugDecorations } from "./use-debug-decorations";

export function DebugView({ source, scenarioJson }: { source: string; scenarioJson?: string }) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [state, setState] = useState<DebugState | null>(null);
  const controllerRef = useRef<DebugController | null>(null);

  const scenario: ScenarioFile = useMemo(() => {
    try {
      return scenarioJson ? parseScenario(scenarioJson) : defaultScenario();
    } catch (e: any) {
      toast.error("Invalid scenario: " + e.message);
      return defaultScenario();
    }
  }, [scenarioJson]);

  const startSession = useCallback(() => {
    try {
      const program = compileForDebug(source);
      const controller = new DebugController(new ScSimulatorEngine());
      controllerRef.current = controller;
      setState(controller.start(program, scenario));
    } catch (e: any) {
      toast.error("Cannot start debug: " + e.message);
    }
  }, [source, scenario]);

  const onMount: OnMount = (editor, monaco) => {
    registerSmartC(monaco);
    editorRef.current = editor;
    monacoRef.current = monaco;
    startSession();
  };

  useDebugDecorations(editorRef.current, monacoRef.current, state?.currentSourceLine ?? null);

  return (
    <div className="flex flex-col h-full">
      <DebugToolbar
        state={state}
        onStep={() => controllerRef.current && setState(controllerRef.current.step())}
        onReset={() => controllerRef.current && setState(controllerRef.current.reset())}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <Editor defaultLanguage={SMARTC_LANGUAGE_ID} value={source} options={{ readOnly: true, minimap: { enabled: false } }} onMount={onMount} />
        </div>
        <div className="w-[220px] border-l overflow-auto">
          <VariablesPanel state={state} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Debug" action** in `smartc-editor.tsx`. Follow the EXISTING `ActionType.Compile` pattern (an `addAction({...})` inside a `useEffect`, cleaned up on unmount). Add:
```tsx
// near the ActionType enum:
enum ActionType {
  Compile = "compile",
  Debug = "debug",
}
```
and, in a `useEffect` mirroring the Compile action registration, register a Debug action whose `onClick` navigates to a debug route for this file (e.g. `navigate(\`/projects/${file.metadata.folderId}/debug/${file.metadata.id}\`)`), OR toggles a local `isDebugging` state that renders `<DebugView source={code} scenarioJson={siblingScenarioJson} />` in place of the editor. Choose the toggle approach for Plan 1 (no new route needed): add `const [isDebugging, setIsDebugging] = useState(false)`, register the Debug action to `setIsDebugging(true)`, and early-return `<DebugView .../>` when `isDebugging` (with a way back — a "Stop" is already the toolbar's Reset for now; add a small "× close" that calls `setIsDebugging(false)`). Read the sibling scenario file via `fs.listFolderContents(file.metadata.folderId)` looking for a `.scenario.json`, loading its content with `fs.loadFile`.

- [ ] **Step 3: Build**
Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`.

- [ ] **Step 4: Manual smoke (the whole point of Plan 1)**
`cd apps/studio && bun run dev`. Open a `.smart.c` contract, click **Debug**. Expected: the debug view opens; **Step** advances and the current SmartC line highlights and moves; the **Variables** panel shows names with changing values; **Reset** returns to the start. Compile errors surface as a toast and don't open the view.

- [ ] **Step 5: Commit Slice 6**
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/ui apps/studio/src/features/smartc-editor/smartc-editor.tsx apps/studio/src/index.css
git commit -m "feat(sim): minimal end-to-end debug view (run/step/reset + current-line highlight + variables)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done (Plan 1)

Walking skeleton complete: compile → embed-load → run scenario → step → source-line highlight + live variables, all on the `SimulatorEngine` seam with pure, tested cores. `bun test apps/studio/src/features/simulator` green; `bun run build` green.

**Plan 2 (next):** breakpoints + `continue` (with max-step cap), assembly view + source/asm toggle, full Inspector (registers / watch / call-stack / breakpoints tabs), bottom dock (console / emitted-txs / balance), and the full `.scenario.json` **form** editor as a first-class `scenario` file type. Written after Plan 1 proves the engine behavior.

---

## Spike Outcome & Plan Deltas (2026-08-09) — AUTHORITATIVE over the Slice bodies above

Slice 1 is **DONE** (`docs/superpowers/notes/sc-simulator-api.md`, commit `17ddb4c`). The spike **confirmed drivability** and simplified the architecture:

- **Sourcing = npm package** `smartc-signum-simulator@^3.1.0` (deleterium's packaged engine, BSD-3; the same one `signum-smartc-testbed` uses). **No vendoring.** (npm metadata mislabels the license "Proprietary" — cosmetic; the package ships a real BSD-3 LICENSE + headers.) Add it as an `apps/studio` dependency.
- **Headless-drivable** with `bun`/`node` (`new SimNode()`, no DOM) → the engine adapter gets a real node integration test.
- **The engine compiles the C source itself** (`loadSmartContract(cSource, creatorId)`) and builds its own **C↔assembly map** (`cToAsmMap`, from the `^comment line N` verbose comments it emits). `instructionPointer` is an **assembly line index**; `cToAsmMap[instructionPointer]` = 1-based C line.
- **Both step modes exist natively:** `contract.step()` = one assembly instruction; `Simulator.stepIntoSlotContract()` = step until the C line changes (source-level).
- State via `dumpContractData()`: memory as `{varName,value}[]` (names match `getMachineCode().Memory`), registers A/B, balance, enqueued/emitted txs, status, steps.
- Scenario = JSON array of `{sender, recipient, amount, blockheight, messageText?/messageHex?, tokens?}` + forge blocks. **Gotcha:** an activation tx's `blockheight` must equal the *current* height before forging (a `currentBlock-1` check).

**Deltas (win over the Slice bodies above where they conflict):**
1. **DROP `source-map.ts` (old Slice 3)** — engine provides `cToAsmMap`; `currentSourceLine` comes from the engine, not our parser.
2. **DROP `compile-for-debug.ts`** — the engine compiles the C source; the adapter takes `cSource`, not pre-compiled assembly. (The sim bundles its own compiler; aligning versions with the editor's `smartc-signum-compiler` is a later concern — fine for the skeleton.)
3. **Revised `SimulatorEngine`:** `load(cSource, creatorId?)`, `applyScenario(ScenarioFile)`, `step()` (asm), `stepInto()` (source-level), `reset()`, `getState()`, `getAssembly()`. `DebugState` carries both `instructionPointer` (asm line) and `currentSourceLine` (from engine); no `EngineState`/`LoadedContract` split.
4. **ADD `scenario/to-engine-txs.ts`** — pure `ScenarioFile → engine transactions JSON` translation (incl. the activation-blockheight rule), unit-tested.
5. **Revised slices:** Slice 2 = engine.types + scenario types/io + `to-engine-txs` + fake engine (pure, TDD). Slice 3 = real adapter over `smartc-signum-simulator` (+ dep + integration test). Slice 4 = debug-controller (TDD w/ fake). Slice 5 = UI skeleton (toolbar **Step / Step Into / Reset** + current-line highlight from `currentSourceLine` + variables + Debug action).
