import { describe, it, expect, beforeEach } from "bun:test";
import { MemoryCheckpointStore, captureProject, type Checkpoint, type CheckpointFile } from "../rounds/checkpoints";
import type { Clock } from "../rounds/round-tracker";
import { createTestFs } from "../tools/test-fs";
import { loadRoundDiff, restoreRound, undoRestore, type RestoreDeps } from "./restore-round";
import type { FileSystem } from "@/lib/file-system/file-system";

const clock: Clock = { now: () => 5, setTimeout: () => 0, clearTimeout: () => {} };

let fs: FileSystem;
let store: MemoryCheckpointStore;
let p: string;
let rounds: Map<string, { projectId: string; checkpointId: string }>;
let endSnapshots: Map<string, CheckpointFile[]>;
let running: Set<string>;
let newerRunning: boolean;
let order: string[];
let deps: RestoreDeps;

async function read(path: string) {
  const id = fs.getFileIdByPath(path);
  return id ? (await fs.loadFile<string>(id)).content : undefined;
}

/* Plays a round: checkpoint, agent edits, end snapshot. */
async function playRound(roundId: string, edit: () => Promise<void>, ended = true) {
  const cp: Checkpoint = { id: `cp-${roundId}`, projectId: p, createdAt: 1, reason: "round-start", files: await captureProject(fs, p) };
  await store.put(cp);
  rounds.set(roundId, { projectId: p, checkpointId: cp.id });
  await edit();
  if (ended) endSnapshots.set(roundId, await captureProject(fs, p));
  else running.add(roundId);
}

beforeEach(async () => {
  ({ fs } = createTestFs());
  store = new MemoryCheckpointStore();
  p = await fs.createFolder(fs.rootFolderId, "p");
  rounds = new Map();
  endSnapshots = new Map();
  running = new Set();
  newerRunning = false;
  order = [];
  deps = {
    fs,
    store,
    clock,
    checkpointOf: (id) => rounds.get(id),
    endSnapshotOf: (id) => {
      order.push("endSnapshotOf");
      return endSnapshots.get(id);
    },
    hasActiveRound: (projectId) => newerRunning || [...running].some((id) => rounds.get(id)?.projectId === projectId),
    markTookOver: (projectId) => {
      order.push(`markTookOver:${projectId === p ? "p" : projectId}`);
    },
    takeOver: async (projectId) => {
      order.push(`takeOver:${await read("/p/a.smart.c")}`);
      newerRunning = false;
      for (const id of [...running]) {
        if (rounds.get(id)?.projectId === projectId) {
          endSnapshots.set(id, await captureProject(fs, projectId));
          running.delete(id);
        }
      }
    },
  };
  await fs.addFile(p, "a.smart.c", "smartc", "original");
  await fs.addFile(p, "gone.ts", "ts", "keep me");
});

