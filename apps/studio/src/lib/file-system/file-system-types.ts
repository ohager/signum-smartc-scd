export interface FolderMetadata {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  lastModified: number;
}

export interface FileMetadata {
  id: string;
  folderId: string;
  name: string;
  path: string;
  lastModified: number;
  type: string;
}

export type FileSystemEventType =
  | "file:*"
  | "file:added"
  | "file:deleted"
  | "file:updated"
  | "file:renamed"
  | "file:moved"
  | "folder:*"
  | "folder:created"
  | "folder:deleted"
  | "folder:renamed"
  /** The whole workspace was replaced by one another tab wrote. */
  | "fs:reloaded";

export interface FileSystemEvent {
  type: FileSystemEventType;
  id: string;
  metadata?: FileMetadata | FolderMetadata;
  relatedId?: string; // For moves, containing the target folder ID
}

export interface File<T = unknown> {
  content: T;
  metadata: FileMetadata;
}
