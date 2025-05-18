import { openDB, type IDBPDatabase } from "idb";
import type {
  FileSystemEvent,
  FileMetadata,
  FolderMetadata,
  FileSystemEventType,
  File
} from "./file-system-types.ts";

// Constants
const LS_METADATA_KEY = "scd:fs-metadata";
const DB_NAME = "signum-studio-scd";
const DB_VERSION = 1;

enum IdbStores {
  FileContent = "fs-content",
}

// Type for the metadata structure stored in localStorage
interface FileSystemMetadata {
  files: Record<string, FileMetadata>;
  folders: Record<string, FolderMetadata>;
  folderContents: Record<
    string,
    {
      files: string[];
      folders: string[];
    }
  >;
  rootFolder: string;
}

/**
 * Class representing a browser-based file system.
 */
export class FileSystem extends EventTarget {
  static instance = new FileSystem();

  /**
   * Retrieves the singleton instance of the FileSystem class.
   * Ensures that only one instance of the FileSystem class is created and reused.
   *
   * @template T The type parameter for the FileSystem instance.
   * @return {FileSystem<T>} The singleton instance of the FileSystem class.
   */
  static getInstance(): FileSystem {
    if (!FileSystem.instance) {
      FileSystem.instance = new FileSystem();
    }
    return FileSystem.instance;
  }

  private db: IDBPDatabase | null = null;
  private readonly metadata: FileSystemMetadata;

  private constructor() {
    super();
    const storedMetadata = localStorage.getItem(LS_METADATA_KEY);

    if (storedMetadata) {
      this.metadata = JSON.parse(storedMetadata);
    } else {
      // Create initial structure with root folder
      const rootFolderId = this.generateId();

      this.metadata = {
        files: {},
        folders: {
          [rootFolderId]: {
            id: rootFolderId,
            name: "@@Root",
            path: "/",
            createdAt: Date.now(),
            lastModified: Date.now()
          }
        },
        folderContents: {
          [rootFolderId]: {
            files: [],
            folders: []
          }
        },
        rootFolder: rootFolderId
      };

      this.saveMetadata();
    }
  }

  // Event handling methods
  addEventListener(
    eventType: FileSystemEventType,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(eventType, listener, options);
  }

  removeEventListener(
    eventType: FileSystemEventType,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(eventType, listener, options);
  }

  private emitEvent(event: FileSystemEvent): void {
    // Create a custom event
    const payload = {
      detail: event,
      bubbles: false,
      cancelable: false
    }

    const customEvent = new CustomEvent<FileSystemEvent>(event.type, payload);
    super.dispatchEvent(customEvent);

    // Also dispatch to wildcard listeners if it's not already a wildcard event
    if (event.type !== "file:*" && event.type.startsWith("file:")) {
      const wildcardEvent = new CustomEvent<FileSystemEvent>("file:*", payload);
      super.dispatchEvent(wildcardEvent);
    }

    if (event.type !== "folder:*" && event.type.startsWith("folder:")) {
      const wildcardEvent = new CustomEvent<FileSystemEvent>("folder:*", payload);
      super.dispatchEvent(wildcardEvent);
    }
  }

