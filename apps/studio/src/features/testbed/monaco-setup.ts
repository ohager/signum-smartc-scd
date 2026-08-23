import type * as Monaco from "monaco-editor";
import { AMBIENT_TYPINGS } from "./typings/ambient";

/** Monaco's TypeScript service is global, so configure each instance only once. */
const configured = new WeakSet<object>();

/**
 * Configures Monaco's TypeScript service for test files.
 *
 * `module: CommonJS` matters well beyond the editor: the same options drive
 * `getEmitOutput`, and the runner's module registry evaluates CommonJS. Without
 * this, Monaco emits ESM and every run fails with "Cannot use import statement
 * outside a module" — which is exactly what happened before this existed.
 *
 * Idempotent: `setCompilerOptions`/`setExtraLibs` replace rather than append,
 * and repeat calls return early so the TypeScript worker is not torn down and
 * rebuilt on every transpile.
 */
export function configureTypeScriptForTests(monaco: typeof Monaco): void {
  if (configured.has(monaco)) return;
  configured.add(monaco);

  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowNonTsExtensions: true,
    skipLibCheck: true,
    sourceMap: true,
    strict: false,
    lib: ["es2020"],
  });

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  ts.typescriptDefaults.setExtraLibs(AMBIENT_TYPINGS);
}
