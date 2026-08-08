import type * as Monaco from "monaco-editor";
import { smartcMonarch } from "./monarch";
import { smartcLanguageConfig } from "./language-config";
import { createCompletionProvider } from "./completion-provider";
import { createHoverProvider } from "./hover-provider";
import { createSignatureHelpProvider } from "./signature-help-provider";
import { updateModel, clearModel } from "./symbol-cache";

export const SMARTC_LANGUAGE_ID = "smartc";

let registered = false;
const wired = new WeakSet<Monaco.editor.ITextModel>();

export function registerSmartC(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({
    id: SMARTC_LANGUAGE_ID,
    extensions: [".smart.c"],
    aliases: ["SmartC", "smartc"],
  });
  monaco.languages.setMonarchTokensProvider(SMARTC_LANGUAGE_ID, smartcMonarch);
  monaco.languages.setLanguageConfiguration(SMARTC_LANGUAGE_ID, smartcLanguageConfig);

  monaco.languages.registerCompletionItemProvider(
    SMARTC_LANGUAGE_ID,
    createCompletionProvider(monaco),
  );
  monaco.languages.registerHoverProvider(
    SMARTC_LANGUAGE_ID,
    createHoverProvider(monaco),
  );
  monaco.languages.registerSignatureHelpProvider(
    SMARTC_LANGUAGE_ID,
    createSignatureHelpProvider(monaco),
  );

  const debouncers = new WeakMap<Monaco.editor.ITextModel, ReturnType<typeof setTimeout>>();
  const wire = (model: Monaco.editor.ITextModel) => {
    if (model.getLanguageId() !== SMARTC_LANGUAGE_ID) return;
    if (wired.has(model)) return;
    wired.add(model);
    const run = () => updateModel(monaco, model);
    model.onDidChangeContent(() => {
      const prev = debouncers.get(model);
      if (prev) clearTimeout(prev);
      debouncers.set(model, setTimeout(run, 500));
    });
    model.onWillDispose(() => {
      const t = debouncers.get(model);
      if (t) clearTimeout(t);
      clearModel(model);
    });
    run();
  };

  monaco.editor.getModels().forEach(wire);
  monaco.editor.onDidCreateModel(wire);
}