  private async initDb(): Promise<IDBPDatabase> {
    if (this.db) return this.db;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IdbStores.FileContent)) {
          db.createObjectStore(IdbStores.FileContent);
        }
      }
    });

    return this.db;
  }

  private saveMetadata(): void {
    localStorage.setItem(LS_METADATA_KEY, JSON.stringify(this.metadata));
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Loads a file based on the provided file ID and retrieves its content and metadata.
   *
   * @param {string} fileId - The unique identifier of the file to load.
   * @return {Promise<File<T>>} A promise that resolves with the file's content and metadata.
   * @throws {Error} Throws an error if the file metadata is not found.
   */
  async loadFile<T>(fileId: string): Promise<File<T>> {
    const fileMetadata = this.metadata.files[fileId];
    if (!fileMetadata) {
      throw new Error(`File not found: ${fileId}`);
    }

    const db = await this.initDb();
    const content = (await db.get(IdbStores.FileContent, fileId)) as T;

    return {
      content,
      metadata: fileMetadata
    };
  }

  /**
   * Checks if a file with the given identifier exists in the metadata.
   *
   * @param {string} fileId - The unique identifier of the file to check.
   * @return {boolean} True if the file exists, otherwise false.
   */
  exists(fileId: string): boolean {
    return !!this.metadata.files[fileId];
  }

  /**
   * Checks if the given path exists in the folderContents metadata.
   *
   * @param {string} path - The file path to check for existence.
   * @return {boolean} Returns true if the path exists, otherwise false.
   */
  existPath(path: string): boolean {
    for (const contents of Object.values(
      this.metadata.folderContents
    )) {
      if (contents.files.includes(path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Saves the file content and updates the metadata for the specified file.
   *
   * @param {string} fileId - The identifier of the file to be saved.
   * @param {T} content - The content to be saved for the specified file.
   * @return {Promise<void>} A promise that resolves once the file has been successfully saved.
   * @throws {Error} If the file with the given fileId does not exist in the metadata.
   */
  async saveFile<T>(fileId: string, content: T): Promise<void> {
    if (!this.metadata.files[fileId]) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Update content in IndexedDB
    const db = await this.initDb();
    await db.put(IdbStores.FileContent, content, fileId);

    // Update metadata
    this.metadata.files[fileId].lastModified = Date.now();
    this.saveMetadata();

    this.emitEvent({
      type: "file:updated",
      id: fileId,
      metadata: this.metadata.files[fileId]
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    const fileMetadata = this.metadata.files[fileId];
    if (!fileMetadata) {
      throw new Error(`File not found: ${fileId}`);
    }

    // Find the folder containing this file
    let parentFolderId: string | null = null;

    for (const [folderId, contents] of Object.entries(
      this.metadata.folderContents
    )) {
      if (contents.files.includes(fileId)) {
        parentFolderId = folderId;
        break;
      }
    }

    if (!parentFolderId) {
      throw new Error(`File not associated with any folder: ${fileId}`);
    }

    const metadata = { ...fileMetadata };

    // Delete from IndexedDB
    const db = await this.initDb();
    await db.delete(IdbStores.FileContent, fileId);

    // Update metadata
    delete this.metadata.files[fileId];
    this.metadata.folderContents[parentFolderId].files =
      this.metadata.folderContents[parentFolderId].files.filter(
        (id) => id !== fileId
      );

    this.emitEvent({
      type: "file:deleted",
      id: fileId,
      metadata
    });

    this.saveMetadata();
  }

  /**
   * Adds a new file to the specified folder.
   *
   * @param {string} folderId - The ID of the folder where the file should be added.
   * @param {string} name - The name of the file to be added.
   * @param {string} type - The type name of the file to be added.
   * @param {T} content - The content of the file to be stored.
   * @return {Promise<string>} A promise that resolves to the ID of the newly created file.
   * @throws {Error} If the specified folder ID does not exist.
   */
  async addFile<T>(
    folderId: string,
    name: string,
    type: string,
    content: T
  ): Promise<string> {
    if (!this.metadata.folders[folderId]) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    // Generate a new file ID
    const fileId = this.generateId();
    const folderPath = this.metadata.folders[folderId].path;
    const filePath = `${folderPath === "/" ? "" : folderPath}/${name}`;

    // Add file metadata
    this.metadata.files[fileId] = {
      id: fileId,
      name,
      type,
      path: filePath,
      lastModified: Date.now()
    };

    // Add to folder contents
    this.metadata.folderContents[folderId].files.push(fileId);
    this.saveMetadata();

    // Save content to IndexedDB
    const db = await this.initDb();
    await db.put(IdbStores.FileContent, content, fileId);

    this.emitEvent({
      type: "file:added",
      id: fileId,
      metadata: this.metadata.files[fileId],
      relatedId: folderId
    });

    return fileId;
  }

  // Folder operations
  /**
   * Creates a new folder within the specified parent path.
   *
   * @param {string} parentPath - The path of the parent folder where the new folder will be created. Use '/' for the root folder.
   * @param {string} name - The name of the new folder to be created.
   * @return {Promise<string>} - A promise that resolves with the unique ID of the newly created folder.
   * @throws {Error} - Throws an error if the parent folder specified by `parentPath` is not found.
   */
  async createFolder(parentPath: string, name: string): Promise<string> {
    // Find parent folder ID from path
    let parentFolderId: string | null = null;

    for (const [folderId, metadata] of Object.entries(this.metadata.folders)) {
      if (metadata.path === parentPath) {
        parentFolderId = folderId;
        break;
      }
    }

    if (!parentFolderId && parentPath !== "/") {
      throw new Error(`Parent folder not found: ${parentPath}`);
    }

    if (parentPath === "/") {
      parentFolderId = this.metadata.rootFolder;
    }

    // Generate a new folder ID
    const folderId = this.generateId();
    const folderPath = `${parentPath === "/" ? "" : parentPath}/${name}`;

    // Add folder metadata
    this.metadata.folders[folderId] = {
      id: folderId,
      name,
      path: folderPath,
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    // Initialize folder contents
    this.metadata.folderContents[folderId] = {
      files: [],
      folders: []
    };

    // Add to parent folder contents
    if (parentFolderId) {
      this.metadata.folderContents[parentFolderId].folders.push(folderId);
    }

    this.saveMetadata();

    this.emitEvent({
      type: "folder:created",
      id: folderId,
      metadata: this.metadata.folders[folderId],
      relatedId: parentFolderId || undefined
    });

    return folderId;
  }

  /**
   * Deletes a folder specified by its unique identifier. If the folder is not found or if the folder
   * is the root folder, an error will be thrown. This method performs a recursive deletion of all
   * contents within the folder and updates the folder's parent metadata accordingly.
   *
   * @param {string} folderId - The unique identifier of the folder to be deleted.
   * @return {Promise<void>} Resolves when the folder has been successfully deleted, or rejects with an error if the operation fails.
   */
  async deleteFolder(folderId: string): Promise<void> {
    if (!this.metadata.folders[folderId]) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    if (folderId === this.metadata.rootFolder) {
      throw new Error("Cannot delete root folder");
    }

    const metadata = { ...this.metadata.folders[folderId] };

    // Find and update parent folder
    let parentFolderId: string | null = null;

    for (const [fId, contents] of Object.entries(
      this.metadata.folderContents
    )) {
      if (contents.folders.includes(folderId)) {
        parentFolderId = fId;
        break;
      }
    }

    // Recursively delete folder contents
    await this.recursiveDeleteFolder(folderId);

    if (parentFolderId) {
      // Remove from parent folder contents
      this.metadata.folderContents[parentFolderId].folders =
        this.metadata.folderContents[parentFolderId].folders.filter(
          (id) => id !== folderId
        );
    }

    this.saveMetadata();

    this.emitEvent({
      type: "folder:deleted",
      id: folderId,
      metadata,
      relatedId: parentFolderId || undefined
    });
  }

  private async recursiveDeleteFolder(folderId: string): Promise<void> {
    const contents = this.metadata.folderContents[folderId];

    // Delete all files in this folder and emit events for each
    const db = await this.initDb();
    for (const fileId of contents.files) {
      const metadata = { ...this.metadata.files[fileId] };
      await db.delete(IdbStores.FileContent, fileId);
      delete this.metadata.files[fileId];

      this.emitEvent({
        type: "file:deleted",
        id: fileId,
        metadata,
        relatedId: folderId
      });
    }

    // Recursively delete all subfolders
    for (const subFolderId of contents.folders) {
      await this.recursiveDeleteFolder(subFolderId);
    }

    // Delete folder metadata
    delete this.metadata.folders[folderId];
    delete this.metadata.folderContents[folderId];
  }

  /**
   * Renames a folder identified by its folderId to a new name.
   *
   * @param {string} folderId - The unique identifier of the folder to be renamed.
   * @param {string} newName - The new name for the folder.
   * @return {Promise<void>} A promise that resolves when the folder renaming operation is complete or rejects if an error occurs.
   */
  async renameFolder(folderId: string, newName: string): Promise<void> {
    if (!this.metadata.folders[folderId]) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    if (folderId === this.metadata.rootFolder) {
      throw new Error("Cannot rename root folder");
    }

    const oldPath = this.metadata.folders[folderId].path;
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf("/"));
    const newPath = `${parentPath}/${newName}`;

    // Update folder path
    this.metadata.folders[folderId].name = newName;
    this.metadata.folders[folderId].path = newPath;
    this.metadata.folders[folderId].lastModified = Date.now();

    // Update paths of all files and subfolders
    await this.updatePathsRecursively(folderId, oldPath, newPath);

    this.saveMetadata();

    this.emitEvent({
      type: "folder:renamed",
      id: folderId,
      metadata: this.metadata.folders[folderId]
    });
  }

  private async updatePathsRecursively(
    folderId: string,
    oldBasePath: string,
    newBasePath: string
  ): Promise<void> {
    const contents = this.metadata.folderContents[folderId];

    // Update file paths
    for (const fileId of contents.files) {
      const fileMeta = this.metadata.files[fileId];
      fileMeta.path = fileMeta.path.replace(oldBasePath, newBasePath);
    }

    // Update subfolder paths
    for (const subFolderId of contents.folders) {
      const folderMeta = this.metadata.folders[subFolderId];
      const oldSubPath = folderMeta.path;
      const newSubPath = oldSubPath.replace(oldBasePath, newBasePath);

      folderMeta.path = newSubPath;

      // Recursive update for subfolders
      await this.updatePathsRecursively(subFolderId, oldSubPath, newSubPath);
    }
  }

  /**
   * Moves a file from its current folder to a target folder within the file system metadata.
   *
   * @param {string} fileId - The unique identifier of the file to be moved.
   * @param {string} targetFolderId - The unique identifier of the target folder where the file should be moved.
   * @return {Promise<void>} Resolves when the file has been successfully moved, or throws an error
   * if the file, target folder, or source folder cannot be found.
   */
  async moveFile(fileId: string, targetFolderId: string): Promise<void> {
    if (!this.metadata.files[fileId]) {
      throw new Error(`File not found: ${fileId}`);
    }

    if (!this.metadata.folders[targetFolderId]) {
      throw new Error(`Target folder not found: ${targetFolderId}`);
    }

    // Find current parent folder
    let sourceFolderId: string | null = null;

    for (const [folderId, contents] of Object.entries(
      this.metadata.folderContents
    )) {
      if (contents.files.includes(fileId)) {
        sourceFolderId = folderId;
        break;
      }
    }

    if (!sourceFolderId) {
      throw new Error(`File not associated with any folder: ${fileId}`);
    }

    if (sourceFolderId === targetFolderId) {
      return; // Already in the target folder
    }

    // Update file path
    const fileName = this.metadata.files[fileId].name;
    const targetFolderPath = this.metadata.folders[targetFolderId].path;
    this.metadata.files[fileId].path =
      `${targetFolderPath === "/" ? "" : targetFolderPath}/${fileName}`;
    this.metadata.files[fileId].lastModified = Date.now();

    // Remove from source folder
    this.metadata.folderContents[sourceFolderId].files =
      this.metadata.folderContents[sourceFolderId].files.filter(
        (id) => id !== fileId
      );

    // Add to target folder
    this.metadata.folderContents[targetFolderId].files.push(fileId);

    this.saveMetadata();

    this.emitEvent({
      type: "file:moved",
      id: fileId,
      metadata: this.metadata.files[fileId],
      relatedId: targetFolderId
    });
  }

  // Browsing operations
  /**
   * Retrieves the contents of a specified folder, including both subfolders and files.
   *
   * @param {string} folderId - The unique identifier of the folder whose contents are to be listed.
   * @return {Promise<{folders: {id: string, metadata: FolderMetadata}[], files: {id: string, metadata: FileMetadata}[]}>}
   * A promise that resolves to an object containing two arrays:
   * - `folders`: An array of objects, each representing a subfolder with its `id` and `metadata`.
   * - `files`: An array of objects, each representing a file with its `id` and `metadata`.
   *
   * @throws {Error} If the folder with the specified `folderId` is not found.
   */
  listFolderContents(folderId?: string): {
    folders: { id: string; metadata: FolderMetadata }[];
    files: { id: string; metadata: FileMetadata }[];
  } {

    const folderIdToUse = folderId ?? this.metadata.rootFolder;

    if (!this.metadata.folderContents[folderIdToUse]) {
      throw new Error(`Folder not found: ${folderIdToUse}`);
    }

    const contents = this.metadata.folderContents[folderIdToUse];

    return {
      folders: contents.folders.map((id) => ({
        id,
        metadata: this.metadata.folders[id]
      })),
      files: contents.files.map((id) => ({
        id,
        metadata: this.metadata.files[id]
      }))
    };
  }

  /**
   * Retrieves the metadata of a folder by its ID.
   *
   * @param {string} folderId - The unique identifier of the folder to retrieve.
   * @return {Promise<{metadata: FolderMetadata}>} A promise resolving to an object containing the folder's metadata.
   * @throws {Error} If the folder with the specified ID is not found.
   */
  getFolder(folderId: string): FolderMetadata {
    if (!this.metadata.folders[folderId]) {
      throw new Error(`Folder not found: ${folderId}`);
    }
    return this.metadata.folders[folderId];
  };

}
