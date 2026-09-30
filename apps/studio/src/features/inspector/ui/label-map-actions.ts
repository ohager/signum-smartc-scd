import { replaceWhitespace } from "@/lib/string";
import { uniqueName } from "@/features/project/file-naming";
import { FileTypes } from "@/features/project/filetype-icons";
import { emptyLabelMap } from "../model/label-map";
import { addCodeHash } from "../model/label-map-edits";
import { updateFileText } from "../workspace/update-file";

/** Creating and extending Label Maps from the inspector, where there is a contract but maybe no map yet. */

const EXT = ".labels.json";

export function labelMapFileName(base: string, taken: string[]): string {
  return uniqueName(`${replaceWhitespace(base.trim() || "contract")}${EXT}`, taken, EXT); // i18n-ignore
}

interface CreatingFs {
  listFolderContents(folderId?: string): { files: { metadata: { name: string } }[] };
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
}

export async function createLabelMapFor(
  fs: CreatingFs,
  folderId: string,
  base: string,
  codeHash: string,
  network: string,
): Promise<string> {
  const taken = fs.listFolderContents(folderId).files.map((f) => f.metadata.name);
  const name = labelMapFileName(base, taken);
  return fs.addFile(folderId, name, FileTypes.LabelMap, emptyLabelMap(base, [{ hash: codeHash, network }]));
}

export async function addHashToLabelMap(
  fs: Parameters<typeof updateFileText>[0],
  fileId: string,
  codeHash: string,
  network: string,
): Promise<void> {
  await updateFileText(fs, fileId, (text) => addCodeHash(text, { hash: codeHash, network }));
}
