import {
  FileTextIcon,
  FileBadgeIcon,
  FileCog2Icon,
  FileDigitIcon,
  FileIcon,
  PlayIcon,
} from "lucide-react";

export enum FileTypes {
  SmartC = "smartc",
  Scenario = "scenario",
  Test = "test",
  Doc = "doc",
  ASM = "asm",
}

export const FileTypeIcons: Record<FileTypes, any> = {
  [FileTypes.SmartC]: FileCog2Icon,
  [FileTypes.Scenario]: PlayIcon,
  [FileTypes.Test]: FileBadgeIcon,
  [FileTypes.Doc]: FileTextIcon,
  [FileTypes.ASM]: FileDigitIcon,
};

/**
 * Resolves the icon for a file type, falling back to a generic file icon for
 * legacy/unknown types so the UI never renders `undefined`.
 */
export function getFileTypeIcon(type: string) {
  return FileTypeIcons[type as FileTypes] ?? FileIcon;
}

/**
 * Maps an incoming file name to the UI-supported type, or `null` to reject it.
 * Used as the `resolveType` policy for uploads/imports. Accepted: SmartC
 * (`.smart.c`), Scenario (`.scenario.json`), ASM (`.asm`), and Test
 * (`.ts` — both `.test.ts` run entries and the plain `.ts` helpers they
 * import, such as `context.ts` or `scenarios.ts`).
 */
export function acceptedFileType(name: string): FileTypes | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".smart.c")) return FileTypes.SmartC;
  if (lower.endsWith(".scenario.json")) return FileTypes.Scenario;
  if (lower.endsWith(".asm")) return FileTypes.ASM;
  // `.test.ts` files are run; plain `.ts` files are helpers they import.
  if (lower.endsWith(".ts")) return FileTypes.Test;
  return null;
}
