import type { Messages } from "../../runtime";
import en from "./index";
import editorDocs from "./editor-docs.json";

/** Every English message, editor documentation included — for tests and scripts, never the app. */
const complete = { ...en, "editor-docs": editorDocs } satisfies Messages;

export default complete;
