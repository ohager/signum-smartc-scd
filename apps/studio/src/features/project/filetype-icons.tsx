import {
  CodeIcon,
  FileJsonIcon,
  FileIcon,
  FileTextIcon,
  FileBadgeIcon, MicrochipIcon, FileJson2Icon, FileCode2Icon, FileCog2Icon, FileDigitIcon
} from "lucide-react";

export enum FileType {
  SmartC = "smartc",
  SCD = "scd",
  Test = "test",
  Doc = "doc",
  ASM = "asm",
}

export const FileTypeIcons: Record<FileType, any> = {
  [FileType.SmartC]: FileCog2Icon,
  [FileType.SCD]: FileJson2Icon,
  [FileType.Test]: FileBadgeIcon,
  [FileType.Doc]: FileTextIcon,
  [FileType.ASM]: FileDigitIcon,
};
