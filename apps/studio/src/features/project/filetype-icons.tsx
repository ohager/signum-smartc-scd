import {
  CodeIcon,
  FileJsonIcon,
  FileIcon,
  FileTextIcon,
  FileBadgeIcon, MicrochipIcon, FileJson2Icon, FileCode2Icon, FileCog2Icon, FileDigitIcon
} from "lucide-react";

export enum FileTypes {
  SmartC = "smartc",
  SCD = "scd",
  Test = "test",
  Doc = "doc",
  ASM = "asm",
}

export const FileTypeIcons: Record<FileTypes, any> = {
  [FileTypes.SmartC]: FileCog2Icon,
  [FileTypes.SCD]: FileJson2Icon,
  [FileTypes.Test]: FileBadgeIcon,
  [FileTypes.Doc]: FileTextIcon,
  [FileTypes.ASM]: FileDigitIcon,
};
