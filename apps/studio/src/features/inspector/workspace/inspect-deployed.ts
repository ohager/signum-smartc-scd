import { FileTypes } from "@/features/project/filetype-icons";
import { generateLabels } from "../compiler/label-generator";
import { emptyLabelMap, parseLabelMap } from "../model/label-map";
import { applyMerge, mergeGenerated } from "../model/merge-labels";
import { networkKey, type Network } from "../model/networks";
import { addContracts, emptyWatchlist } from "../model/watchlist";
import { updateFileText } from "./update-file";

/**
 * "Inspect" after a deploy: the Label Map is generated beside the source it
 * came from, and the new contract joins the project's `deployments.inspect.json`.
 * Both files are complementary to the project, not a separate one — the next
 * deploy extends the same two.
 */

export interface InspectFs {
  getFileMetadata(id: string): { name: string; folderId: string } | null;
  listFolderContents(folderId?: string): { files: { metadata: { id: string; name: string } }[] };
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
  loadFile<T>(id: string): Promise<{ content: T }>;
  saveFile<T>(id: string, content: T): Promise<void>;
}

const WATCHLIST = "deployments.inspect.json"; // i18n-ignore

async function findOrCreate(
  fs: InspectFs,
  folderId: string,
  name: string,
  type: string,
  initial: () => string,
): Promise<string> {
  const existing = fs.listFolderContents(folderId).files.find((f) => f.metadata.name === name);
  return existing ? existing.metadata.id : fs.addFile(folderId, name, type, initial());
}

export async function inspectDeployed(
  fs: InspectFs,
  args: { projectFolderId: string; sourceFileId: string; contractId: string; network: Network; now?: Date },
): Promise<{ watchlistId: string }> {
  const meta = fs.getFileMetadata(args.sourceFileId);
  if (!meta) throw new Error(`Source not found: ${args.sourceFileId}`);
  const base = meta.name.replace(/\.smart\.c$/i, "");
  const network = networkKey(args.network);

  const { content } = await fs.loadFile<string>(args.sourceFileId);
  const generated = generateLabels(content ?? "");
  if (generated.ok) {
    const labelsId = await findOrCreate(fs, meta.folderId, `${base}.labels.json`, FileTypes.LabelMap, () =>
      emptyLabelMap(base),
    );
    await updateFileText(fs, labelsId, (text) => {
      const current = parseLabelMap(text);
      if (!current.ok) return text; // never rewrite a file the user broke by hand
      const { map } = mergeGenerated(current.value, generated.labels, {
        sourceFile: meta.name,
        now: args.now ?? new Date(),
        network,
      });
      return applyMerge(text, map);
    });
  }

  const watchlistId = await findOrCreate(fs, args.projectFolderId, WATCHLIST, FileTypes.Watchlist, emptyWatchlist);
  await updateFileText(fs, watchlistId, (text) => addContracts(text, [{ id: args.contractId, network: args.network }]));
  return { watchlistId };
}
