import type { Messages } from "../../runtime";
import common from "./common.json";
import home from "./home.json";
import project from "./project.json";
import workflow from "./workflow.json";
import simulator from "./simulator.json";
import testbed from "./testbed.json";
import smartcEditor from "./smartc-editor.json";
import asmEditor from "./asm-editor.json";
import editorDocs from "./editor-docs.json";

/** Português (Brasil). Keys follow `../en`; anything missing falls back to English. */
const messages: Messages = {
  common,
  home,
  project,
  workflow,
  simulator,
  testbed,
  "smartc-editor": smartcEditor,
  "asm-editor": asmEditor,
  "editor-docs": editorDocs,
};

export default messages;
