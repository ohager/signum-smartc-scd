# Test Editor Import Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Studio test editor, relative import specifiers complete to the project's folders, `.ts` modules and `.smart.c?raw` contracts, and imported helpers are fully typed.

**Architecture:** Two pure, unit-tested modules decide everything (`import-suggestions.ts`: what to suggest; `model-sync.ts`: which Monaco models to create/update/dispose). A hook mirrors the project's `.ts` files as Monaco models, driven by FileSystem events, so Monaco's TS service resolves cross-file imports. A completion provider, registered once per Monaco instance, turns `importSuggestions` into completion items.

**Tech Stack:** React, Monaco (`@monaco-editor/react`, monaco-editor 0.56), `bun:test`, Studio `FileSystem` (EventTarget).

**Spec:** `docs/superpowers/specs/2026-11-26-test-editor-import-completion-design.md`

## Global Constraints

- Model URIs are `monaco.Uri.parse("file://" + path)` — the same form `transpile.ts` and the editor (`path={"file://" + file.metadata.path}`) use, so all three share models.
- Project root of a path = its first segment: `/Veridibloc - Item Contract/tests/a.test.ts` → `/Veridibloc - Item Contract`. In the editor, the project folder id is `findProjectOfFolder(fs, projectId) ?? projectId` (already computed as `projectRoot` in `test-file-editor.tsx`).
- Suggestions: folders → `name/`; `x.ts` → `x` (also `x.test.ts` → `x.test`); `y.smart.c` → `y.smart.c?raw`; all other file types omitted; the open file never suggested; never above the project root; never other projects.
- Unit tests use `bun:test` and sit next to the module (`foo.ts` + `foo.test.ts`), like `project-root.test.ts`.
- Run unit tests with `cd apps/studio && bun test src/features/testbed`.
- The working tree holds unrelated uncommitted changes by the user: every `git add` names explicit paths; never `git add -A`, never stash.
- Commit style: `feat(testbed): …` / `fix(testbed): …`, ending with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A model that `transpileAll` already created at a mirrored path — creating it again makes Monaco throw "already exists"; the hook must adopt it (Task 3 step pins this).
2. Folder rename/move — every contained file's path changes; reconcile must dispose old paths and create new ones (Task 2 test `rename moves the model`).
3. Two events in quick succession (e.g. MCP writes several files) — overlapping async reconciles must not create the same model twice (Task 3: serialized reconcile).
4. Cursor after the closing quote of an import, or in an ordinary string — no path suggestions (Task 4 tests).
5. `../` from a file in the project root — would escape the project; must return nothing (Task 1 test `never above the project root`).

---

### Task 0: Commit the run-root fix already in the working tree

**Files:**
- Modify (already modified): `apps/studio/src/features/testbed/ui/test-file-editor.tsx` (the `projectRoot` fix from this session)

- [ ] **Step 1: Confirm the diff of that file is only the `projectRoot` change**

Run: `git diff apps/studio/src/features/testbed/ui/test-file-editor.tsx`
Expected: adds `const projectRoot = findProjectOfFolder(fs, projectId) ?? projectId;` with its comment, and `run(monaco, projectRoot, …)` / `projectRoot` in the deps array. Nothing else.

- [ ] **Step 2: Commit it alone**

```bash
git add apps/studio/src/features/testbed/ui/test-file-editor.tsx
git commit -m "fix(testbed): test editor runs snapshot the whole project, not the file's folder"
```

---

### Task 1: Import suggestions (pure)

**Files:**
- Create: `apps/studio/src/features/testbed/import-suggestions.ts`
- Test: `apps/studio/src/features/testbed/import-suggestions.test.ts`

**Interfaces:**
- Produces:
  - `export type ImportSuggestionKind = "folder" | "module" | "contract";`
  - `export interface ImportSuggestion { label: string; insertText: string; kind: ImportSuggestionKind }`
  - `export function importSuggestions(openFilePath: string, typed: string, workspacePaths: string[]): ImportSuggestion[]`
    - `typed`: the specifier text between the opening quote and the cursor (`"../te"`).
    - Returns the direct children of the folder `typed` resolves to (the part up to and including its last `/`), folders first, then files, each group sorted by label. Filtering by the partial last segment is left to Monaco. `label === insertText`.

- [ ] **Step 1: Write the failing tests**

Fixture and tests:

```ts
const paths = [
  "/proj/c.smart.c", "/proj/c.asm",
  "/proj/tests/lib.ts", "/proj/tests/context.ts",
  "/proj/tests/a.test.ts", "/proj/tests/b.test.ts",
  "/proj/tests/sub/deep.ts",
  "/other/x.ts", "/other/y.smart.c",
];
const open = "/proj/tests/a.test.ts";
const sameFolder = [
  { label: "sub/", insertText: "sub/", kind: "folder" },
  { label: "b.test", insertText: "b.test", kind: "module" },
  { label: "context", insertText: "context", kind: "module" },
  { label: "lib", insertText: "lib", kind: "module" },
];
```