describe("restoreRound", () => {
  it("returns the project to its pre-round state and offers undo", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
      await fs.deleteFile(fs.getFileIdByPath("/p/gone.ts")!);
      await fs.addFile(p, "new.ts", "ts", "created");
    });
    const plan = await restoreRound(deps, "r1");
    expect(plan.needsConfirm).toEqual([]);
    const { undoCheckpointId } = await plan.confirm();
    expect(await read("/p/a.smart.c")).toBe("original");
    expect(await read("/p/gone.ts")).toBe("keep me");
    expect(await read("/p/new.ts")).toBeUndefined();

    await undoRestore(deps, undoCheckpointId);
    expect(await read("/p/a.smart.c")).toBe("agent");
    expect(await read("/p/gone.ts")).toBeUndefined();
    expect(await read("/p/new.ts")).toBe("created");
  });

  it("names files the user changed after the round", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    await fs.saveFile(fs.getFileIdByPath("/p/gone.ts")!, "user edit");
    const plan = await restoreRound(deps, "r1");
    expect(plan.needsConfirm).toEqual(["gone.ts"]);
    await plan.confirm();
    expect(await read("/p/gone.ts")).toBe("keep me");
  });

  it("changes nothing until confirm is called", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    await restoreRound(deps, "r1");
    expect(await read("/p/a.smart.c")).toBe("agent");
  });

  it("takes over a running round before reading its end snapshot", async () => {
    await playRound(
      "r1",
      async () => {
        await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
      },
      false,
    );
    const plan = await restoreRound(deps, "r1");
    expect(order).toEqual(["takeOver:agent", "endSnapshotOf"]);
    expect(plan.needsConfirm).toEqual([]);
    await plan.confirm();
    expect(await read("/p/a.smart.c")).toBe("original");
  });

  it("takes over a newer live round on the same project before restoring an older one", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    newerRunning = true;
    const plan = await restoreRound(deps, "r1");
    expect(order).toEqual(["takeOver:agent", "endSnapshotOf"]);
    await plan.confirm();
    expect(await read("/p/a.smart.c")).toBe("original");
  });

  it("does not take over a round that already ended", async () => {
    await playRound("r1", async () => {});
    await restoreRound(deps, "r1");
    expect(order).toEqual(["endSnapshotOf"]);
  });

  it("re-checks at confirm: a round that started after the plan is taken over before any write", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    const plan = await restoreRound(deps, "r1");
    newerRunning = true;
    order = [];
    await plan.confirm();
    expect(order).toEqual(["takeOver:agent", "markTookOver:p"]);
    expect(await read("/p/a.smart.c")).toBe("original");
  });

  it("marks the project took-over after a restore so the agent's next write must re-read", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    const plan = await restoreRound(deps, "r1");
    order = [];
    await plan.confirm();
    expect(order).toEqual(["markTookOver:p"]);
  });

  it("fails clearly when the round or its checkpoint is unknown", async () => {
    await expect(restoreRound(deps, "nope")).rejects.toThrow();
    rounds.set("r2", { projectId: p, checkpointId: "missing" });
    endSnapshots.set("r2", []);
    await expect(restoreRound(deps, "r2")).rejects.toThrow();
  });
});

describe("undoRestore", () => {
  async function restored() {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    const { undoCheckpointId } = await (await restoreRound(deps, "r1")).confirm();
    order = [];
    return undoCheckpointId;
  }

  it("checkpoints first, so the undo itself can be undone", async () => {
    const first = await restored();
    const { undoCheckpointId: second } = await undoRestore(deps, first);
    expect(second).not.toBe(first);
    expect(await read("/p/a.smart.c")).toBe("agent");
    const cp = await store.get(second);
    expect(cp?.reason).toBe("before-restore");
    expect(cp?.files.find((f) => f.relPath === "a.smart.c")?.content).toBe("original");

    await undoRestore(deps, second);
    expect(await read("/p/a.smart.c")).toBe("original");
  });

  it("takes over a live round first and marks the project took-over after", async () => {
    const id = await restored();
    newerRunning = true;
    await undoRestore(deps, id);
    expect(order).toEqual(["takeOver:original", "markTookOver:p"]);
    expect(await read("/p/a.smart.c")).toBe("agent");
  });

  it("does not take over when no round is live", async () => {
    const id = await restored();
    await undoRestore(deps, id);
    expect(order).toEqual(["markTookOver:p"]);
  });
});

describe("loadRoundDiff", () => {
  it("returns the checkpoint content and the current content", async () => {
    await playRound("r1", async () => {
      await fs.saveFile(fs.getFileIdByPath("/p/a.smart.c")!, "agent");
    });
    expect(await loadRoundDiff(deps, "cp-r1", p, "a.smart.c")).toEqual({ original: "original", modified: "agent", deleted: false });
  });
  it("uses empty original for a new file and flags deleted files", async () => {
    await playRound("r1", async () => {
      await fs.addFile(p, "new.ts", "ts", "created");
      await fs.deleteFile(fs.getFileIdByPath("/p/gone.ts")!);
    });
    expect(await loadRoundDiff(deps, "cp-r1", p, "new.ts")).toEqual({ original: "", modified: "created", deleted: false });
    expect(await loadRoundDiff(deps, "cp-r1", p, "gone.ts")).toEqual({ original: "keep me", modified: "", deleted: true });
  });
});
