import { AssistantFailure } from "./errors";

/*
 * TEMPORARY (Task 16, ruling P6): the editor tools have no Studio editor to talk to
 * yet. Task 17 replaces this module's import in the runtime with the real
 * implementation, so the swap is one line.
 */
const unavailable = (): never => {
  throw new AssistantFailure("internal", "Editor context is not available yet.");
};

export const editorToolsStub = {
  get_editor_context: unavailable,
  open_file: unavailable,
};
