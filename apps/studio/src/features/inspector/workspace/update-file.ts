/**
 * Read–edit–write for a file that is not the one open in the editor, such as
 * the Label Map a "Set label" click writes to while the watchlist is open.
 */
export async function updateFileText(
  fs: {
    loadFile<T>(id: string): Promise<{ content: T }>;
    saveFile<T>(id: string, content: T): Promise<void>;
  },
  fileId: string,
  edit: (text: string) => string,
): Promise<string> {
  const { content } = await fs.loadFile<string>(fileId);
  const before = typeof content === "string" ? content : "";
  const after = edit(before);
  if (after !== before) await fs.saveFile(fileId, after);
  return after;
}
