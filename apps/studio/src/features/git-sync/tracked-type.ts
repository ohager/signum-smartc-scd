import { acceptedFileType, FileTypes } from "@/features/project/filetype-icons";

/** The type a synced file gets in the workspace, or null for names sync does not track. */
export function trackedType(name: string): string | null {
  return acceptedFileType(name) ?? (name.toLowerCase().endsWith(".md") ? FileTypes.Doc : null);
}
