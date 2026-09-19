# Workflow Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Studio's four workflow surfaces into equal destinations belonging to the project's one contract, announced by a rail that reports how that contract stands.

**Architecture:** Three pure modules carry the thinking — which file is the project's contract, what the persisted verdicts say, and what a cell therefore shows — and the React layer only arranges them. Simulate and Deploy become routes rather than booleans. The deployment fact is asked of the chain by code hash and never stored; the compile and test verdicts are stored in the file system's metadata blob beside `recentFiles`, each with the timestamp of the source it came from.

**Tech Stack:** React 19, react-router 7, jotai, Tailwind 4, `@monaco-editor/react`, `smartc-signum-compiler`, `@signumjs/core@3.2.0`, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-19-workflow-rail-design.md`

---

## Ordering note

The deployment surface must stay reachable at every commit. So the Deploy
**route** (Task 7) lands before the ASM editor's tab bar is dismantled (Task 8),
never the other way round.

## File structure

```
apps/studio/src/
  features/project/
    contract.ts                     CREATE  resolve the project's one contract
    contract.test.ts                CREATE
  lib/file-system/
    project-status.ts               CREATE  CompileVerdict/TestVerdict + service, beside recent-files.ts
    project-status.test.ts          CREATE
    file-system.ts                  MODIFY  compose fs.status, prune on delete
  features/workflow/
    rail-cells.ts                   CREATE  pure: verdicts + staleness → what each cell shows
    rail-cells.test.ts              CREATE
    rail.tsx                        CREATE  the four cells, the loop arc, navigation
    use-compile-verdict.ts          CREATE  read-through cache: verdict, or compile once and store
    use-deployment-count.ts         CREATE  the chain lookup, capped at 9+, cached per hash
    use-deployment-count.test.ts    CREATE
  pages/simulate/simulate-page.tsx  CREATE  the Simulate destination
  pages/deploy/deploy-page.tsx      CREATE  the Deploy destination
  components/ui/page.tsx            MODIFY  PageContent becomes flex; PageHeader takes the rail
  App.tsx                           MODIFY  two new routes
  features/smartc-editor/smartc-editor.tsx   MODIFY  isDebugging and two header actions go
  features/asm-editor/asm-editor.tsx         MODIFY  tabs → editor + detail panel
  features/simulator/ui/debug-view.tsx       MODIFY  ResizablePanelGroup; names its source
  features/testbed/ui/test-file-editor.tsx   MODIFY  names its source
  features/project/new-file-dialog.tsx       MODIFY  no second contract
  lib/file-system/transfer.ts                MODIFY  skip a second contract on import
  components/ui/layout/{main-area,right-sidebar}.tsx   DELETE