- `lists the open file's folder for "./"` → `importSuggestions(open, "./", paths)` equals `sameFolder`.
- `ignores the partial last segment` → `"./li"` equals `sameFolder`.
- `lists the parent folder for "../" with contracts as ?raw` → equals `[{ label: "tests/", insertText: "tests/", kind: "folder" }, { label: "c.smart.c?raw", insertText: "c.smart.c?raw", kind: "contract" }]` (no `c.asm`).
- `resolves nested segments` → `"../tests/"` equals `sameFolder`; `"./sub/"` equals `[{ label: "deep", insertText: "deep", kind: "module" }]`.
- `never above the project root` → `"../../"` equals `[]`; `importSuggestions("/proj/c.ts", "../", paths)` equals `[]`.
- `nothing for bare specifiers` → `"vitest"` and `""` equal `[]`.
- `never another project` → no result of `"../"` or `"./"` has a label containing `x` or `y.smart.c`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/testbed/import-suggestions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `importSuggestions` in `import-suggestions.ts`**

Resolve `dirname(openFilePath)` + the directory part of `typed` segment by segment (`.` stays, `..` pops; popping past the project root → `[]`). Collect direct children of the resolved folder from `workspacePaths` (files directly in it; folders = distinct next segment of deeper paths).

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/testbed/import-suggestions.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/testbed/import-suggestions.ts apps/studio/src/features/testbed/import-suggestions.test.ts
git commit -m "feat(testbed): compute relative import suggestions for the test editor"
```

---

### Task 2: Model sync plan (pure)

**Files:**
- Create: `apps/studio/src/features/testbed/model-sync.ts`
- Test: `apps/studio/src/features/testbed/model-sync.test.ts`

**Interfaces:**
- Produces:
  - `export interface SyncPlan { create: string[]; update: string[]; dispose: string[] }` (paths)
  - `export function planModelSync(owned: ReadonlyMap<string, number>, files: ReadonlyArray<{ path: string; lastModified: number }>, openFilePath: string): SyncPlan`
    - `owned`: path → `lastModified` the owned model was loaded at.
    - Desired set = `files` ending in `.ts`, minus `openFilePath`. `create` = desired not owned; `update` = owned and desired with a different `lastModified`; `dispose` = owned not desired. Order follows `files` (create/update) and `owned` iteration (dispose).

- [ ] **Step 1: Write the failing tests**

- `creates every .ts file except the open one` → `planModelSync(new Map(), [{path:"/p/a.test.ts",lastModified:1},{path:"/p/lib.ts",lastModified:1},{path:"/p/c.smart.c",lastModified:1},{path:"/p/ctx.ts",lastModified:1}], "/p/a.test.ts")` equals `{ create: ["/p/lib.ts", "/p/ctx.ts"], update: [], dispose: [] }`.
- `updates a model whose file changed` → owned `{"/p/lib.ts" → 1}`, files `[lib@2]` → `{ create: [], update: ["/p/lib.ts"], dispose: [] }`.
- `leaves unchanged models alone` → owned `{lib → 1}`, files `[lib@1]` → all three empty.
- `rename moves the model` → owned `{"/p/lib.ts" → 1}`, files `[{path:"/p/tests/lib.ts",lastModified:1}]` → `{ create: ["/p/tests/lib.ts"], update: [], dispose: ["/p/lib.ts"] }`.
- `disposes models of deleted files` → owned `{lib → 1}`, files `[]` → `{ create: [], update: [], dispose: ["/p/lib.ts"] }`.
- `never plans the open file` → owned empty, files `[open@5]` with `openFilePath` = that path → all empty.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/testbed/model-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `planModelSync` in `model-sync.ts`**

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/testbed/model-sync.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/testbed/model-sync.ts apps/studio/src/features/testbed/model-sync.test.ts
git commit -m "feat(testbed): plan which Monaco models mirror the project's TypeScript files"
```

---

### Task 3: Mirror project TypeScript files as Monaco models

