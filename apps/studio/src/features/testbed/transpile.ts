import type * as Monaco from "monaco-editor";
import type { CompiledModule } from "./runner/types";
import { configureTypeScriptForTests } from "./monaco-setup";

/**
 * Transpiles project TypeScript to CommonJS using Monaco's own TypeScript
 * worker — the same one already powering the editor, so no second toolchain
 * and no extra bytes.
 *
 * Deliberately logic-free: it cannot be unit-tested without a browser, so
 * anything with decisions in it belongs in project-snapshot.ts or
 * test-run-model.ts instead.
 *
 * `files` maps file system paths (`/proj/tests/a.test.ts`) to source text. The
 * returned record is keyed by the same paths, ready to drop into a RunRequest.
 */
export async function transpileAll(
  monaco: typeof Monaco,
  files: Record<string, string>,
): Promise<Record<string, CompiledModule>> {
  // Monaco's TypeScript defaults are ESM/no-sourcemap out of the box, and the
  // runner's module registry evaluates CommonJS — so this configures itself
  // rather than trusting a caller to have done it before invoking us.
  configureTypeScriptForTests(monaco);

  const uris: Monaco.Uri[] = [];

  for (const [path, content] of Object.entries(files)) {
    // `file://` + the absolute file system path, so uri.path round-trips to the key.
    const uri = monaco.Uri.parse("file://" + path);
    const existing = monaco.editor.getModel(uri);
    if (existing) {
      if (existing.getValue() !== content) existing.setValue(content);
    } else {
      monaco.editor.createModel(content, "typescript", uri);
    }
    uris.push(uri);
  }

  const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
  const out: Record<string, CompiledModule> = {};

  for (const uri of uris) {
    const client = await getWorker(uri);
    const emitted = await client.getEmitOutput(uri.toString());
    const js = emitted.outputFiles.find((f) => f.name.endsWith(".js"));
    const map = emitted.outputFiles.find((f) => f.name.endsWith(".js.map"));
    if (js) out[uri.path] = { js: js.text, sourceMap: map?.text };
  }

  return out;
}
