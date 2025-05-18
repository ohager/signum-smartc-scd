// import { create } from 'jotai';
import debounce from 'lodash.debounce';
import { type IDBPDatabase } from 'idb';
import type { FileSystem } from "./file-system.ts";

// Generic interface for all editor types
export interface EditorState<T> {
  // The current content in the editor
  content: T;
  // Original content loaded from storage
  originalContent: T;
  // Whether content has been modified
  isDirty: boolean;
  // Validation errors if any
  validationErrors: string[];
  // Loading state
  isLoading: boolean;
  // Metadata about the file
  fileInfo: {
    id: string;
    name: string;
    path: string;
    lastModified: number;
    // Other metadata as needed
  };
}

export type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

export interface EditorStateManager<T> {
  // Initialize with a file ID
  loadFile: (fileId: string) => Promise<void>;

  // Get the current editor state
  getState: () => EditorState<T>;

  // Update content with validation
  updateContent: (content: T) => Promise<void>;

  // Explicitly save content to storage
  saveContent: () => Promise<void>;

  // Register for state changes
  subscribe: (callback: (state: EditorState<T>) => void) => () => void;

  // Validate content
  validate: (content: T) => ValidationResult;

  // Clean up resources
  dispose: () => void;
}

// Factory function to create editor managers
export function createEditorStateManager<T>(
  storageProvider: FileSystem<T>,
  validator: (content: T) => ValidationResult,
  options: {
    autoSaveDelay?: number;
    autoSaveEnabled?: boolean;
  } = {}
): EditorStateManager<T> {
  // Default options
  const {
    autoSaveDelay = 2000,
    autoSaveEnabled = true,
  } = options;

  // Internal state
  let currentState: EditorState<T> = {
    content: null as unknown as T,
    originalContent: null as unknown as T,
    isDirty: false,
    validationErrors: [],
    isLoading: false,
    fileInfo: {
      id: '',
      name: '',
      path: '',
      lastModified: 0,
    },
  };

  // Subscribers
  const subscribers = new Set<(state: EditorState<T>) => void>();

  // Notify subscribers of state changes
  const notifySubscribers = () => {
    subscribers.forEach(callback => callback({ ...currentState }));
  };

  // Update state and notify
  const updateState = (newState: Partial<EditorState<T>>) => {
    currentState = { ...currentState, ...newState };
    notifySubscribers();
  };

  // Debounced auto-save function
  const debouncedSave = debounce(async () => {
    if (currentState.isDirty && currentState.validationErrors.length === 0) {
      try {
        await storageProvider.saveFile(
          currentState.fileInfo.id,
          currentState.content
        );
        updateState({
          isDirty: false,
          originalContent: structuredClone(currentState.content),
          fileInfo: {
            ...currentState.fileInfo,
            lastModified: Date.now(),
          }
        });
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  }, autoSaveDelay);

  return {
    async loadFile(fileId: string) {
      updateState({ isLoading: true });
      try {
        const { content, metadata } = await storageProvider.loadFile(fileId);
        updateState({
          content,
          originalContent: structuredClone(content),
          isDirty: false,
          validationErrors: [],
          isLoading: false,
          fileInfo: {
            id: fileId,
            name: metadata.name,
            path: metadata.path,
            lastModified: metadata.lastModified,
          },
        });
      } catch (error) {
        console.error('Failed to load file:', error);
        updateState({
          isLoading: false,
          validationErrors: ['Failed to load file'],
        });
      }
    },

    getState() {
      return { ...currentState };
    },

    async updateContent(content: T) {
      const validationResult = validator(content);

      updateState({
        content,
        isDirty: true,
        validationErrors: validationResult.errors,
      });

      if (autoSaveEnabled) {
        debouncedSave();
      }
    },

    async saveContent() {
      if (currentState.validationErrors.length > 0) {
        throw new Error('Cannot save invalid content');
      }

      try {
        await storageProvider.saveFile(
          currentState.fileInfo.id,
          currentState.content
        );

        updateState({
          isDirty: false,
          originalContent: structuredClone(currentState.content),
          fileInfo: {
            ...currentState.fileInfo,
            lastModified: Date.now(),
          }
        });
      } catch (error) {
        console.error('Save failed:', error);
        throw error;
      }
    },

    subscribe(callback) {
      subscribers.add(callback);
      callback({ ...currentState });

      return () => {
        subscribers.delete(callback);
      };
    },

    validate(content: T) {
      return validator(content);
    },

    dispose() {
      subscribers.clear();
      debouncedSave.cancel();
    },
  };
}