**Files:**
- Create: `apps/studio/src/features/testbed/use-project-models.ts`
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx` (call the hook next to the other hooks that read `monacoRef`, around the `useTestDecorations` call)

**Interfaces:**
- Consumes: `planModelSync`, `SyncPlan` (Task 2).
- Produces: `export function useProjectModels(monaco: typeof Monaco | null, fs: ProjectModelsFs, projectRoot: string, openFilePath: string): void` with `export type ProjectModelsFs = Pick<FileSystem, "listFilesRecursive" | "loadFile" | "addEventListener" | "removeEventListener">`.

Not unit-tested (needs Monaco in a browser, like `transpile.ts`); its decisions live in Task 2.

- [ ] **Step 1: Implement `useProjectModels`**

One `useEffect` keyed on `[monaco, fs, projectRoot, openFilePath]`; no-op while `monaco` is null. Inside:
- `owned: Map<string, number>` local to the effect.
- `reconcile()`: `planModelSync(owned, fs.listFilesRecursive(projectRoot), openFilePath)`; for each create/update path, `loadFile(id)` → `String(content ?? "")`; if `monaco.editor.getModel(uri)` exists, `setValue` only when the text differs (adopts models `transpileAll` created — Review Focus 1), else `createModel(text, "typescript", uri)`; record `lastModified` in `owned`. For dispose: `getModel(uri)?.dispose()`, delete from `owned`.
- Serialize: if a reconcile is running, set a `pending` flag; when it finishes and `pending` is set, run once more (Review Focus 3).
- Run once on mount; subscribe the same handler to `"file:*"`, `"folder:*"`, `"fs:reloaded"`.
- Cleanup: remove the three listeners, mark the effect disposed (a reconcile in flight stops touching models), dispose every owned model.
- If `listFilesRecursive` throws (project deleted), treat as no files.

- [ ] **Step 2: Wire it into the test editor**

In `TestFileEditor`: `useProjectModels(editorReady ? monacoRef.current : null, fs, projectRoot, file.metadata.path);`

- [ ] **Step 3: Verify type check and unit tests are unchanged**

Run: `cd apps/studio && bunx tsc --noEmit -p . 2>&1 | grep -c error` → Expected: `341` (the pre-existing count; nothing new).
Run: `cd apps/studio && bun test src/features/testbed` → Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/testbed/use-project-models.ts apps/studio/src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(testbed): mirror the project's TypeScript files as Monaco models in the test editor"
```

---

### Task 4: Import path completion provider

**Files:**
- Create: `apps/studio/src/features/testbed/import-completion.ts`
- Test: `apps/studio/src/features/testbed/import-completion.test.ts`
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx` (`onMount`, right after `configureTypeScriptForTests(monaco)`)

**Interfaces:**
- Consumes: `importSuggestions`, `ImportSuggestion` (Task 1).
- Produces:
  - `export function importSpecifierAt(lineUntilCursor: string): string | null` — the specifier typed so far when the cursor is inside the quotes of `import … from "`, `import "`, or `export … from "` on this line; otherwise `null`.
  - `export function registerImportCompletion(monaco: typeof Monaco, listWorkspacePaths: () => string[]): void` — idempotent per Monaco instance (own `WeakSet`, like `configureTypeScriptForTests`).

- [ ] **Step 1: Write the failing tests for `importSpecifierAt`**

- `import { a } from "./li` → `"./li"`
- `import C from '../` → `"../"`
- `import "./` → `"./"`
- `import type { T } from "../t` → `"../t"`
- `export { x } from "./` → `"./"`
- `import {} from "` → `""`
- `const s = "./foo` → `null`
- `import { a } from "./lib"; ` → `null` (cursor after the closing quote)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/testbed/import-completion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `importSpecifierAt` and `registerImportCompletion`**

Provider for language `"typescript"`, `triggerCharacters: ['"', "'", "/"]`. In `provideCompletionItems(model, position)`: text of the line up to the cursor → `importSpecifierAt`; null → `{ suggestions: [] }`. Otherwise `importSuggestions(model.uri.path, typed, listWorkspacePaths())`. Range: from just after the last `/` in `typed` (or the opening quote when there is none) to the cursor. Kinds: folder → `CompletionItemKind.Folder` plus `command: { id: "editor.action.triggerSuggest", title: "" }`; module → `Module`; contract → `File`. `sortText` = zero-padded index, to keep Task 1's order.

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/testbed/import-completion.test.ts`
Expected: all pass.

- [ ] **Step 5: Register it in the editor**

In `onMount`: `registerImportCompletion(monaco, () => fs.listFilesRecursive().map((f) => f.path));`

- [ ] **Step 6: Verify type check and unit tests**

Run: `cd apps/studio && bunx tsc --noEmit -p . 2>&1 | grep -c error` → Expected: `341`.
Run: `cd apps/studio && bun test src/features/testbed` → Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/features/testbed/import-completion.ts apps/studio/src/features/testbed/import-completion.test.ts apps/studio/src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(testbed): complete relative import paths and ?raw contracts in the test editor"
```

---

### Task 5: Check in the running Studio

No code. Done by the user (the Studio tab is in their browser), guided by the implementer.

- [ ] **Step 1:** Reload the Studio, open `tests/batches.test.ts` in "Veridibloc - Item Contract" **before** running any test.
- [ ] **Step 2:** `import … from "./lib"` is not underlined; hovering `run` shows its signature.
- [ ] **Step 3:** In a new line type `import X from "../` → suggestions `tests/` and `veridibloc---item-contract.smart.c?raw`; choosing `tests/` reopens suggestions with `context`, `lib`, … (not `batches.test`).
- [ ] **Step 4:** Ask the assistant to add an export to `tests/lib.ts` over MCP while the editor stays open → the new export completes in `import { … } from "./lib"` without reload.
