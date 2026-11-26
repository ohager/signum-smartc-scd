# Test editor: import completion — design

Short design (small change).

## Intent

In the test editor, typing a relative import should offer the project's files,
so paths like `../veridibloc---item-contract.smart.c?raw` are picked, not typed
(a `--` vs `---` typo cost a debugging round). Once a helper is imported, its
exports and types should be known — `import { call, ru| } from "./lib"`
completes, and no false "Cannot find module './lib'" squiggles appear.

## Today

- The editor creates a single Monaco model: the open file
  (`test-file-editor.tsx`, `path="file://" + path`). Sibling `.ts` files only
  become models when a test run transpiles them (`transpile.ts`), and then keep
  that run's content.
- Monaco's TS worker host has no `readDirectory`/`getDirectories`, so TypeScript
  never suggests module paths, not even for `.ts` files.
- `*?raw` is a wildcard ambient module; TS has nothing to suggest there.

## Goals

- Path completion inside `import … from "…"` (and `import "…"`) once the string
  starts with `./` or `../`: folders (`tests/`), `.ts` files without extension,
  `.smart.c` files with `?raw`, all relative to the open file, within its project.
- All `.ts` files of the project mirrored as Monaco models, kept current from
  FileSystem events — including edits made by the assistant over MCP while the
  editor is open — so TS provides named-import completion, hover types and
  correct diagnostics across files.

## Non-goals

- Completion for bare package specifiers (`vitest`, `signum-smartc-testbed`).
- Files outside the open file's project.
- Completion in other editors (SmartC, ASM).

## Approaches

- **A — event-driven model mirror + own path provider (picked).** Models follow
  FileSystem events immediately; a completion provider handles paths.
- B — reload models on editor open/focus, same provider. Simpler, but MCP or
  other-tab edits stay invisible until refocus. Rejected for that reason.
- Custom TS worker implementing `readDirectory` (`customWorkerPath`) so TS
  suggests paths itself. Rejected: large infrastructure change for what a small
  provider does; still no `?raw` support.

## Design

1. **`import-suggestions.ts`** (pure, `bun test`): given the open file's path,
   the typed specifier prefix and the project's file paths, return suggestions
   `{ label, insertText, kind: "folder" | "module" | "contract" }`.
   Resolves `./` and `../` (multiple levels, not above the project root), lists
   only direct children of the resolved folder, maps `x.ts` → `x`,
   `y.smart.c` → `y.smart.c?raw`, folders → `name/`. Excludes the open file
   itself; `.test.ts` files are offered like any module.
2. **`model-sync.ts`** (pure, `bun test`): `planModelSync(owned, desired)` diffs
   the models this hook owns (`path → lastModified`) against the project's
   current `.ts` files and returns `{ create, update, dispose }`. Reconciling the
   whole project on each event covers folder renames/moves, which change the
   paths of every contained file, without per-event special cases.
3. **`useProjectModels(monaco, projectRoot, openFilePath)`** (hook): on mount and
   on every `file:*`, `folder:*` and `fs:reloaded` event, run `planModelSync`,
   load contents for create/update, apply. Never touches the open file's model
   (the editor owns it) or models it did not create; `transpileAll` reuses these
   models by URI as it does today. Disposes its models on unmount.
4. **Completion provider**: registered once per Monaco instance for
   `typescript` (alongside `configureTypeScriptForTests`), trigger characters
   `"`, `'`, `/`. Detects that the cursor is inside an import specifier on the
   current line, takes the open model's URI path and the project's files from
   `FileSystem`, and replaces the typed segment after the last `/` with the
   chosen suggestion. Folder suggestions re-trigger suggest.

Project root: `findProjectOfFolder(fs, projectId) ?? projectId`, as the run
already does.

## Left to the builder

Exact regex for "inside an import specifier", sort order (folders first is the
suggestion), whether `export … from` is included (cheap — include), wiring of
the provider's FileSystem access (singleton vs. passed in).
