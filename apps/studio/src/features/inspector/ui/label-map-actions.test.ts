import { describe, expect, it } from "bun:test";
import { parseLabelMap } from "../model/label-map";
import { addHashToLabelMap, createLabelMapFor, labelMapFileName } from "./label-map-actions";

function fakeFs() {
  const store: Record<string, string> = {};
  const names: Record<string, string> = {};
  return {
    store,
    listFolderContents: () => ({ files: Object.keys(store).map((id) => ({ metadata: { name: names[id]! } })), folders: [] }),
    addFile: async <T,>(_folder: string, name: string, _type: string, content: T) => {
      const id = `f${Object.keys(store).length}`;
      store[id] = content as string;
      names[id] = name;
      return id;
    },
    loadFile: async <T,>(id: string) => ({ content: store[id] as T }),
    saveFile: async <T,>(id: string, content: T) => void (store[id] = content as string),
  };
}

describe("label map actions", () => {
  it("names files uniquely", () => {
    expect(labelMapFileName("NFT Market", [])).toBe("NFT-Market.labels.json");
    expect(labelMapFileName("x", ["x.labels.json"])).not.toBe("x.labels.json");
  });

  it("creates a map for a hash and adds hashes once", async () => {
    const fs = fakeFs();
    const id = await createLabelMapFor(fs, "folder", "Market", "77", "testnet");
    await addHashToLabelMap(fs, id, "88", "mainnet");
    await addHashToLabelMap(fs, id, "88", "mainnet");
    const r = parseLabelMap(fs.store[id]!);
    expect(r.ok && r.value.codeHashes).toEqual([
      { hash: "77", network: "testnet" },
      { hash: "88", network: "mainnet" },
    ]);
  });
});
