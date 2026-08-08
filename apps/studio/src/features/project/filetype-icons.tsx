import {
  FileTextIcon,
  FileBadgeIcon,
  FileCog2Icon,
  FileDigitIcon,
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