```

---

## Task 1: The height contract

Four editors measure their own offset in the viewport because `PageContent` is
a plain block `div`. Make it a flex container and they can say `h-full` again.

**Files:**
- Modify: `apps/studio/src/components/ui/page.tsx:89-98`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx`
- Modify: `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx`
- Modify: `apps/studio/src/features/simulator/scenario/scenario-editor.tsx`
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx`
- Delete: `apps/studio/src/components/ui/layout/main-area.tsx`, `right-sidebar.tsx`

No unit test: this is layout, verified by the build and in the browser at Task 10.

- [ ] **Step 1: Make PageContent a flex container**

Replace the body of `PageContent` (`page.tsx:89-98`) with:

```tsx
const PageContent = React.forwardRef<HTMLDivElement, PageContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      // `min-h-0` is the whole point: without it a flex child refuses to
      // shrink below its content, and every editor inside scrolls the page
      // instead of itself.
      <div
        ref={ref}
        className={cn("flex min-h-0 flex-1 flex-col", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
```

- [ ] **Step 2: Drop the measuring from the SmartC editor**

In `smartc-editor.tsx`, delete the `editorHeight` state, the
`calculateEditorHeight` effect and the `containerRef` usage for it, then:

```tsx
// before
<div className="flex flex-col" ref={containerRef}>
  …
  <Editor height={editorHeight} …
// after
<div className="flex min-h-0 flex-1 flex-col">
  …
  <Editor height="100%" …
```

- [ ] **Step 3: Do the same in the ASM and scenario editors**

`asm-code-editor.tsx` and `scenario-editor.tsx` carry the identical block.
Delete `editorHeight`, its state, its effect and the resize listener; wrap in
`<div className="flex min-h-0 flex-1 flex-col">`; pass `height="100%"`.

The Monaco wrapper around each editor needs a definite box, so the div that
holds `<Editor>` becomes `className="min-h-0 flex-1"`.

- [ ] **Step 4: And in the test editor**

`test-file-editor.tsx` uses `panelHeight` for the whole `ResizablePanelGroup`.
Delete `panelHeight`, `calculatePanelHeight` and its listener, and replace

```tsx
<div ref={containerRef} style={{ height: panelHeight }}>
```

with

```tsx
<div className="min-h-0 flex-1">
```

- [ ] **Step 5: Delete the two components nothing imports**

```bash
cd apps/studio && rm src/components/ui/layout/main-area.tsx src/components/ui/layout/right-sidebar.tsx
grep -rn "MainArea\|RightSidebar" src && echo "STILL REFERENCED" || echo "clean"
```

Expected: `clean`

- [ ] **Step 6: Verify**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`; suite green.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "refactor(studio): one height contract instead of four measurements"
```

---

## Task 2: The project's one contract

**Files:**
- Create: `apps/studio/src/features/project/contract.ts`
- Test: `apps/studio/src/features/project/contract.test.ts`

`pickMainFile` lives in `features/home/project-summary.ts` and was written for
the home page. The rail needs the same answer, so the rule moves into the
project domain and both call it.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/src/features/project/contract.test.ts
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
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/features/project/contract.test.ts`
Expected: FAIL — `Cannot find module './contract'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/features/project/contract.ts
import type { FileMetadata } from "@/lib/file-system";

/** The `.smart.c` suffix, matched on the name rather than the stored type. */
export const CONTRACT_EXTENSION = ".smart.c";

/** The fields the rule needs — so tests need no whole FileMetadata. */
export interface ContractCandidate {
  id: string;
  name: string;
  path: string;
}

export interface ContractChoice<T extends ContractCandidate = ContractCandidate> {
  contract: T;
  /** Contracts a rule-breaking workspace has beyond the first. Normally empty. */
  ignored: T[];
}

export function isContractFile(name: string): boolean {
  return name.endsWith(CONTRACT_EXTENSION);
}

function depthOf(path: string): number {
  return path.split("/").length;
}

/**
 * The project's contract, and anything it had to ignore.
 *
 * A project holds exactly one contract by decision, but workspaces written
 * before that rule can hold several, and those must not break. The choice is
 * deterministic — shallowest first, then alphabetical — because a rail whose
 * subject flickers between renders would be worse than a wrong one.
 */
export function pickContract<T extends ContractCandidate>(
  candidates: T[],
): ContractChoice<T> | null {
  const contracts = candidates.filter((file) => isContractFile(file.name));
  if (contracts.length === 0) return null;

  const [contract, ...ignored] = [...contracts].sort(
    (a, b) => depthOf(a.path) - depthOf(b.path) || a.name.localeCompare(b.name),
  );

  return { contract, ignored };
}

/** The contract of a project, read straight from the file system. */
export function contractOfProject(
  files: FileMetadata[],
): ContractChoice<FileMetadata> | null {
  return pickContract(files);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/features/project/contract.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Point the home page at the shared rule**

In `features/home/project-summary.ts`, delete its local `SMARTC_EXTENSION`
constant and its `pickMainFile` function, import from the new module, and
replace the call:

```ts
import { isContractFile, pickContract } from "@/features/project/contract";
…
const choice = pickContract(candidates);
const mainFileId = choice ? choice.contract.id : null;
```

Keep the existing comment about matching on the file-name suffix — it explains
why `FileTypes` is not imported here, which is still true.

- [ ] **Step 6: Verify the home page's own tests still pass**

Run: `cd apps/studio && bun test src/features/home/`
Expected: PASS, unchanged count.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/features/project/contract.ts apps/studio/src/features/project/contract.test.ts apps/studio/src/features/home/project-summary.ts
git commit -m "feat(studio): one rule for which file is the project's contract"
```

---

## Task 3: The project status record

**Files:**
- Create: `apps/studio/src/lib/file-system/project-status.ts`
- Test: `apps/studio/src/lib/file-system/project-status.test.ts`
- Modify: `apps/studio/src/lib/file-system/file-system.ts`
- Modify: `apps/studio/src/lib/file-system/index.ts`

Built exactly like `recent-files.ts`: pure functions plus a service bound to a
host, composed into `FileSystem` as a lazy getter.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/src/lib/file-system/project-status.test.ts
import { describe, it, expect } from "bun:test";
import {
  ProjectStatus,
  sanitizeStatuses,
  type ProjectStatusMap,
} from "./project-status";

function hostOver(initial: ProjectStatusMap = {}) {
  let stored = initial;
  return {
    host: {
      getStatuses: () => stored,
      setStatuses: (next: ProjectStatusMap) => {
        stored = next;
      },
    },
    read: () => stored,
  };
}

describe("sanitizeStatuses", () => {
  it("returns an empty map for anything unreadable", () => {
    // Runs while FileSystem is being constructed, so it must never throw.
    expect(sanitizeStatuses(undefined)).toEqual({});
    expect(sanitizeStatuses("nonsense")).toEqual({});
    expect(sanitizeStatuses([1, 2])).toEqual({});
  });

  it("drops entries that are not shaped like a record", () => {
    expect(sanitizeStatuses({ p1: 7, p2: { tests: {} } })).toEqual({
      p2: { tests: {} },
    });
  });

  it("repairs a record whose tests map is missing", () => {
    expect(sanitizeStatuses({ p1: { compile: { sourceModified: 1, errorCount: 0 } } })).toEqual({
      p1: { compile: { sourceModified: 1, errorCount: 0 }, tests: {} },
    });
  });
});

describe("ProjectStatus", () => {
  it("remembers a compile verdict per project", () => {
    const { host, read } = hostOver();
    const status = new ProjectStatus(host);

    status.recordCompile("proj", { sourceModified: 100, errorCount: 0 });

    expect(status.of("proj").compile).toEqual({ sourceModified: 100, errorCount: 0 });
    expect(read().proj.compile!.errorCount).toBe(0);
  });

  it("keeps one test verdict per test file", () => {
    const { host } = hostOver();
    const status = new ProjectStatus(host);

    status.recordTests("proj", "t1", {
      sourceModified: 10,
      contractModified: 5,
      passed: 12,
      failed: 0,
    });
    status.recordTests("proj", "t2", {
      sourceModified: 11,
      contractModified: 5,
      passed: 3,
      failed: 1,
    });

    expect(status.of("proj").tests.t1!.passed).toBe(12);
    expect(status.of("proj").tests.t2!.failed).toBe(1);
  });

  it("answers with an empty record for a project it has never seen", () => {
    const status = new ProjectStatus(hostOver().host);
    expect(status.of("unknown")).toEqual({ tests: {} });
  });

  it("forgets a project entirely, so a deleted project leaves nothing behind", () => {
    const { host, read } = hostOver();
    const status = new ProjectStatus(host);
    status.recordCompile("proj", { sourceModified: 1, errorCount: 0 });

    status.forgetProject("proj");

    expect(read()).toEqual({});
  });

  it("forgets a single test file's verdict when that file is deleted", () => {
    const { host } = hostOver();
    const status = new ProjectStatus(host);
    status.recordTests("proj", "t1", {
      sourceModified: 1,
      contractModified: 1,
      passed: 1,
      failed: 0,
    });

    status.forgetTests("t1");

    expect(status.of("proj").tests.t1).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/lib/file-system/project-status.test.ts`
Expected: FAIL — `Cannot find module './project-status'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/lib/file-system/project-status.ts

/**
 * What the workflow rail reports, persisted.
 *
 * Two facts about a project cannot be recomputed on demand: whether its
 * contract compiled, and how its last test run went. Both are records of
 * something that happened, so both carry the `lastModified` of the source they
 * came from — a verdict from before the last edit must not be shown, and the
 * timestamps are what make that possible rather than merely likely.
 *
 * Deployment is deliberately absent: the chain answers that from the code
 * hash, so there is nothing to keep and nothing to go stale.
 *
 * Same shape of service as `RecentFiles`, and composed into `FileSystem` the
 * same way.
 */

export interface CompileVerdict {
  /** The contract file's `lastModified` when this verdict was produced. */
  sourceModified: number;
  errorCount: number;
}

export interface TestVerdict {
  /** The test file's `lastModified` when the run happened. */
  sourceModified: number;
  /** And the contract's — a test result depends on both files. */
  contractModified: number;
  passed: number;
  failed: number;
}

export interface ProjectStatusRecord {
  compile?: CompileVerdict;
  /** Keyed by test file id. */
  tests: Record<string, TestVerdict>;
}

export type ProjectStatusMap = Record<string, ProjectStatusRecord>;

/** The slice of `FileSystem` this service needs. */
export interface ProjectStatusHost {
  getStatuses(): ProjectStatusMap;
  /** Replaces the map and persists it. */
  setStatuses(statuses: ProjectStatusMap): void;
}

const EMPTY: ProjectStatusRecord = { tests: {} };

function isRecordShaped(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Hydration guard for the persisted field.
 *
 * Runs while `FileSystem` is being constructed, so it must never throw: a
 * corrupt status field cannot be allowed to take down the workspace it
 * describes.
 */
export function sanitizeStatuses(value: unknown): ProjectStatusMap {
  if (!isRecordShaped(value)) return {};

  const clean: ProjectStatusMap = {};
  for (const [projectId, record] of Object.entries(value as Record<string, unknown>)) {
    if (!isRecordShaped(record)) continue;
    const candidate = record as ProjectStatusRecord;
    clean[projectId] = {
      compile: isRecordShaped(candidate.compile) ? candidate.compile : undefined,
      tests: isRecordShaped(candidate.tests) ? candidate.tests : {},
    };
  }

  return clean;
}

export class ProjectStatus {
  constructor(private readonly host: ProjectStatusHost) {}

  /** Never null: a project nobody has run anything in simply has no facts. */
  of(projectId: string): ProjectStatusRecord {
    return this.host.getStatuses()[projectId] ?? EMPTY;
  }

  recordCompile(projectId: string, verdict: CompileVerdict): void {
    const statuses = this.host.getStatuses();
    const current = statuses[projectId] ?? EMPTY;
    this.host.setStatuses({
      ...statuses,
      [projectId]: { ...current, compile: verdict },
    });
  }

  recordTests(projectId: string, testFileId: string, verdict: TestVerdict): void {
    const statuses = this.host.getStatuses();
    const current = statuses[projectId] ?? EMPTY;
    this.host.setStatuses({
      ...statuses,
      [projectId]: {
        ...current,
        tests: { ...current.tests, [testFileId]: verdict },
      },
    });
  }

  /** Called by the file system when a project folder is deleted. */
  forgetProject(projectId: string): void {
    const statuses = this.host.getStatuses();
    if (!(projectId in statuses)) return;
    const { [projectId]: _gone, ...rest } = statuses;
    this.host.setStatuses(rest);
  }

  /** Called by the file system when any file is deleted. */
  forgetTests(testFileId: string): void {
    const statuses = this.host.getStatuses();
    let changed = false;
    const next: ProjectStatusMap = {};

    for (const [projectId, record] of Object.entries(statuses)) {
      if (testFileId in record.tests) {
        const { [testFileId]: _gone, ...tests } = record.tests;
        next[projectId] = { ...record, tests };
        changed = true;
      } else {
        next[projectId] = record;
      }
    }

    if (changed) this.host.setStatuses(next);
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/lib/file-system/project-status.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Compose it into the file system**

In `lib/file-system/file-system.ts`:

```ts
// imports
import {
  ProjectStatus,
  sanitizeStatuses,
  type ProjectStatusMap,
} from "./project-status.ts";
```

Add the field to the metadata interface:

```ts
interface FileSystemMetadata {
  …
  recentFiles: RecentEntry[];
  /** Per-project compile and test verdicts. See `project-status.ts`. */
  projectStatus: ProjectStatusMap;
}
```

In the constructor's restore branch, beside the recents guard:

```ts
      this.metadata.recentFiles = sanitizeRecents(this.metadata.recentFiles);
      this.metadata.projectStatus = sanitizeStatuses(this.metadata.projectStatus);
```

In `adoptExternalWrite`, the same line after the recents one. In the
fresh-workspace branch, add `projectStatus: {}` to the literal.

Then the lazy getter, beside `get recents()`:

```ts
  private _status?: ProjectStatus;

  /**
   * Per-project compile and test verdicts, composed lazily. Persisted with
   * the rest of the metadata, so reads stay synchronous.
   */
  get status(): ProjectStatus {
    return (this._status ??= new ProjectStatus({
      getStatuses: () => this.metadata.projectStatus,
      setStatuses: (statuses) => {
        this.metadata.projectStatus = statuses;
        this.saveMetadata();
      },
    }));
  }
```

- [ ] **Step 6: Prune on deletion, so nothing dangles**

In `deleteFile`, beside `this.recents.forget(fileId);` add
`this.status.forgetTests(fileId);`. In `recursiveDeleteFolder`, beside the same
call, add `this.status.forgetTests(fileId);`. In `deleteFolder`, after the
recursive call, add `this.status.forgetProject(folderId);` — a deleted project
takes its verdicts with it.

- [ ] **Step 7: Export from the barrel**

In `lib/file-system/index.ts` add `export * from './project-status';`

- [ ] **Step 8: Verify the whole file-system suite**

Run: `cd apps/studio && bun test src/lib/file-system/ && bun run build`
Expected: PASS; `✅ Build completed`

- [ ] **Step 9: Commit**

```bash
git add apps/studio/src/lib/file-system
git commit -m "feat(studio): persist the compile and test verdicts a rail can report"
```

---

## Task 4: What a cell shows

**Files:**
- Create: `apps/studio/src/features/workflow/rail-cells.ts`
- Test: `apps/studio/src/features/workflow/rail-cells.test.ts`

This is where the staleness rule lives, and therefore the most important test
in the plan.

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/src/features/workflow/rail-cells.test.ts
import { describe, it, expect } from "bun:test";
import { compileCell, testCell, simulateCell, deployCell } from "./rail-cells";

describe("compileCell", () => {
  it("says nothing when no compile has happened", () => {
    expect(compileCell(undefined, 500)).toEqual({ fact: "—", tone: "neutral" });
  });

  it("reports a clean compile", () => {
    expect(compileCell({ sourceModified: 500, errorCount: 0 }, 500)).toEqual({
      fact: "compiles",
      tone: "good",
    });
  });

  it("reports the error count", () => {
    expect(compileCell({ sourceModified: 500, errorCount: 1 }, 500)).toEqual({
      fact: "1 error",
      tone: "bad",
    });
    expect(compileCell({ sourceModified: 500, errorCount: 3 }, 500).fact).toBe("3 errors");
  });

  it("refuses a verdict from before the last edit", () => {
    // The one way a status rail can actively mislead.
    expect(compileCell({ sourceModified: 400, errorCount: 0 }, 500)).toEqual({
      fact: "—",
      tone: "neutral",
    });
  });
});

describe("testCell", () => {
  const fresh = { sourceModified: 10, contractModified: 5, passed: 12, failed: 0 };

  it("says so when the project has no test file at all", () => {
    expect(testCell(null, undefined, 5)).toEqual({ fact: "no tests", tone: "neutral" });
  });

  it("says nothing when a test file exists but has never run", () => {
    expect(testCell({ modified: 10 }, undefined, 5)).toEqual({ fact: "—", tone: "neutral" });
  });

  it("reports a green run", () => {
    expect(testCell({ modified: 10 }, fresh, 5)).toEqual({ fact: "12 green", tone: "good" });
  });

  it("reports failures, which are what you want to see first", () => {
    expect(testCell({ modified: 10 }, { ...fresh, passed: 10, failed: 2 }, 5)).toEqual({
      fact: "2 failed",
      tone: "bad",
    });
  });

  it("refuses a verdict from before the test file changed", () => {
    expect(testCell({ modified: 11 }, fresh, 5).fact).toBe("—");
  });

  it("refuses a verdict from before the contract changed", () => {
    // A test result depends on both files, which is why both timestamps are kept.
    expect(testCell({ modified: 10 }, fresh, 6).fact).toBe("—");
  });
});

describe("simulateCell", () => {
  it("counts the scenarios, because that is answerable live", () => {
    expect(simulateCell(3)).toEqual({ fact: "3 scenarios", tone: "neutral" });
    expect(simulateCell(1)).toEqual({ fact: "1 scenario", tone: "neutral" });
    expect(simulateCell(0)).toEqual({ fact: "no scenario", tone: "neutral" });
  });
});

describe("deployCell", () => {
  it("says nothing without a wallet, and explains itself", () => {
    expect(deployCell({ state: "no-wallet" })).toEqual({
      fact: "—",
      tone: "neutral",
      hint: "Connect a wallet to ask the chain",
    });
  });

  it("says nothing while asking", () => {
    expect(deployCell({ state: "asking" })).toEqual({ fact: "…", tone: "neutral" });
  });

  it("reports that this code is nowhere on chain", () => {
    expect(deployCell({ state: "answered", total: 0, mine: 0, capped: false })).toEqual({
      fact: "not deployed",
      tone: "neutral",
    });
  });

  it("reports the count, which is the useful part", () => {
    expect(deployCell({ state: "answered", total: 3, mine: 0, capped: false }).fact).toBe("3 deployed");
  });

  it("names how many are yours when the wallet created some", () => {
    expect(deployCell({ state: "answered", total: 3, mine: 1, capped: false }).fact).toBe("3 · 1 yours");
  });

  it("caps a large answer rather than lying about the total", () => {
    // The node API returns no total, so ten results mean "at least ten".
    expect(deployCell({ state: "answered", total: 10, mine: 0, capped: true }).fact).toBe("9+ deployed");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/features/workflow/rail-cells.test.ts`
Expected: FAIL — `Cannot find module './rail-cells'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/studio/src/features/workflow/rail-cells.ts
import type { CompileVerdict, TestVerdict } from "@/lib/file-system";

/**
 * What each cell of the workflow rail shows.
 *
 * All of it pure, because the interesting part is not the arrangement but the
 * staleness rule: a verdict is only shown while the files it was produced from
 * have not moved on. A green badge from before the last edit is the one way a
 * rail like this can actively mislead, so it is a rule with tests rather than
 * an intention.
 */

export type CellTone = "good" | "bad" | "neutral";

export interface CellContent {
  fact: string;
  tone: CellTone;
  /** Shown in the tooltip when the cell cannot answer. */
  hint?: string;
}

const UNKNOWN: CellContent = { fact: "—", tone: "neutral" };

export function compileCell(
  verdict: CompileVerdict | undefined,
  contractModified: number,
): CellContent {
  if (!verdict || verdict.sourceModified !== contractModified) return UNKNOWN;
  if (verdict.errorCount === 0) return { fact: "compiles", tone: "good" };

  return {
    fact: verdict.errorCount === 1 ? "1 error" : `${verdict.errorCount} errors`,
    tone: "bad",
  };
}

export function testCell(
  testFile: { modified: number } | null,
  verdict: TestVerdict | undefined,
  contractModified: number,
): CellContent {
  if (!testFile) return { fact: "no tests", tone: "neutral" };
  if (!verdict) return UNKNOWN;
  if (verdict.sourceModified !== testFile.modified) return UNKNOWN;
  if (verdict.contractModified !== contractModified) return UNKNOWN;
  if (verdict.failed > 0) return { fact: `${verdict.failed} failed`, tone: "bad" };

  return { fact: `${verdict.passed} green`, tone: "good" };
}

export function simulateCell(scenarioCount: number): CellContent {
  if (scenarioCount === 0) return { fact: "no scenario", tone: "neutral" };

  return {
    fact: scenarioCount === 1 ? "1 scenario" : `${scenarioCount} scenarios`,
    tone: "neutral",
  };
}

export type DeploymentAnswer =
  | { state: "no-wallet" }
  | { state: "asking" }
  | { state: "answered"; total: number; mine: number; capped: boolean };

export function deployCell(answer: DeploymentAnswer): CellContent {
  if (answer.state === "no-wallet") {
    return { ...UNKNOWN, hint: "Connect a wallet to ask the chain" };
  }
  if (answer.state === "asking") return { fact: "…", tone: "neutral" };
  if (answer.total === 0) return { fact: "not deployed", tone: "neutral" };

  const count = answer.capped ? "9+" : String(answer.total);
  if (answer.mine > 0) return { fact: `${count} · ${answer.mine} yours`, tone: "good" };

  return { fact: `${count} deployed`, tone: "neutral" };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/features/workflow/rail-cells.test.ts`
Expected: PASS, 18 tests

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/workflow
git commit -m "feat(studio): what each rail cell says, and when it refuses to"
```

---

## Task 5: The rail

**Files:**
- Create: `apps/studio/src/features/workflow/use-compile-verdict.ts`
- Create: `apps/studio/src/features/workflow/rail.tsx`
- Modify: `apps/studio/src/components/ui/page.tsx` (PageHeader renders the rail)
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx` (record the verdict)
- Modify: `apps/studio/src/features/testbed/use-test-run.ts` (record the verdict)

- [ ] **Step 1: Measure a compile before deciding to do one**

The spec gates the lazy compile on cost. Measure it:

```bash
cd apps/studio && cat > /tmp/compile-timing.ts <<'TS'
import { SmartC } from "smartc-signum-compiler";
import { smartcStarter } from "./src/features/project/smartc-starter";

const source = smartcStarter("counter");
// Warm the JIT, then time ten runs.
for (let i = 0; i < 3; i++) new SmartC({ language: "C", sourceCode: source }).compile();

const started = performance.now();
for (let i = 0; i < 10; i++) new SmartC({ language: "C", sourceCode: source }).compile();
console.log("mean ms:", (performance.now() - started) / 10);
TS
bun run /tmp/compile-timing.ts
```

Record the number in the commit message. **If the mean is under 50 ms**,
continue with Step 2 as written. **If it is over**, skip Step 2 entirely: the
hook becomes a plain read of `fs.status.of(projectId).compile` with no
compiling, and the Write cell reads `—` until the editor has validated once.

- [ ] **Step 2: Write the read-through verdict hook**

```ts
// apps/studio/src/features/workflow/use-compile-verdict.ts
import { useEffect, useState } from "react";
import { SmartC } from "smartc-signum-compiler";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { CompileVerdict, FileMetadata } from "@/lib/file-system";

/**
 * The project's compile verdict, compiling once if what is stored is missing
 * or stale.
 *
 * The persisted record doubles as the cache: a hit costs nothing, a miss costs
 * one compile and is then a hit for every later navigation, and an edit
 * invalidates it by moving the file's `lastModified`. The SmartC editor writes
 * the same record while it validates — free, because it compiles anyway — so
 * in practice this rarely has to do the work itself.
 */
export function useCompileVerdict(
  projectId: string,
  contract: FileMetadata | null,
): { verdict: CompileVerdict | undefined; compiling: boolean } {
  const fs = useFileSystem();
  const [compiling, setCompiling] = useState(false);
  const [, bump] = useState(0);

  const stored = projectId ? fs.status.of(projectId).compile : undefined;
  const fresh = contract && stored?.sourceModified === contract.lastModified;

  useEffect(() => {
    if (!contract || !projectId || fresh) return;

    let cancelled = false;
    setCompiling(true);

    // A microtask, so the rail paints before the compiler blocks the thread.
    void Promise.resolve().then(async () => {
      try {
        const { content } = await fs.loadFile<string>(contract.id);
        if (cancelled) return;

        let errorCount = 0;
        try {
          new SmartC({ language: "C", sourceCode: content ?? "" }).compile();
        } catch {
          // The compiler throws on the first error rather than collecting, so
          // one is all this can honestly claim.
          errorCount = 1;
        }

        fs.status.recordCompile(projectId, {
          sourceModified: contract.lastModified,
          errorCount,
        });
      } finally {
        if (!cancelled) {
          setCompiling(false);
          bump((n) => n + 1);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fs, projectId, contract?.id, contract?.lastModified, fresh]);

  return { verdict: fresh ? stored : undefined, compiling };
}
```

- [ ] **Step 3: Write the rail**

```tsx
// apps/studio/src/features/workflow/rail.tsx
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { contractOfProject } from "@/features/project/contract";
import {
  compileCell,
  deployCell,
  simulateCell,
  testCell,
  type CellContent,
} from "./rail-cells";
import { useCompileVerdict } from "./use-compile-verdict";
import { useDeploymentCount } from "./use-deployment-count";

const TONE: Record<CellContent["tone"], string> = {
  good: "var(--green)",
  bad: "var(--mag)",
  neutral: "var(--dim)",
};

interface Cell {
  id: "write" | "test" | "simulate" | "deploy";
  label: string;
  content: CellContent;
  /** Absent means the destination cannot be entered. */
  go?: () => void;
}

/**
 * Write · Test · Simulate → Deploy, for the project's one contract.
 *
 * Each cell carries a fact rather than a step number, because the process is
 * not a pipeline: the first three repeat until the contract is right, and the
 * arc beneath them says so. Deploy is set apart by a gap — it happens once and
 * it costs money.
 */
export function WorkflowRail() {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const { projectId = "", fileId = "" } = useParams<{
    projectId: string;
    fileId: string;
  }>();

  const files = useMemo(
    () => (projectId ? fs.listFilesRecursive(projectId) : []),
    [fs, projectId],
  );
  const choice = contractOfProject(files);
  const contract = choice?.contract ?? null;

  const scenarios = files.filter((file) => file.name.endsWith(".scenario.json"));
  const tests = files.filter((file) => file.name.endsWith(".test.ts"));

  // The same file the Test cell would open, so the fact and the click agree.
  const recentIds = fs.recents.list().map((entry) => entry.fileId);
  const activeTest =
    tests.find((file) => recentIds.includes(file.id)) ?? tests[0] ?? null;

  const { verdict, compiling } = useCompileVerdict(projectId, contract);
  const status = projectId ? fs.status.of(projectId) : { tests: {} };
  const deployment = useDeploymentCount(contract);

  const cells: Cell[] = [
    {
      id: "write",
      label: "Write",
      content: contract
        ? compileCell(verdict, contract.lastModified)
        : { fact: "no contract", tone: "neutral" },
      go: contract
        ? () => navigate(`/projects/${projectId}/files/${contract.id}`)
        : undefined,
    },
    {
      id: "test",
      label: "Test",
      content: testCell(
        activeTest ? { modified: activeTest.lastModified } : null,
        activeTest ? status.tests[activeTest.id] : undefined,
        contract?.lastModified ?? 0,
      ),
      go: activeTest
        ? () => navigate(`/projects/${projectId}/files/${activeTest.id}`)
        : undefined,
    },
    {
      id: "simulate",
      label: "Simulate",
      content: simulateCell(scenarios.length),
      go: contract ? () => navigate(`/projects/${projectId}/simulate`) : undefined,
    },
    {
      id: "deploy",
      label: "Deploy",
      content: deployCell(deployment),
      // The only destination that can be barred, and only while the source
      // does not compile — Deploy is the one step that needs machine code.
      go:
        contract && verdict?.errorCount === 0
          ? () => navigate(`/projects/${projectId}/deploy`)
          : undefined,
    },
  ];

  const here = (id: Cell["id"]) => {
    if (id === "write") return contract ? fileId === contract.id : false;
    if (id === "test") return activeTest ? fileId === activeTest.id : false;
    return location.pathname.endsWith(`/${id}`);
  };

  const ignoredNote = choice?.ignored.length
    ? ` · a second contract (${choice.ignored[0]!.name}) is ignored`
    : "";

  return (
    <div className="flex items-center" role="group" aria-label="Workflow">
      <div className="relative pb-[11px]">
        <div className="flex">
          {cells.slice(0, 3).map((cell) => (
            <RailCell
              key={cell.id}
              cell={cell}
              active={here(cell.id)}
              pulsing={cell.id === "write" && compiling}
              note={cell.id === "write" ? ignoredNote : ""}
            />
          ))}
        </div>
        {/* The loop: these three repeat. A drawing, not a control. */}
        <svg
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[10px] w-full"
          viewBox="0 0 240 10"
          preserveAspectRatio="none"
        >
          <path
            d="M234 1 L234 6 Q234 9 231 9 L9 9 Q6 9 6 6 L6 1"
            fill="none"
            stroke="var(--border-2)"
            strokeWidth="1"
          />
          <path d="M6 1 l-2.5 3.5 h5 z" fill="var(--border-2)" />
        </svg>
      </div>

      <span aria-hidden className="w-[18px] text-center text-[var(--border-2)]">
        →
      </span>

      <RailCell cell={cells[3]!} active={here("deploy")} pulsing={false} note="" />
    </div>
  );
}

function RailCell({
  cell,
  active,
  pulsing,
  note,
}: {
  cell: Cell;
  active: boolean;
  pulsing: boolean;
  note: string;
}) {
  const barred = !cell.go;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={cell.go}
          disabled={barred}
          aria-current={active ? "page" : undefined}
          className={
            "motion-control flex min-w-[74px] flex-col items-start gap-px border border-r-0 px-2.5 py-1 last:border-r " +
            (active
              ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-1)_16%,transparent)] "
              : "border-[var(--border-1)] ") +
            (barred ? "opacity-40 " : "cursor-pointer hover:border-[var(--accent-2)] ")
          }
        >
          <span className="text-[10px] tracking-[0.4px] text-[var(--dim)]">
            {cell.label}
          </span>
          {/* Hidden below the threshold: navigation must never break, only reporting. */}
          <span
            className={
              "hidden font-mono text-[10.5px] lg:block " + (pulsing ? "motion-pulse" : "")
            }
            style={{ color: TONE[cell.content.tone] }}
          >
            {cell.content.fact}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {cell.label}
        {cell.content.hint ? ` — ${cell.content.hint}` : ""}
        {barred && !cell.content.hint ? " — needs a contract that compiles" : ""}
        {note}
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Give the page header a slot for it**

In `components/ui/page.tsx`, import the rail and render it between the title
area and the actions, on project routes only:

```tsx
import { useMatch } from "react-router";
import { WorkflowRail } from "@/features/workflow/rail";
…
const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, children, ...props }, ref) => {
    const { actions } = usePageHeaderActions();
    // The home page has no contract to report on and keeps its own strip.
    const inProject = !!useMatch("/projects/:projectId/*");

    return (
      <header
        ref={ref}
        className={cn(
          "flex h-[60px] w-full shrink-0 items-center justify-between gap-4 border-b p-4",
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2">{children}</div>
        {inProject && <WorkflowRail />}
        {actions && actions.length > 0 && (
          … unchanged …
        )}
      </header>
    );
  },
);
```

- [ ] **Step 5: Record the compile verdict where it is free**

In `smartc-editor.tsx`, `handleValidate` already counts error markers. Store
the result there:

```tsx
  const handleValidate = (markers: any[]) => {
    // Only compile errors block save/compile; warnings are informational.
    const MARKER_SEVERITY_ERROR = 8; // monaco.MarkerSeverity.Error
    const errors = markers.filter((m) => m.severity === MARKER_SEVERITY_ERROR);
    setValidationError(errors[0]?.message ?? "");

    // Free: Monaco has just compiled to produce these markers, and the rail
    // would otherwise pay for the same answer.
    fs.status.recordCompile(file.metadata.folderId, {
      sourceModified: file.metadata.lastModified,
      errorCount: errors.length,
    });
  };
```

- [ ] **Step 6: Record the test verdict when a run finishes**

In `features/testbed/ui/test-file-editor.tsx`, after a run completes, store the
counts. `state.status` becomes `"done"` and `state.rows` carry the outcome:

```tsx
  // The rail reports the last run, so the last run has to outlive this editor.
  useEffect(() => {
    if (state.status !== "done") return;

    const contract = contractOfProject(fs.listFilesRecursive(projectId))?.contract;
    fs.status.recordTests(projectId, file.metadata.id, {
      sourceModified: file.metadata.lastModified,
      contractModified: contract?.lastModified ?? 0,
      passed: state.rows.filter((row) => row.status === "passed").length,
      failed: state.rows.filter(
        (row) => row.status === "failed" || row.status === "timedout",
      ).length,
    });
  }, [state.status, state.rows, fs, projectId, file.metadata.id, file.metadata.lastModified]);
```

Add `import { contractOfProject } from "@/features/project/contract";` and
re-add `const fs = useFileSystem();` — Task 8 of the previous phase removed it
when the direct save went away.

- [ ] **Step 7: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): a rail that reports how the contract stands

Mean compile time measured at <N> ms, so the rail compiles on a miss."
```

---

## Task 6: Simulate becomes a destination

**Files:**
- Create: `apps/studio/src/pages/simulate/simulate-page.tsx`
- Modify: `apps/studio/src/App.tsx`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx`

- [ ] **Step 1: Write the page**

```tsx
// apps/studio/src/pages/simulate/simulate-page.tsx
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { contractOfProject } from "@/features/project/contract";
import { DebugView } from "@/features/simulator/ui/debug-view";

/**
 * Stepping the project's contract against a scenario.
 *
 * A destination rather than a boolean inside the editor: the back button
 * works, and it sits beside `/debug/dashboard`, which was already a route.
 */
export function SimulatePage() {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const { projectId = "" } = useParams<{ projectId: string }>();

  const [source, setSource] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<{ name: string; json: string }[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const files = fs.listFilesRecursive(projectId);
      const contract = contractOfProject(files)?.contract;
      if (!contract) {
        setMissing(true);
        return;
      }

      const loaded = await fs.loadFile<string>(contract.id);
      const scenarioFiles = files.filter((file) => file.name.endsWith(".scenario.json"));
      const withContent = await Promise.all(
        scenarioFiles.map(async (file) => ({
          name: file.name,
          json: (await fs.loadFile<string>(file.id)).content ?? "",
        })),
      );

      if (cancelled) return;
      setSource(loaded.content ?? "");
      setScenarios(withContent);
    }

    load().catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [fs, projectId]);

  if (missing) return <Navigate to="/" replace />;
  if (source === null) return <div className="p-4 text-sm">Loading…</div>;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">Simulate</h1>
        <Badge variant="secondary">SC-Simulator</Badge>
      </PageHeader>
      <PageContent className="overflow-hidden">
        <DebugView
          source={source}
          scenarios={scenarios}
          sourceLabel={
            scenarios.length ? `scenario · ${scenarios[0]!.name}` : "no scenario"
          }
          onClose={() => navigate(`/projects/${projectId}`)}
        />
      </PageContent>
    </Page>
  );
}
```

- [ ] **Step 2: Let DebugView name its source**

In `features/simulator/ui/debug-view.tsx`, add the prop and render it in the
existing toolbar row (`debug-view.tsx:50`, the `h-[30px]` strip):

```tsx
interface Props {
  source: string;
  scenarios: { name: string; json: string }[];
  /**
   * Where this session's input came from. There are two kinds — a scenario
   * file, and a recording of a test run — and they look identical while
   * behaving differently, so each says which it is.
   */
  sourceLabel?: string;
  onClose: () => void;
}
```

and inside that strip, before the scenario picker:

```tsx
{sourceLabel && (
  <span className="font-mono text-[10px] text-[var(--dim)]">{sourceLabel}</span>
)}
```

- [ ] **Step 3: Name the other one too**

In `features/testbed/ui/test-file-editor.tsx`, the in-place handoff passes a
recording. Give it the matching label:

```tsx
          <DebugView
            source={recording.contractSource}
            scenarios={[{ name: "from test run", json: serializeScenario(toDebugScenario(recording)) }]}
            sourceLabel={`recording · ${activeRow?.name ?? "test run"}`}
            onClose={() => setDebugging(false)}
          />
```

- [ ] **Step 4: Add the route**

In `App.tsx`, inside the `AppLayout` route:

```tsx
<Route path="/projects/:projectId/simulate" element={<SimulatePage />} />
```

with `import { SimulatePage } from "./pages/simulate/simulate-page";`

- [ ] **Step 5: Take the Debug action and the mode out of the editor**

In `smartc-editor.tsx`, delete: the `isDebugging` state, the `ActionType.Debug`
effect that registers the Debug action, the `if (isDebugging) return <DebugView …>`
branch, the `scenarios` state and its loading effect, and the now-unused
`DebugView` and scenario-io imports. The rail's Simulate cell replaces all of
it.

Also delete the `ActionType.NewScenario` effect: that action moves to the
Simulate destination in Task 9.

- [ ] **Step 6: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): simulate is a destination, not a boolean"
```

---

## Task 7: Deploy becomes a destination

**Files:**
- Create: `apps/studio/src/pages/deploy/deploy-page.tsx`
- Modify: `apps/studio/src/App.tsx`

The ASM editor keeps its tabs until Task 8, so deployment stays reachable
through both paths for exactly one commit.

- [ ] **Step 1: Write the page**

```tsx
// apps/studio/src/pages/deploy/deploy-page.tsx
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { contractOfProject } from "@/features/project/contract";
import { DeploymentView } from "@/features/asm-editor/deployment-view/deployment-view";
import type { MachineData } from "@/features/asm-editor/machine-data";
import { SmartC } from "smartc-signum-compiler";

/**
 * Publishing the project's contract.
 *
 * Compiles the contract source here rather than reading the `.asm` file: that
 * file is a build product which may have been hand-edited, and deploying a
 * stale or altered assembly is a mistake worth making impossible.
 */
export function DeployPage() {
  const fs = useFileSystem();
  const { projectId = "" } = useParams<{ projectId: string }>();

  const [machineData, setMachineData] = useState<MachineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function compile() {
      const contract = contractOfProject(fs.listFilesRecursive(projectId))?.contract;
      if (!contract) {
        setMissing(true);
        return;
      }

      const { content } = await fs.loadFile<string>(contract.id);
      if (cancelled) return;

      try {
        const compiler = new SmartC({ language: "C", sourceCode: content ?? "" });
        setMachineData(compiler.compile().getMachineCode());
      } catch (e: any) {
        setError(e.message);
      }
    }

    compile().catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [fs, projectId]);

  if (missing) return <Navigate to="/" replace />;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">Deploy</h1>
        <Badge variant="secondary">Signum</Badge>
      </PageHeader>
      <PageContent className="overflow-auto p-4">
        {error && (
          <p className="text-sm" style={{ color: "var(--mag)" }}>
            <span aria-hidden>● </span>
            The contract does not compile, so there is nothing to publish: {error}
          </p>
        )}
        {!error && !machineData && <p className="text-sm">Compiling…</p>}
        {machineData && <DeploymentView data={machineData} />}
      </PageContent>
    </Page>
  );
}
```

- [ ] **Step 2: Add the route**

In `App.tsx`:

```tsx
<Route path="/projects/:projectId/deploy" element={<DeployPage />} />
```

with `import { DeployPage } from "./pages/deploy/deploy-page";`

- [ ] **Step 3: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): deploy the contract, not its assembly file"
```

---

## Task 8: The assembler loses its tab bar

**Files:**
- Modify: `apps/studio/src/features/asm-editor/asm-editor.tsx`
- Modify: `apps/studio/src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Editor and detail panel, side by side**

Replace the `Tabs` structure in `asm-editor.tsx` (from `<Tabs` to `</Tabs>`)
with a resizable pair, so the numbers are readable *while* the assembly is:

```tsx
    <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize={62} minSize={30}>
        <AsmCodeEditor file={file} onSave={handleOnSave} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={38} minSize={20}>
        <div className="h-full overflow-auto">
          {machineData ? (
            <MetaDataView machineData={machineData} />
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              Assemble the file to see its size, registers and pages.
            </p>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
```

Imports: `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` from
`@/components/ui/resizable`. Delete the `Tabs` imports, the `ViewType` type,
`handleViewChange`, the `useSearchParams` usage and the `DeploymentView`
import — deployment is its own destination now.

- [ ] **Step 2: Put the debugger on the same idiom**

In `debug-view.tsx`, replace the hand-rolled split (`debug-view.tsx:241-275`:
the `flex flex-1` row, the `panelRef`, `panelWidth` state and the drag handle)
with:

```tsx
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={66} minSize={30}>
          <div className="h-full min-w-0">{/* editor / asm view, unchanged */}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={34} minSize={20}>
          <div className="h-full overflow-hidden border-l">
            {/* DebugSidePanel, unchanged */}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
```

Delete the width state, its persistence and the pointer handlers: panel sizes
are the panel group's business now.

- [ ] **Step 3: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): one panel idiom, and assembly details beside the code"
```

---

## Task 9: The chain answers the Deploy cell

**Files:**
- Create: `apps/studio/src/features/workflow/use-deployment-count.ts`
- Test: `apps/studio/src/features/workflow/use-deployment-count.test.ts`
- Modify: `apps/studio/src/pages/simulate/simulate-page.tsx` (the New Scenario action)

- [ ] **Step 1: Write the failing test for the pure part**

```ts
// apps/studio/src/features/workflow/use-deployment-count.test.ts
import { describe, it, expect } from "bun:test";
import { summariseContracts, DEPLOYMENT_PAGE_SIZE } from "./use-deployment-count";

const at = (creator: string) => ({ creator, at: "1", atRS: "S-1" }) as any;

describe("summariseContracts", () => {
  it("reports nothing deployed for an empty answer", () => {
    expect(summariseContracts([], "123")).toEqual({
      state: "answered",
      total: 0,
      mine: 0,
      capped: false,
    });
  });

  it("counts the instances", () => {
    expect(summariseContracts([at("9"), at("8")], "123").total).toBe(2);
  });

  it("counts the ones the connected account created", () => {
    const summary = summariseContracts([at("123"), at("8"), at("123")], "123");
    expect(summary.mine).toBe(2);
  });

  it("counts none as mine when no wallet account is known", () => {
    expect(summariseContracts([at("123")], undefined).mine).toBe(0);
  });

  it("marks a full page as capped, because the API returns no total", () => {
    const full = Array.from({ length: DEPLOYMENT_PAGE_SIZE }, () => at("9"));
    expect(summariseContracts(full, "123").capped).toBe(true);
  });

  it("does not mark a partial page as capped", () => {
    expect(summariseContracts([at("9")], "123").capped).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/features/workflow/use-deployment-count.test.ts`
Expected: FAIL — `Cannot find module './use-deployment-count'`

- [ ] **Step 3: Write it**

```ts
// apps/studio/src/features/workflow/use-deployment-count.ts
import { useEffect, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { SmartC } from "smartc-signum-compiler";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import type { FileMetadata } from "@/lib/file-system";
import type { DeploymentAnswer } from "./rail-cells";

/**
 * How many copies of this code are on chain.
 *
 * Asked rather than stored: the code hash is a pure function of the compiled
 * code, so the answer travels with the code instead of with this browser
 * profile — it survives a reload, another machine and a fresh import.
 *
 * The node comes from the connected wallet and from nowhere else. Studio ships
 * no default node: a local-first tool should not quietly tell a third-party
 * server what code you are writing.
 */

/** Ten, so that a full page means "at least ten" and the cell can say `9+`. */
export const DEPLOYMENT_PAGE_SIZE = 10;

export function summariseContracts(
  contracts: Pick<Contract, "creator">[],
  accountId: string | undefined,
): DeploymentAnswer {
  return {
    state: "answered",
    total: contracts.length,
    mine: accountId
      ? contracts.filter((contract) => contract.creator === accountId).length
      : 0,
    capped: contracts.length >= DEPLOYMENT_PAGE_SIZE,
  };
}

/** Answers per code hash, for the session. */
const cache = new Map<string, DeploymentAnswer>();

export function useDeploymentCount(contract: FileMetadata | null): DeploymentAnswer {
  const fs = useFileSystem();
  const wallet = useWalletStatus();
  const [answer, setAnswer] = useState<DeploymentAnswer>({ state: "no-wallet" });

  useEffect(() => {
    if (!contract || !wallet) {
      setAnswer({ state: "no-wallet" });
      return;
    }

    let cancelled = false;

    async function ask() {
      const { content } = await fs.loadFile<string>(contract!.id);
      let hash: string;
      try {
        const compiler = new SmartC({ language: "C", sourceCode: content ?? "" });
        hash = compiler.compile().getMachineCode().MachineCodeHashId;
      } catch {
        // No hash without a compile, which is the same condition that bars the
        // destination — so there is nothing to report and nothing to explain.
        return;
      }

      const cached = cache.get(hash);
      if (cached) {
        if (!cancelled) setAnswer(cached);
        return;
      }

      if (!cancelled) setAnswer({ state: "asking" });

      const list = await wallet!.ledger.contract.getAllContractsByCodeHash({
        machineCodeHash: hash,
        includeDetails: false,
        firstIndex: 0,
        lastIndex: DEPLOYMENT_PAGE_SIZE - 1,
      });

      const summary = summariseContracts(list.ats, wallet!.accountId);
      cache.set(hash, summary);
      if (!cancelled) setAnswer(summary);
    }

    // A failed or refused lookup is not an error state: the cell simply cannot
    // answer, and says so.
    ask().catch(() => !cancelled && setAnswer({ state: "no-wallet" }));

    return () => {
      cancelled = true;
    };
  }, [fs, wallet, contract?.id, contract?.lastModified]);

  return answer;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/features/workflow/use-deployment-count.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Move New Scenario to where scenarios are used**

In `simulate-page.tsx`, register the action the SmartC editor used to own:

```tsx
  const { addAction, removeAction } = usePageHeaderActions();

  useEffect(() => {
    addAction({
      id: "new-scenario",
      tooltip: "Create a run scenario for this contract",
      label: "New Scenario",
      icon: <FilePlus2 className="h-4 w-4" />,
      onClick: async () => {
        const existing = new Set(
          fs.listFolderContents(projectId).files.map((f) => f.metadata.name),
        );
        const base = (contractName ?? "contract").split(".")[0]!.toLowerCase();
        let name = `${base}.scenario.json`;
        for (let n = 2; existing.has(name); n++) name = `${base}-${n}.scenario.json`;

        await fs.addFile(projectId, name, FileTypes.Scenario, serializeScenario(defaultScenario()));
      },
      variant: "console",
    });
    return () => removeAction("new-scenario");
  }, [addAction, removeAction, fs, projectId, contractName]);
```

Keep `contractName` in state alongside `source`, set from the contract's
`name` in the existing load effect. Imports: `usePageHeaderActions`,
`FilePlus2`, `FileTypes`, and `defaultScenario`/`serializeScenario` from
`@/features/simulator/scenario/scenario-io`.

- [ ] **Step 6: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): ask the chain how often this code is deployed"
```

---

## Task 10: One contract per project, enforced

**Files:**
- Modify: `apps/studio/src/features/project/new-file-dialog.tsx`
- Modify: `apps/studio/src/lib/file-system/transfer.ts`
- Test: `apps/studio/src/lib/file-system/transfer.test.ts`

- [ ] **Step 1: Write the failing test for the import gate**

Add to `transfer.test.ts`:

```ts
  it("imports at most one contract, because a project holds exactly one", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("root", "proj");

    const result = await fs.transferOf().importEntries(
      target,
      [
        { path: "a.smart.c", content: "long a;" },
        { path: "b.smart.c", content: "long b;" },
        { path: "a.test.ts", content: "it('x', () => {});" },
      ],
      testResolve,
    );

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(
      fs.listFolderContents(target).files.filter((f) => f.metadata.name.endsWith(".smart.c")),
    ).toHaveLength(1);
  });
```

`FakeFs` needs a `transferOf()` helper returning `new FileTransfer(this)`; add
it beside the existing methods if it is not already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/lib/file-system/transfer.test.ts`
Expected: FAIL — two contracts imported, `skipped` is 0.

- [ ] **Step 3: Add the gate**

In `transfer.ts`, inside `importEntries`, after the two existing gates:

```ts
    // A project holds exactly one contract. A second one in the archive is
    // skipped rather than merged, and the caller already reports skipped files.
    const isContract = (path: string) => baseName(path).endsWith(".smart.c");
    const alreadyHasContract = this.fs
      .listFolderContents(targetFolderId)
      .files.some((file) => isContract(file.metadata.name));

    let contractTaken = alreadyHasContract;
    const admitted = accepted.filter((entry) => {
      if (!isContract(entry.path)) return true;
      if (contractTaken) return false;
      contractTaken = true;
      return true;
    });
    const skipped = entries.length - admitted.length;
```

and use `admitted` in place of `accepted` for the rest of the method. Delete
the old `const skipped = entries.length - accepted.length;`.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/lib/file-system/transfer.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Stop offering a second contract in the dialog**

In `new-file-dialog.tsx`, the type list is built from `FileTypes`. Filter it:

```tsx
// The project already has its one contract, so SmartC is not on offer here.
const offered = hasContract
  ? types.filter((type) => type !== FileTypes.SmartC)
  : types;
```

`hasContract` is a new prop, passed by `FolderNode`:

```tsx
<NewFileDialog
  …
  hasContract={fs
    .listFilesRecursive(projectId)
    .some((file) => isContractFile(file.name))}
/>
```

`FolderNode` knows its own folder id; for a nested folder the project is the
root ancestor, so pass the id `FolderNode` already uses for its sibling
lookups. Import `isContractFile` from `@/features/project/contract`.

- [ ] **Step 6: Verify**

Run: `cd apps/studio && bun test && bun run build`
Expected: suite green; `✅ Build completed`

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "fix(studio): keep a project to its one contract"
```

---

## Task 11: Verification in the browser

Manual and mandatory; there is no DOM test environment. Run
`cd apps/studio && bun dev` and report what actually happened at each point.

- [ ] **Step 1: The rail reports**

Open a project's contract. Write says `compiles`, Simulate counts the
scenarios, Test says `no tests` or a count, Deploy says `—` with a tooltip
about connecting a wallet. Introduce a syntax error: Write turns to `1 error`
in `--mag`, and Deploy dims.

- [ ] **Step 2: It stays put**

Move between the contract, a test file, a scenario and the `.asm`. The rail
does not change its facts — it describes the project, not the cursor. The cell
of the file you are on is marked.

- [ ] **Step 3: Staleness**

Run a test file to green, so Test reads `12 green`. Edit the test file. The
cell drops to `—` rather than keeping the old number. Edit the *contract*
instead: the same thing happens, because a test result depends on both.

- [ ] **Step 4: Navigation**

Each cell navigates. Simulate opens the debugger as a page with a working back
button; the header says `scenario · …`. In a test file, Debug this test still
opens in place and says `recording · …`.

- [ ] **Step 5: Deploy**

With no wallet, the cell is `—` and the destination is barred while the source
has errors. Connect a wallet: the cell asks, then answers. Deploy a contract
and check the count rises; deploy the same code twice and confirm it reads
`2 · 2 yours`.

- [ ] **Step 6: The assembler**

Open the `.asm`: code on the left, size/registers/pages on the right, both
readable at once, drag handle between them. No tab bar, no Deployment tab.

- [ ] **Step 7: Heights**

No editor scrolls the page instead of itself, at any window size, on every
surface — contract, test, scenario, assembler, simulate, deploy.

- [ ] **Step 8: Narrow window**

Shrink below the `lg` breakpoint: the facts disappear, the four labels stay,
navigation still works.

- [ ] **Step 9: One contract**

In a project that has a contract, the New File dialog does not offer SmartC.
Import a ZIP holding two contracts: one arrives, one is reported skipped.

- [ ] **Step 10: Commit any fixes**

```bash
git add apps/studio/src
git commit -m "fix(studio): browser pass on the workflow rail"
```

---

## Done criteria

- Four cells, each reporting a fact, never a stale one
- Simulate and Deploy are routes; `isDebugging` is gone
- The two stepping sessions name their source
- Deployment count comes from the chain, capped at `9+`, never stored
- One panel idiom; no `calc(100vh − containerTop)` left in the tree
- A project admits one contract, in the dialog and on import
- `bun test` green, `bun run build` succeeds, browser pass done

## What comes next

Phase 2B: keyboard control — the Ctrl+Tab switcher over `fs.recents`, a command
palette, and shortcuts for the four destinations the rail now defines.
