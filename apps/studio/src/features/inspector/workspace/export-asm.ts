import { replaceWhitespace } from "@/lib/string";
import { uniqueName } from "@/features/project/file-naming";
import { FileTypes } from "@/features/project/filetype-icons";

/** Exports land beside the watchlist as an ordinary `.asm` file — editable, assemblable, never deployed from here. */

const EXT = ".asm";

export function asmFileName(base: string, contractId: string, taken: string[]): string {
  const safe = replaceWhitespace(base.trim() || "contract").replace(/[\\/:*?"<>|]/g, "_"); // i18n-ignore
  return uniqueName(`${safe}-${contractId}${EXT}`, taken, EXT);
}

export async function exportAsm(
  fs: {
    listFolderContents(folderId?: string): { files: { metadata: { name: string } }[] };
    addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
  },
  folderId: string,
  base: string,
  contractId: string,
  asm: string,
): Promise<{ fileId: string; name: string }> {
  const taken = fs.listFolderContents(folderId).files.map((f) => f.metadata.name);
  const name = asmFileName(base, contractId, taken);
  const fileId = await fs.addFile(folderId, name, FileTypes.ASM, asm);
  return { fileId, name };
}
