import type { Messages } from "../../runtime";
import common from "./common.json";
import home from "./home.json";
import project from "./project.json";
import workflow from "./workflow.json";
import simulator from "./simulator.json";
import testbed from "./testbed.json";
import smartcEditor from "./smartc-editor.json";
import asmEditor from "./asm-editor.json";

/**
 * English is the source of every key, and the fallback for every locale.
 * The editor documentation is not in here: its English lives in the language
 * definitions and is never looked up at runtime, so bundling it would only
 * weigh down the boot chunk. Tooling uses `./complete` instead.
 */
const en = {
  common,
  home,
  project,
  workflow,
  simulator,
  testbed,
  "smartc-editor": smartcEditor,
  "asm-editor": asmEditor,
} satisfies Messages;

export default en;
