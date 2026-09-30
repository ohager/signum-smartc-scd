import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLabelMap } from "../model/label-map";
import { parseWatchlist } from "../model/watchlist";
import { inspectDeployed } from "./inspect-deployed";

const source = readFileSync(join(import.meta.dir, "../../testbed/__fixtures__/counter.smart.c"), "utf8");

function fakeFs() {
  const files: Record<string, { name: string; folderId: string; content: string }> = {
    src: { name: "counter.smart.c", folderId: "P", content: source },
  };
  let next = 0;
  return {
    files,
    getFileMetadata: (id: string) => files[id] ?? null,
    listFolderContents: (folderId?: string) => ({
      files: Object.entries(files)
        .filter(([, f]) => f.folderId === folderId)
        .map(([id, f]) => ({ metadata: { id, name: f.name } })),
    }),
    addFile: async <T,>(folderId: string, name: string, _t: string, content: T) => {
      const id = `n${next++}`;
      files[id] = { name, folderId, content: content as string };
      return id;
    },
    loadFile: async <T,>(id: string) => ({ content: files[id]!.content as T }),
    saveFile: async <T,>(id: string, content: T) => void (files[id]!.content = content as string),
  };
}

describe("inspectDeployed", () => {
  it("creates labels and watchlist next to the source, and reuses them on a second deploy", async () => {
    const fs = fakeFs();
    const args = { projectFolderId: "P", sourceFileId: "src", network: "testnet" as const };
    const first = await inspectDeployed(fs, { ...args, contractId: "111" });
    const second = await inspectDeployed(fs, { ...args, contractId: "222" });
    expect(second.watchlistId).toBe(first.watchlistId);

    const names = Object.values(fs.files).map((f) => f.name).sort();
    expect(names).toEqual(["counter.labels.json", "counter.smart.c", "deployments.inspect.json"]);

    const labels = parseLabelMap(Object.values(fs.files).find((f) => f.name === "counter.labels.json")!.content);
    expect(labels.ok && labels.value.slots.length).toBeGreaterThan(0);
    expect(labels.ok && labels.value.codeHashes[0]!.network).toBe("testnet");

    const list = parseWatchlist(fs.files[first.watchlistId]!.content);
    expect(list.ok && list.value.contracts.map((c) => c.id)).toEqual(["111", "222"]);
  });
});
