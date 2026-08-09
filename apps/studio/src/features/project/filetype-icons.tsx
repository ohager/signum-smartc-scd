import {
  FileTextIcon,
  FileBadgeIcon,
  FileCog2Icon,
  FileDigitIcon,
  FileIcon,
} from "lucide-react";

export enum FileTypes {
  SmartC = "smartc",
  Test = "test",
  Doc = "doc",
  ASM = "asm",
}

export const FileTypeIcons: Record<FileTypes, any> = {
  [FileTypes.SmartC]: FileCog2Icon,
  [FileTypes.Test]: FileBadgeIcon,
  [FileTypes.Doc]: FileTextIcon,
  [FileTypes.ASM]: FileDigitIcon,
};

/**
 * Resolves the icon for a file type, falling back to a generic file icon for
 * legacy/unknown types (e.g. deprecated "scd" files still present in saved
 * projects) so the UI never renders `undefined`.
 */
export function getFileTypeIcon(type: string) {
  return FileTypeIcons[type as FileTypes] ?? FileIcon;
}
