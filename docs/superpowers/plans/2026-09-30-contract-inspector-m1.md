# Contract Inspector M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inspect deployed Signum contracts from inside the Studio, with the data stack and maps labelled by a per-code-hash Label Map file that is written by hand or generated from SmartC source.

**Architecture:** Two new project file types carry everything: `*.inspect.json` (the watchlist, opened by the inspector UI) and `*.labels.json` (the Label Map, opened by a form/JSONC editor). A pure model layer (Zod 4 schemas, `jsonc-parser` for comment-preserving edits, value decoding, label resolution and merging) sits under two adapters (SmartC label generator, wallet-free signumjs client), and the React layer only arranges them. Label Maps are resolved across the whole workspace by machine-code hash.

**Tech Stack:** React 19, react-router 7, Tailwind 4, `@monaco-editor/react`, `smartc-signum-compiler@2.3.0`, `@signumjs/core@3.3.4`, **new:** `zod@^4`, `jsonc-parser@^3`, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-30-contract-inspector-design.md`

## Global Constraints

- All paths below are relative to `apps/studio/` unless they start with `docs/`.
- Run tests from `apps/studio/` (its `bunfig.toml` resolves `@/`): `cd apps/studio && bun test <path>`.
- 64-bit ids, keys, values and code hashes are **decimal strings** everywhere in files and APIs; arithmetic uses `bigint`, never `number`.
- File dialect for the two new types is **JSONC** (comments + trailing commas). UI edits go through `jsonc-parser` `modify`/`applyEdits`; only a newly created file is written with `JSON.stringify(value, null, 2)`.
- Zod 4 schemas are the single source for types, validation, JSON Schema (Monaco) and form validation.
- The inspector is read-only toward the chain: no wallet is needed, nothing is signed.
- Every user-visible string goes through `t()` from `@/i18n/runtime`; English keys live in `src/i18n/locales/en/inspector.json`; after changing it run `bun run i18n:types`. Code terms that are not prose get a trailing `// i18n-ignore` comment.
- Match surrounding code: explanatory block comments on *why*, named exports, `@/` imports, no default exports except locale bundles.
- Commit after every task with a conventional message ending in the trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Deviations from the spec (decided while planning)

1. **No virtualization library.** Result lists page with "Load more" (100 rows per page). Several thousand simple rows render acceptably. Adding a virtualizer is YAGNI for M1.
2. **Pending after deploy** is shown as "not found yet" with a hint and a retry. The inspector does not couple to `deployment-watch`.
3. **Custom node network** gains an optional `testnet: boolean` (`{ "node": "…", "testnet": true }`). Without it the address prefix of a custom node is unknowable.
4. **Rail rule:** the rail hides only when the project has **no contract and at least one inspection file**. An empty new development project keeps its "no contract" guidance.
5. **Array labels from the compiler:** the pointer slot keeps the array's name (format `unsigned`, comment "array pointer"). The items become one entry with `length`, displayed as `name[i]`.

## Review Focus

1. **A `.labels.json` that is open in `LabelMapEditor` while the inspector writes a label to it.** The editor must adopt the new text when it has no unsaved edits. Otherwise its autosave silently reverts the label. *Pinned by Task 9 (`adopt` test) and wired in Task 13.*
2. **User comments in both files survive every UI action** (set label, add hash, add contracts, merge). *Pinned by the comment-preservation tests in Tasks 3 and 4.*
3. **Negative and large 64-bit values** (e.g. `-1`, `2^63`, `0xFFFF…`) decode identically in slots and in map values. The map API returns signed decimals, slots are little-endian hex. *Pinned by the Task 5 round-trip test.*
4. **A label index beyond `machineData`,** or a hand-edited file with a wrong type, never throws while rendering. *Pinned by Task 5 (`outOfRange`) and Task 2 (positions for bad types).*
5. **Aborting a code-hash search mid-page** keeps the rows already loaded and leaves no request writing into a closed dialog. *Pinned by the Task 8 `pagedSearch` abort test.*

---

## File Structure

```
apps/studio/src/features/inspector/
  model/
    jsonc.ts                 parse JSONC + Zod → value or positioned errors; editDocument()
    formats.ts               FORMATS list (shared by schemas, UI selects)
    label-map.ts             Label Map schema, types, parseLabelMap, emptyLabelMap
    label-map-edits.ts       upsertSlot, removeSlot, upsertMapGroup, removeMapGroup, addCodeHash, removeCodeHash, setEnum, removeEnum
    watchlist.ts             Watchlist schema, types, parseWatchlist, emptyWatchlist, addContracts, updateContract, removeContract
    networks.ts              default nodes, nodeHostOf, addressPrefixOf, networkKey, sameNetwork, networkFromWallet
    decode.ts                slotToBigInt, decimalToBigInt, formatValue, allInterpretations
    data-stack.ts            buildSlotRows
    resolve-label-map.ts     resolveLabelMap
    merge-labels.ts          mergeGenerated, applyMerge
    schemas.ts               JSON Schemas for Monaco
  compiler/
    label-generator.ts       generateLabels(source)
  chain/
    inspector-client.ts      createInspectorClient(network), InspectorError, contractStatus, toSummary
    paged-search.ts          createPagedSearch
  workspace/
    label-map-index.ts       loadLabelMaps(fs)
    update-file.ts           updateFileText(fs, fileId, edit)
    inspect-deployed.ts      inspectDeployed(fs, …)
    use-label-maps.ts        React hook over label-map-index
    use-followed-file.ts     useEditorFile + adopt on external change
  monaco/
    register-json.ts         registerStudioJson(monaco): schemas + json5 language
  ui/
    jsonc-source-editor.tsx  Monaco JSONC editor for both file types
    inspector-editor.tsx     editor for *.inspect.json
    watchlist-panel.tsx      left list
    contract-view.tsx        right pane: load, tabs, errors
    overview-tab.tsx
    data-stack-tab.tsx
    slot-detail.tsx
    slot-label-dialog.tsx
    maps-tab.tsx
    map-group-dialog.tsx
    add-contract-dialog.tsx
    network-picker.tsx
    label-map-editor.tsx     editor for *.labels.json
    generate-labels-dialog.tsx
    inspect-deployed-button.tsx
src/features/workflow/rail-visibility.ts   showsRail(files, contract)
src/i18n/locales/*/inspector.json
```

Modified: `package.json`, `src/features/project/filetype-icons.tsx`, `src/features/project/new-file-dialog.tsx`, `src/features/project/new-project-dialog.tsx`, `src/pages/files/files-page.tsx`, `src/features/simulator/scenario/scenario-editor.tsx`, `src/components/ui/editor/use-editor-file.ts`, `src/features/asm-editor/deployment-view/{deployment-flow,deployment-view,large-contract-deployment}.tsx`, `src/pages/deploy/deploy-page.tsx`, `src/features/workflow/rail.tsx`, `src/i18n/locales/*/index.ts`, `src/i18n/GLOSSARY.md`.

---

### Task 1: Dependencies, i18n namespace, JSONC core

**Files:**
- Modify: `package.json` (via `bun add`)
- Create: `src/i18n/locales/en/inspector.json`
- Modify: `src/i18n/locales/en/index.ts`
- Create: `src/features/inspector/model/jsonc.ts`
- Test: `src/features/inspector/model/jsonc.test.ts`

**Interfaces:**
- Produces:
  - `type JsonPath = (string | number)[]`
  - `interface DocError { path: JsonPath; message: string; line: number; column: number }` (1-based line/column)
  - `type Parsed<T> = { ok: true; value: T } | { ok: false; errors: DocError[] }`
  - `parseDocument<T>(text: string, schema: z.ZodType<T>): Parsed<T>`
  - `editDocument(text: string, path: JsonPath, value: unknown, options?: { insert?: boolean }): string` (`value === undefined` removes the node)
  - `offsetToPosition(text: string, offset: number): { line: number; column: number }`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/studio && bun add zod@^4 jsonc-parser@^3
```

Expected: both appear under `dependencies` in `apps/studio/package.json`.

- [ ] **Step 2: Create the English namespace with the validation keys**

`src/i18n/locales/en/inspector.json`:

```json
{
  "validation": {
    "syntax": "Syntax error: {error}",
    "required": "Required field is missing",
    "type": "Expected {expected}",
    "value": "Must be one of: {allowed}",
    "pattern": "Must be a decimal number",
    "unknownKey": "Unknown field: {keys}",
    "enumMissing": "Enum \"{name}\" is not defined in \"enums\"",
    "enumRequired": "Format \"enum\" needs an \"enum\" name",
    "other": "{message}",
    "at": "Line {line}: {message}"
  }
}
```

Register it in `src/i18n/locales/en/index.ts`: add `import inspector from "./inspector.json";` after the `asmEditor` import, and add `inspector,` as the last member of the `en` object. Then run:

```bash
cd apps/studio && bun run i18n:types
```

Expected: `src/i18n/keys.generated.ts` now contains `"inspector.validation.syntax": { error: string | number };`.

- [ ] **Step 3: Write the failing test**

`src/features/inspector/model/jsonc.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { editDocument, offsetToPosition, parseDocument } from "./jsonc";

const Schema = z.strictObject({
  version: z.literal(1),
  items: z.array(z.strictObject({ id: z.string().regex(/^\d+$/), name: z.string().optional() })),
});

describe("parseDocument", () => {
  it("accepts comments and trailing commas", () => {
    const text = `{
  // the version
  "version": 1,
  "items": [{ "id": "1", },], /* done */
}`;
    const r = parseDocument(text, Schema);
    expect(r).toEqual({ ok: true, value: { version: 1, items: [{ id: "1" }] } });
  });

  it("reports a syntax error with its line and column", () => {
    const r = parseDocument(`{\n  "version": 1\n  "items": []\n}`, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.line).toBe(3);
    expect(r.errors[0]!.column).toBe(3);
  });

  it("positions a schema error at the offending node", () => {
    const text = `{
  "version": 1,
  "items": [
    { "id": "1" },
    { "id": "x1" }
  ]
}`;
    const r = parseDocument(text, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["items", 1, "id"]);
    expect(r.errors[0]!.line).toBe(5);
    expect(r.errors[0]!.column).toBe(13);
  });

  it("positions a missing field at its parent object", () => {
    const r = parseDocument(`{\n  "items": []\n}`, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["version"]);
    expect(r.errors[0]!.line).toBe(1);
  });
});

describe("editDocument", () => {
  const text = `{
  // keep me
  "version": 1,
  "items": [
    { "id": "1" } // first
  ]
}`;

  it("replaces one node and keeps every comment", () => {
    const out = editDocument(text, ["items", 0, "name"], "one");
    expect(out).toContain("// keep me");
    expect(out).toContain("// first");
    expect(parseDocument(out, Schema)).toEqual({
      ok: true,
      value: { version: 1, items: [{ id: "1", name: "one" }] },
    });
  });

  it("inserts into an array", () => {
    const out = editDocument(text, ["items", 1], { id: "2" }, { insert: true });
    expect(out).toContain("// keep me");
    const r = parseDocument(out, Schema);
    expect(r.ok && r.value.items.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("removes a node when the value is undefined", () => {
    const out = editDocument(text, ["items", 0], undefined);
    const r = parseDocument(out, Schema);
    expect(r.ok && r.value.items).toEqual([]);
    expect(out).toContain("// keep me");
  });
});

describe("offsetToPosition", () => {
  it("is 1-based", () => {
    expect(offsetToPosition("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToPosition("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/model/jsonc.test.ts`
Expected: FAIL, `Cannot find module './jsonc'`.

- [ ] **Step 5: Implement**

`src/features/inspector/model/jsonc.ts`:

```ts
import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import type { z } from "zod";
import { t } from "@/i18n/runtime";

/**
 * The two inspector file types are JSONC: comments are how people annotate a
 * Label Map, so every read tolerates them and every UI write keeps them.
 * `jsonc-parser` is the library Monaco's JSON service is built on, so what this
 * module calls an error is what the editor underlines.
 */

export type JsonPath = (string | number)[];

export interface DocError {
  path: JsonPath;
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: DocError[] };

const PARSE_OPTIONS = { allowTrailingComma: true, disallowComments: false };
const FORMATTING = { tabSize: 2, insertSpaces: true, eol: "\n" };

export function offsetToPosition(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** The deepest existing node along `path`: a missing field points at its parent. */
function nearestNode(root: Node, path: JsonPath): Node {
  for (let depth = path.length; depth > 0; depth--) {
    const node = findNodeAtLocation(root, path.slice(0, depth));
    if (node) return node;
  }
  return root;
}

function issueMessage(issue: z.core.$ZodIssue, node: Node | undefined): string {
  // A field that is not in the text at all is "missing", whatever Zod calls it.
  if (node === undefined && issue.code !== "unrecognized_keys" && issue.code !== "custom") {
    return t("inspector.validation.required");
  }
  switch (issue.code) {
    case "invalid_type":
      return t("inspector.validation.type", { expected: String(issue.expected) });
    case "invalid_value":
      return t("inspector.validation.value", {
        allowed: issue.values.map((v) => JSON.stringify(v)).join(", "),
      });
    case "invalid_format":
      return t("inspector.validation.pattern");
    case "unrecognized_keys":
      return t("inspector.validation.unknownKey", { keys: issue.keys.join(", ") });
    default:
      return t("inspector.validation.other", { message: issue.message });
  }
}

export function parseDocument<T>(text: string, schema: z.ZodType<T>): Parsed<T> {
  const syntax: ParseError[] = [];
  const root = parseTree(text, syntax, PARSE_OPTIONS);
  if (syntax.length || !root) {
    const first = syntax[0];
    const offset = first?.offset ?? 0;
    return {
      ok: false,
      errors: [
        {
          path: [],
          message: t("inspector.validation.syntax", {
            error: first ? printParseErrorCode(first.error) : "empty document",
          }),
          ...offsetToPosition(text, offset),
        },
      ],
    };
  }

  const result = schema.safeParse(getNodeValue(root));
  if (result.success) return { ok: true, value: result.data };

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.filter(
        (p): p is string | number => typeof p === "string" || typeof p === "number",
      );
      const exact = path.length ? findNodeAtLocation(root, path) : root;
      const at = exact ?? nearestNode(root, path);
      return {
        path,
        message: issueMessage(issue, exact),
        ...offsetToPosition(text, at.offset),
      };
    }),
  };
}

/**
 * Changes one node and leaves the rest of the text — comments, spacing, key
 * order — exactly as the user wrote it. Re-serializing the parsed value would
 * be shorter and would delete every comment in the file.
 */
export function editDocument(
  text: string,
  path: JsonPath,
  value: unknown,
  options: { insert?: boolean } = {},
): string {
  const edits = modify(text, path, value, {
    formattingOptions: FORMATTING,
    isArrayInsertion: options.insert ?? false,
  });
  return applyEdits(text, edits);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/studio && bun test src/features/inspector/model/jsonc.test.ts`
Expected: PASS (9 tests).

If the column assertion of "positions a schema error at the offending node" is off by the quote, the node offset points at the opening `"` of `"x1"`, which is column 13 in the fixture. Adjust only the fixture, not the implementation.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/package.json bun.lock apps/studio/src/i18n apps/studio/src/features/inspector/model/jsonc.ts apps/studio/src/features/inspector/model/jsonc.test.ts
git commit -m "feat(inspector): JSONC parsing with positioned errors and comment-preserving edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Label Map schema

**Files:**
- Create: `src/features/inspector/model/formats.ts`
- Create: `src/features/inspector/model/label-map.ts`
- Test: `src/features/inspector/model/label-map.test.ts`

**Interfaces:**
- Consumes: `parseDocument`, `Parsed`, `DocError` (Task 1)
- Produces:
  - `FORMATS = ["long","unsigned","fixed","hex","address","string","bool","enum"] as const`, `type ValueFormat = (typeof FORMATS)[number]`
  - `ORIGINS = ["manual","compiler","imported"] as const`, `type Origin`
  - `LabelMapSchema` (Zod), `type LabelMap`, `type SlotLabel`, `type MapGroup`, `type FixedMapGroup`, `type PatternMapGroup`, `type Key2Label`, `type CodeHashEntry`, `type CodeLabel`
  - `isFixedGroup(g: MapGroup): g is FixedMapGroup`
  - `parseLabelMap(text: string): Parsed<LabelMap>`
  - `emptyLabelMap(name: string, codeHashes?: CodeHashEntry[]): string` (serialized, ready to write)

- [ ] **Step 1: Write the failing test**

`src/features/inspector/model/label-map.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { emptyLabelMap, isFixedGroup, parseLabelMap } from "./label-map";

const full = `{
  // NFT market labels
  "version": 1,
  "name": "NFT Market",
  "codeHashes": [
    { "hash": "8421", "network": "mainnet", "note": "#define OWNER" },
    { "hash": "1337" },
  ],
  "source": { "file": "nft.smart.c", "generatedAt": "2026-09-30T12:00:00Z" },
  "slots": [
    { "index": 7, "name": "isOnSale", "format": "enum", "enum": "saleStatus", "origin": "manual" },
    { "index": 12, "name": "prices", "format": "long", "length": 5, "origin": "compiler" }
  ],
  "maps": [
    { "key1": "10", "name": "User Permissions", "key2Format": "address", "valueFormat": "enum", "enum": "permission" },
    { "key1Format": "address", "name": "Account Data",
      "key2": [{ "key2": "1", "name": "balance", "valueFormat": "long" }] }
  ],
  "enums": {
    "saleStatus": { "0": "idle", "1": "on sale" },
    "permission": { "1": "minter" }
  },
  "codeLabels": [{ "address": 420, "name": "sellNft", "origin": "compiler" }]
}`;

describe("parseLabelMap", () => {
  it("accepts the full format with comments", () => {
    const r = parseLabelMap(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slots[1]!.length).toBe(5);
    expect(isFixedGroup(r.value.maps[0]!)).toBe(true);
    expect(isFixedGroup(r.value.maps[1]!)).toBe(false);
  });

  it("fills missing optional collections with empty ones", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [] }`);
    expect(r.ok && r.value).toMatchObject({ slots: [], maps: [], enums: {}, codeLabels: [] });
  });

  it("rejects an unknown format at the right line", () => {
    const r = parseLabelMap(`{
  "version": 1, "name": "x", "codeHashes": [],
  "slots": [ { "index": 1, "name": "a", "format": "float" } ]
}`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["slots", 0, "format"]);
    expect(r.errors[0]!.line).toBe(3);
  });

  it("rejects a non-decimal key1", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [],
      "maps": [ { "key1": "0x10", "name": "m" } ] }`);
    expect(r.ok).toBe(false);
  });

  it("requires enum formats to name a defined enum", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [],
      "slots": [ { "index": 1, "name": "a", "format": "enum", "enum": "nope" } ] }`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["slots", 0, "enum"]);
  });

  it("rejects a wrong type without throwing", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [], "slots": { } }`);
    expect(r.ok).toBe(false);
  });
});

describe("emptyLabelMap", () => {
  it("round-trips", () => {
    const r = parseLabelMap(emptyLabelMap("NFT", [{ hash: "1" }]));
    expect(r.ok && r.value.codeHashes).toEqual([{ hash: "1" }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/model/label-map.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/features/inspector/model/formats.ts`:

```ts
/** How a 64-bit value is shown. Shared by the schemas, the decoder and every format select. */
export const FORMATS = ["long", "unsigned", "fixed", "hex", "address", "string", "bool", "enum"] as const; // i18n-ignore
export type ValueFormat = (typeof FORMATS)[number];

export const ORIGINS = ["manual", "compiler", "imported"] as const; // i18n-ignore
export type Origin = (typeof ORIGINS)[number];
```

`src/features/inspector/model/label-map.ts`:

```ts
import { z } from "zod";
import { FORMATS, ORIGINS } from "./formats";
import { parseDocument, type Parsed } from "./jsonc";
import { t } from "@/i18n/runtime";

/**
 * A Label Map gives names and meanings to a contract's memory, maps and code.
 * It belongs to a set of machine-code hashes, not to one contract: every
 * instance of the same code shares it, and the same source built with other
 * `#define`s adds another hash.
 */

const Decimal = z.string().regex(/^-?\d+$/).describe("Decimal 64-bit integer as a string");
const Unsigned = z.string().regex(/^\d+$/).describe("Unsigned decimal id as a string");
const Format = z.enum(FORMATS).describe("How the value is displayed");
const Origin = z.enum(ORIGINS).describe("Who wrote this entry; regeneration only replaces 'compiler'");

const SlotLabelSchema = z.strictObject({
  index: z.int().nonnegative().describe("Memory slot index (8 bytes each)"),
  name: z.string().min(1),
  format: Format.optional(),
  enum: z.string().optional().describe("Key in 'enums' when format is 'enum'"),
  length: z.int().min(1).optional().describe("Number of consecutive slots (array)"),
  comment: z.string().optional(),
  origin: Origin.optional(),
});

const Key2LabelSchema = z.strictObject({
  key2: Decimal,
  name: z.string().min(1),
  valueFormat: Format.optional(),
  enum: z.string().optional(),
  comment: z.string().optional(),
});

const groupFields = {
  name: z.string().min(1),
  key2Format: Format.optional().describe("Format of every key2 in this group"),
  key2: z.array(Key2LabelSchema).optional().describe("Named key2 entries"),
  valueFormat: Format.optional(),
  enum: z.string().optional(),
  comment: z.string().optional(),
  origin: Origin.optional(),
};

const FixedMapGroupSchema = z.strictObject({ key1: Decimal, ...groupFields });
const PatternMapGroupSchema = z.strictObject({
  key1Format: Format.describe("Every key1 of this group has this format"),
  ...groupFields,
});

const CodeHashSchema = z.strictObject({
  hash: Unsigned.describe("Machine code hash id"),
  network: z.string().optional().describe("Informational only"),
  note: z.string().optional(),
});

const CodeLabelSchema = z.strictObject({
  address: z.int().nonnegative(),
  name: z.string().min(1),
  origin: Origin.optional(),
});

const EnumsSchema = z.record(z.string(), z.record(z.string().regex(/^-?\d+$/), z.string()));

export const LabelMapSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(1),
    name: z.string().min(1),
    codeHashes: z.array(CodeHashSchema),
    source: z.strictObject({ file: z.string(), generatedAt: z.string() }).optional(),
    slots: z.array(SlotLabelSchema).default([]),
    maps: z.array(z.union([FixedMapGroupSchema, PatternMapGroupSchema])).default([]),
    enums: EnumsSchema.default({}),
    codeLabels: z.array(CodeLabelSchema).default([]),
  })
  .superRefine((map, ctx) => {
    const check = (
      entry: { format?: string; valueFormat?: string; enum?: string },
      path: (string | number)[],
    ) => {
      const usesEnum = entry.format === "enum" || entry.valueFormat === "enum";
      if (usesEnum && !entry.enum) {
        ctx.addIssue({ code: "custom", path: [...path, "enum"], message: t("inspector.validation.enumRequired") });
      } else if (entry.enum && !(entry.enum in map.enums)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "enum"],
          message: t("inspector.validation.enumMissing", { name: entry.enum }),
        });
      }
    };
    map.slots.forEach((s, i) => check(s, ["slots", i]));
    map.maps.forEach((g, i) => {
      check(g, ["maps", i]);
      g.key2?.forEach((k, j) => check(k, ["maps", i, "key2", j]));
    });
  });

export type LabelMap = z.infer<typeof LabelMapSchema>;
export type SlotLabel = z.infer<typeof SlotLabelSchema>;
export type Key2Label = z.infer<typeof Key2LabelSchema>;
export type FixedMapGroup = z.infer<typeof FixedMapGroupSchema>;
export type PatternMapGroup = z.infer<typeof PatternMapGroupSchema>;
export type MapGroup = FixedMapGroup | PatternMapGroup;
export type CodeHashEntry = z.infer<typeof CodeHashSchema>;
export type CodeLabel = z.infer<typeof CodeLabelSchema>;

export { SlotLabelSchema, FixedMapGroupSchema, PatternMapGroupSchema };

export function isFixedGroup(group: MapGroup): group is FixedMapGroup {
  return "key1" in group;
}

export function parseLabelMap(text: string): Parsed<LabelMap> {
  return parseDocument(text, LabelMapSchema);
}

export function emptyLabelMap(name: string, codeHashes: CodeHashEntry[] = []): string {
  const map = { version: 1, name, codeHashes, slots: [], maps: [], enums: {}, codeLabels: [] };
  return JSON.stringify(map, null, 2) + "\n";
}
```

The custom issues carry their own `message`. `issueMessage` in `jsonc.ts` passes them through via the `default` branch (`inspector.validation.other`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/studio && bun test src/features/inspector/model/label-map.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/model
git commit -m "feat(inspector): Label Map schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Label Map edits (comment-preserving)

**Files:**
- Create: `src/features/inspector/model/label-map-edits.ts`
- Test: `src/features/inspector/model/label-map-edits.test.ts`

**Interfaces:**
- Consumes: `parseLabelMap`, `LabelMap`, `SlotLabel`, `MapGroup`, `CodeHashEntry`, `isFixedGroup` (Task 2); `editDocument` (Task 1)
- Produces (all `(text: string, …) => string`; each throws `Error` if `text` does not parse):
  - `upsertSlot(text, slot: SlotLabel)`: replaces the entry with the same `index`, else inserts sorted by index; forces `origin: "manual"` unless `slot.origin` is set
  - `removeSlot(text, index: number)`
  - `upsertMapGroup(text, group: MapGroup)`: matches by `key1` for fixed groups, by `key1Format` + `name` for pattern groups
  - `removeMapGroup(text, position: number)`
  - `addCodeHash(text, entry: CodeHashEntry)`: no-op if the hash is present
  - `removeCodeHash(text, hash: string)`
  - `setEnum(text, name: string, values: Record<string, string>)`
  - `removeEnum(text, name: string)`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/model/label-map-edits.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseLabelMap } from "./label-map";
import {
  addCodeHash,
  removeCodeHash,
  removeMapGroup,
  removeSlot,
  setEnum,
  upsertMapGroup,
  upsertSlot,
} from "./label-map-edits";

const base = `{
  // top comment
  "version": 1,
  "name": "M",
  "codeHashes": [ { "hash": "1" } ], // hashes
  "slots": [
    { "index": 3, "name": "a", "origin": "compiler" }, // slot a
    { "index": 9, "name": "c" }
  ]
}`;

const parsed = (text: string) => {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("upsertSlot", () => {
  it("inserts in index order and keeps comments byte-identical", () => {
    const out = upsertSlot(base, { index: 5, name: "b" });
    expect(parsed(out).slots.map((s) => s.index)).toEqual([3, 5, 9]);
    for (const c of ["// top comment", "// hashes", "// slot a"]) expect(out).toContain(c);
  });

  it("replaces an existing index and marks it manual", () => {
    const out = upsertSlot(base, { index: 3, name: "renamed", format: "bool" });
    const slot = parsed(out).slots[0]!;
    expect(slot).toEqual({ index: 3, name: "renamed", format: "bool", origin: "manual" });
  });

  it("creates the slots array when the file has none", () => {
    const out = upsertSlot(`{ "version": 1, "name": "M", "codeHashes": [] }`, { index: 0, name: "x" });
    expect(parsed(out).slots).toEqual([{ index: 0, name: "x", origin: "manual" }]);
  });

  it("throws on a file that does not parse", () => {
    expect(() => upsertSlot("{", { index: 0, name: "x" })).toThrow();
  });
});

describe("removeSlot", () => {
  it("removes by index", () => {
    expect(parsed(removeSlot(base, 9)).slots.map((s) => s.index)).toEqual([3]);
  });
});

describe("map groups", () => {
  it("upserts fixed groups by key1 and pattern groups by format and name", () => {
    let out = upsertMapGroup(base, { key1: "10", name: "Perms" });
    out = upsertMapGroup(out, { key1: "10", name: "Permissions" });
    out = upsertMapGroup(out, { key1Format: "address", name: "Accounts" });
    const maps = parsed(out).maps;
    expect(maps).toHaveLength(2);
    expect(maps[0]!.name).toBe("Permissions");
    expect(parsed(removeMapGroup(out, 0)).maps).toHaveLength(1);
    expect(out).toContain("// top comment");
  });
});

describe("code hashes and enums", () => {
  it("adds a hash once and removes it", () => {
    const once = addCodeHash(base, { hash: "2", network: "testnet" });
    expect(addCodeHash(once, { hash: "2" })).toBe(once);
    expect(parsed(once).codeHashes.map((h) => h.hash)).toEqual(["1", "2"]);
    expect(parsed(removeCodeHash(once, "1")).codeHashes.map((h) => h.hash)).toEqual(["2"]);
  });

  it("sets an enum", () => {
    const out = setEnum(base, "status", { "0": "idle", "1": "sale" });
    expect(parsed(out).enums).toEqual({ status: { "0": "idle", "1": "sale" } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/model/label-map-edits.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/features/inspector/model/label-map-edits.ts`:

```ts
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { editDocument } from "./jsonc";
import {
  isFixedGroup,
  parseLabelMap,
  type CodeHashEntry,
  type LabelMap,
  type MapGroup,
  type SlotLabel,
} from "./label-map";

/**
 * Every change the UI makes to a Label Map. Each one edits only the node it
 * concerns, so a file the user has commented by hand keeps its comments.
 */

function current(text: string): LabelMap {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(r.errors[0]?.message ?? "invalid Label Map");
  return r.value;
}

/** Whether the raw text has `key` at top level; defaults fill it only in the parsed value. */
function hasKey(text: string, key: string): boolean {
  const root = parseTree(text, [], { allowTrailingComma: true });
  return !!root && !!findNodeAtLocation(root, [key]);
}

function insertAt(text: string, key: string, position: number, value: unknown): string {
  return hasKey(text, key)
    ? editDocument(text, [key, position], value, { insert: true })
    : editDocument(text, [key], [value]);
}

export function upsertSlot(text: string, slot: SlotLabel): string {
  const entry = { ...slot, origin: slot.origin ?? "manual" };
  const slots = current(text).slots;
  const at = slots.findIndex((s) => s.index === slot.index);
  if (at >= 0) return editDocument(text, ["slots", at], entry);
  const before = slots.findIndex((s) => s.index > slot.index);
  return insertAt(text, "slots", before < 0 ? slots.length : before, entry);
}

export function removeSlot(text: string, index: number): string {
  const at = current(text).slots.findIndex((s) => s.index === index);
  return at < 0 ? text : editDocument(text, ["slots", at], undefined);
}

function sameGroup(a: MapGroup, b: MapGroup): boolean {
  if (isFixedGroup(a) && isFixedGroup(b)) return a.key1 === b.key1;
  if (!isFixedGroup(a) && !isFixedGroup(b)) return a.key1Format === b.key1Format && a.name === b.name;
  return false;
}

export function upsertMapGroup(text: string, group: MapGroup): string {
  const entry = { ...group, origin: group.origin ?? "manual" };
  const maps = current(text).maps;
  const at = maps.findIndex((g) => sameGroup(g, group));
  if (at >= 0) return editDocument(text, ["maps", at], entry);
  return insertAt(text, "maps", maps.length, entry);
}

export function removeMapGroup(text: string, position: number): string {
  return editDocument(text, ["maps", position], undefined);
}

export function addCodeHash(text: string, entry: CodeHashEntry): string {
  const hashes = current(text).codeHashes;
  if (hashes.some((h) => h.hash === entry.hash)) return text;
  return insertAt(text, "codeHashes", hashes.length, entry);
}

export function removeCodeHash(text: string, hash: string): string {
  const at = current(text).codeHashes.findIndex((h) => h.hash === hash);
  return at < 0 ? text : editDocument(text, ["codeHashes", at], undefined);
}

export function setEnum(text: string, name: string, values: Record<string, string>): string {
  current(text);
  return hasKey(text, "enums")
    ? editDocument(text, ["enums", name], values)
    : editDocument(text, ["enums"], { [name]: values });
}

export function removeEnum(text: string, name: string): string {
  current(text);
  return editDocument(text, ["enums", name], undefined);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/studio && bun test src/features/inspector/model/label-map-edits.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/model
git commit -m "feat(inspector): comment-preserving Label Map edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Networks and watchlist

**Files:**
- Create: `src/features/inspector/model/networks.ts`
- Create: `src/features/inspector/model/watchlist.ts`
- Test: `src/features/inspector/model/networks.test.ts`, `src/features/inspector/model/watchlist.test.ts`

**Interfaces:**
- Consumes: `parseDocument`, `editDocument`, `Parsed` (Task 1)
- Produces:
  - `type Network = "mainnet" | "testnet" | { node: string; testnet?: boolean }`
  - `NetworkSchema` (Zod)
  - `DEFAULT_NODES: { mainnet: string; testnet: string }`
  - `nodeHostOf(n: Network): string`
  - `addressPrefixOf(n: Network): "S" | "TS"`
  - `networkKey(n: Network): string`
  - `sameNetwork(a: Network, b: Network): boolean`
  - `networkFromWallet(n: "MainNet" | "TestNet"): Network`
  - `type WatchEntry = { id: string; network: Network; alias?: string; note?: string; labelMap?: string }`
  - `type Watchlist = { version: 1; contracts: WatchEntry[] }`
  - `parseWatchlist(text): Parsed<Watchlist>`, `emptyWatchlist(): string`
  - `addContracts(text, entries: WatchEntry[]): string` (skips an id already present on the same network)
  - `updateContract(text, id: string, network: Network, patch: Partial<Omit<WatchEntry,"id"|"network">>): string` (a patch value of `undefined` removes that field)
  - `removeContract(text, id: string, network: Network): string`

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/model/networks.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { addressPrefixOf, DEFAULT_NODES, networkFromWallet, networkKey, nodeHostOf, sameNetwork } from "./networks";

describe("networks", () => {
  it("resolves hosts and prefixes", () => {
    expect(nodeHostOf("mainnet")).toBe(DEFAULT_NODES.mainnet);
    expect(nodeHostOf({ node: "https://n.example/" })).toBe("https://n.example");
    expect(addressPrefixOf("testnet")).toBe("TS");
    expect(addressPrefixOf({ node: "https://x", testnet: true })).toBe("TS");
    expect(addressPrefixOf({ node: "https://x" })).toBe("S");
  });

  it("compares by key", () => {
    expect(sameNetwork({ node: "https://x/" }, { node: "https://x" })).toBe(true);
    expect(sameNetwork("mainnet", "testnet")).toBe(false);
    expect(networkKey("testnet")).toBe("testnet");
    expect(networkFromWallet("TestNet")).toBe("testnet");
  });
});
```

`src/features/inspector/model/watchlist.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { addContracts, emptyWatchlist, parseWatchlist, removeContract, updateContract } from "./watchlist";

const text = `{
  "version": 1,
  // my contracts
  "contracts": [
    { "id": "1", "network": "testnet", "alias": "one" }, // first
  ],
}`;

const value = (t: string) => {
  const r = parseWatchlist(t);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("watchlist", () => {
  it("parses JSONC and custom nodes", () => {
    expect(value(text).contracts[0]!.alias).toBe("one");
    const custom = `{ "version": 1, "contracts": [ { "id": "2", "network": { "node": "https://n.example", "testnet": true } } ] }`;
    expect(value(custom).contracts[0]!.network).toEqual({ node: "https://n.example", testnet: true });
  });

  it("rejects a non-numeric id", () => {
    expect(parseWatchlist(`{ "version": 1, "contracts": [ { "id": "S-ABC", "network": "mainnet" } ] }`).ok).toBe(false);
  });

  it("adds without duplicates and keeps comments", () => {
    const out = addContracts(text, [
      { id: "1", network: "testnet" },
      { id: "1", network: "mainnet" },
      { id: "3", network: "testnet" },
    ]);
    expect(value(out).contracts.map((c) => `${c.id}@${c.network}`)).toEqual(["1@testnet", "1@mainnet", "3@testnet"]);
    expect(out).toContain("// my contracts");
    expect(out).toContain("// first");
  });

  it("updates and removes fields and entries", () => {
    let out = updateContract(text, "1", "testnet", { note: "hi", alias: undefined });
    expect(value(out).contracts[0]).toEqual({ id: "1", network: "testnet", note: "hi" });
    out = removeContract(out, "1", "testnet");
    expect(value(out).contracts).toEqual([]);
  });

  it("creates an empty watchlist", () => {
    expect(value(emptyWatchlist()).contracts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/model/networks.test.ts src/features/inspector/model/watchlist.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/model/networks.ts`:

```ts
import { z } from "zod";

/**
 * Where a contract lives. Mainnet and testnet use a default public node; a
 * custom node says itself whether it serves testnet, because nothing else
 * could tell the inspector which address prefix to print.
 */

export const NetworkSchema = z.union([
  z.enum(["mainnet", "testnet"]),
  z.strictObject({
    node: z.url().describe("Node base URL"),
    testnet: z.boolean().optional().describe("Whether this node serves testnet (address prefix TS)"),
  }),
]);
export type Network = z.infer<typeof NetworkSchema>;

export const DEFAULT_NODES = {
  mainnet: "https://europe.signum.network",
  testnet: "https://europe3.testnet.signum.network",
} as const;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export function nodeHostOf(network: Network): string {
  return typeof network === "string" ? DEFAULT_NODES[network] : trimSlash(network.node);
}

export function addressPrefixOf(network: Network): "S" | "TS" {
  if (network === "testnet") return "TS";
  if (typeof network === "object" && network.testnet) return "TS";
  return "S";
}

export function networkKey(network: Network): string {
  return typeof network === "string" ? network : trimSlash(network.node);
}

export function sameNetwork(a: Network, b: Network): boolean {
  return networkKey(a) === networkKey(b);
}

export function networkFromWallet(network: "MainNet" | "TestNet"): Network {
  return network === "MainNet" ? "mainnet" : "testnet";
}
```

`src/features/inspector/model/watchlist.ts`:

```ts
import { z } from "zod";
import { editDocument, parseDocument, type Parsed } from "./jsonc";
import { NetworkSchema, sameNetwork, type Network } from "./networks";

/** The contracts a `*.inspect.json` file keeps an eye on, each with its network. */

const WatchEntrySchema = z.strictObject({
  id: z.string().regex(/^\d+$/).describe("Contract id (numeric)"),
  network: NetworkSchema,
  alias: z.string().optional(),
  note: z.string().optional(),
  labelMap: z.string().optional().describe("Pinned Label Map: workspace path or file name"),
});

export const WatchlistSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  contracts: z.array(WatchEntrySchema),
});

export type WatchEntry = z.infer<typeof WatchEntrySchema>;
export type Watchlist = z.infer<typeof WatchlistSchema>;

export function parseWatchlist(text: string): Parsed<Watchlist> {
  return parseDocument(text, WatchlistSchema);
}

export function emptyWatchlist(): string {
  return JSON.stringify({ version: 1, contracts: [] }, null, 2) + "\n";
}

function current(text: string): Watchlist {
  const r = parseWatchlist(text);
  if (!r.ok) throw new Error(r.errors[0]?.message ?? "invalid watchlist");
  return r.value;
}

const indexOf = (list: Watchlist, id: string, network: Network) =>
  list.contracts.findIndex((c) => c.id === id && sameNetwork(c.network, network));

export function addContracts(text: string, entries: WatchEntry[]): string {
  let out = text;
  for (const entry of entries) {
    const list = current(out);
    if (indexOf(list, entry.id, entry.network) >= 0) continue;
    out = editDocument(out, ["contracts", list.contracts.length], entry, { insert: true });
  }
  return out;
}

export function updateContract(
  text: string,
  id: string,
  network: Network,
  patch: Partial<Omit<WatchEntry, "id" | "network">>,
): string {
  const at = indexOf(current(text), id, network);
  if (at < 0) return text;
  let out = text;
  for (const [key, value] of Object.entries(patch)) {
    out = editDocument(out, ["contracts", at, key], value);
  }
  return out;
}

export function removeContract(text: string, id: string, network: Network): string {
  const at = indexOf(current(text), id, network);
  return at < 0 ? text : editDocument(text, ["contracts", at], undefined);
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/inspector/model/networks.test.ts src/features/inspector/model/watchlist.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/model
git commit -m "feat(inspector): networks and watchlist model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Value decoding and data-stack rows

**Files:**
- Create: `src/features/inspector/model/decode.ts`
- Create: `src/features/inspector/model/data-stack.ts`
- Test: `src/features/inspector/model/decode.test.ts`, `src/features/inspector/model/data-stack.test.ts`

**Interfaces:**
- Consumes: `ValueFormat` (Task 2), `LabelMap`, `SlotLabel` (Task 2), `upsertSlot` (Task 3, test only)
- Produces:
  - `interface FormatContext { prefix: "S" | "TS"; enums: Record<string, Record<string, string>>; enumName?: string }`
  - `slotToBigInt(hex16: string): bigint` (little-endian → unsigned 64)
  - `decimalToBigInt(decimal: string): bigint` (signed or unsigned decimal → unsigned 64)
  - `formatValue(raw: bigint, format: ValueFormat, ctx: FormatContext): string`
  - `type Interpretation = { kind: ValueFormat | "stringReversed"; value: string }`
  - `allInterpretations(raw: bigint, prefix: "S" | "TS"): Interpretation[]`
  - `interface SlotRow { index: number; hex: string | null; name: string | null; label: SlotLabel | null; value: string | null; outOfRange: boolean }`
  - `slotCount(machineData: string): number`
  - `buildSlotRows(machineData: string, map: LabelMap | null, prefix: "S" | "TS"): SlotRow[]`

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/model/decode.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { allInterpretations, decimalToBigInt, formatValue, slotToBigInt } from "./decode";

const ctx = { prefix: "S" as const, enums: { st: { "0": "idle", "-1": "broken" } } };

describe("slotToBigInt", () => {
  it("reads little-endian", () => {
    expect(slotToBigInt("0100000000000000")).toBe(1n);
    expect(slotToBigInt("0001000000000000")).toBe(256n);
    expect(slotToBigInt("ffffffffffffffff")).toBe(2n ** 64n - 1n);
  });
});

describe("slot and map values agree", () => {
  // The map API returns signed decimals, slots are little-endian hex.
  it.each([
    ["ffffffffffffffff", "-1"],
    ["0000000000000080", "-9223372036854775808"],
    ["ffffffffffffff7f", "9223372036854775807"],
    ["2a00000000000000", "42"],
  ])("%s == %s", (hex, decimal) => {
    expect(slotToBigInt(hex)).toBe(decimalToBigInt(decimal));
    expect(formatValue(slotToBigInt(hex), "long", ctx)).toBe(decimal);
  });
});

describe("formatValue", () => {
  const minus1 = decimalToBigInt("-1");

  it("long, unsigned, hex, bool", () => {
    expect(formatValue(minus1, "unsigned", ctx)).toBe("18446744073709551615");
    expect(formatValue(255n, "hex", ctx)).toBe("0x00000000000000ff");
    expect(formatValue(0n, "bool", ctx)).toBe("false");
    expect(formatValue(7n, "bool", ctx)).toBe("true");
  });

  it("fixed has 8 decimals and trims zeros", () => {
    expect(formatValue(150000000n, "fixed", ctx)).toBe("1.5");
    expect(formatValue(decimalToBigInt("-1"), "fixed", ctx)).toBe("-0.00000001");
    expect(formatValue(200000000n, "fixed", ctx)).toBe("2");
  });

  it("address uses the prefix and shows 0 as 0", () => {
    expect(formatValue(0n, "address", ctx)).toBe("0");
    expect(formatValue(1n, "address", { ...ctx, prefix: "TS" })).toBe(
      Address.fromNumericId("1", "TS").getReedSolomonAddress(),
    );
  });

  it("string reads stored bytes and replaces control characters", () => {
    // "Hi" stored little-endian: 'H'=0x48 'i'=0x69 then zeros
    expect(formatValue(slotToBigInt("4869000000000000"), "string", ctx)).toBe("Hi");
    expect(formatValue(slotToBigInt("0148000000000000"), "string", ctx)).toBe("·H");
    expect(formatValue(slotToBigInt("ff00000000000000"), "string", ctx)).toBe("�");
  });

  it("enum resolves signed values and marks unknown ones", () => {
    expect(formatValue(0n, "enum", { ...ctx, enumName: "st" })).toBe("idle (0)");
    expect(formatValue(minus1, "enum", { ...ctx, enumName: "st" })).toBe("broken (-1)");
    expect(formatValue(5n, "enum", { ...ctx, enumName: "st" })).toBe("? (5)");
    expect(formatValue(5n, "enum", ctx)).toBe("? (5)");
  });
});

describe("allInterpretations", () => {
  it("lists every format but enum, plus the reversed string", () => {
    const kinds = allInterpretations(1n, "S").map((i) => i.kind);
    expect(kinds).toEqual(["long", "unsigned", "fixed", "hex", "address", "string", "stringReversed", "bool"]);
  });
});
```

`src/features/inspector/model/data-stack.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { buildSlotRows, slotCount } from "./data-stack";
import { parseLabelMap, type LabelMap } from "./label-map";
import { upsertSlot } from "./label-map-edits";

// three slots: 1, 2, -1
const data = "0100000000000000" + "0200000000000000" + "ffffffffffffffff";

const map = (text: string): LabelMap => {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("buildSlotRows", () => {
  it("shows unlabelled slots as long", () => {
    const rows = buildSlotRows(data, null, "S");
    expect(slotCount(data)).toBe(3);
    expect(rows.map((r) => r.value)).toEqual(["1", "2", "-1"]);
    expect(rows.every((r) => r.name === null && !r.outOfRange)).toBe(true);
  });

  it("names array slots and marks labels beyond the data", () => {
    const m = map(`{ "version": 1, "name": "x", "codeHashes": [],
      "slots": [ { "index": 1, "name": "arr", "length": 2, "format": "unsigned" },
                 { "index": 9, "name": "ghost" } ] }`);
    const rows = buildSlotRows(data, m, "S");
    expect(rows.map((r) => r.name)).toEqual([null, "arr[0]", "arr[1]", "ghost"]);
    expect(rows[2]!.value).toBe("18446744073709551615");
    expect(rows[3]).toMatchObject({ index: 9, outOfRange: true, hex: null, value: null });
  });

  it("set label → file text → row shows the name", () => {
    const text = `{ "version": 1, "name": "x", "codeHashes": [] }`;
    const rows = buildSlotRows(data, map(upsertSlot(text, { index: 2, name: "flag", format: "bool" })), "S");
    expect(rows[2]).toMatchObject({ name: "flag", value: "true" });
  });

  it("ignores a trailing partial slot", () => {
    expect(slotCount(data + "01")).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/model/decode.test.ts src/features/inspector/model/data-stack.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/model/decode.ts`:

```ts
import { Address } from "@signumjs/core";
import type { ValueFormat } from "./formats";

/**
 * One 64-bit value, many readings. Everything is carried as an unsigned
 * `bigint` so a slot (little-endian hex) and a map value (signed decimal from
 * the API) end up as the same number before they are formatted.
 */

export interface FormatContext {
  prefix: "S" | "TS";
  enums: Record<string, Record<string, string>>;
  enumName?: string;
}

const U64 = 64;
const FIXED_SCALE = 100_000_000n;

export function slotToBigInt(hex16: string): bigint {
  let bigEndian = "";
  for (let i = 14; i >= 0; i -= 2) bigEndian += hex16.slice(i, i + 2);
  return BigInt("0x" + (bigEndian || "0"));
}

export function decimalToBigInt(decimal: string): bigint {
  return BigInt.asUintN(U64, BigInt(decimal));
}

function bytesLE(raw: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) bytes.push(Number((raw >> BigInt(8 * i)) & 0xffn));
  return bytes;
}

function bytesToText(bytes: number[]): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes.slice(0, end)));
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, "·");
}

function fixed(signed: bigint): string {
  const negative = signed < 0n;
  const abs = negative ? -signed : signed;
  const fraction = (abs % FIXED_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + (abs / FIXED_SCALE).toString() + (fraction ? "." + fraction : "");
}

export function formatValue(raw: bigint, format: ValueFormat, ctx: FormatContext): string {
  const signed = BigInt.asIntN(U64, raw);
  switch (format) {
    case "long":
      return signed.toString();
    case "unsigned":
      return raw.toString();
    case "fixed":
      return fixed(signed);
    case "hex":
      return "0x" + raw.toString(16).padStart(16, "0");
    case "address":
      return raw === 0n ? "0" : Address.fromNumericId(raw.toString(), ctx.prefix).getReedSolomonAddress();
    case "string":
      return bytesToText(bytesLE(raw));
    case "bool":
      return raw === 0n ? "false" : "true";
    case "enum": {
      const label = ctx.enumName ? ctx.enums[ctx.enumName]?.[signed.toString()] : undefined;
      return `${label ?? "?"} (${signed})`;
    }
  }
}

export type Interpretation = { kind: ValueFormat | "stringReversed"; value: string };

export function allInterpretations(raw: bigint, prefix: "S" | "TS"): Interpretation[] {
  const ctx: FormatContext = { prefix, enums: {} };
  const kinds: ValueFormat[] = ["long", "unsigned", "fixed", "hex", "address", "string"];
  return [
    ...kinds.map((kind) => ({ kind, value: formatValue(raw, kind, ctx) })),
    { kind: "stringReversed" as const, value: bytesToText(bytesLE(raw).reverse()) },
    { kind: "bool" as const, value: formatValue(raw, "bool", ctx) },
  ];
}
```

`src/features/inspector/model/data-stack.ts`:

```ts
import { formatValue, slotToBigInt } from "./decode";
import type { LabelMap, SlotLabel } from "./label-map";

/** The data stack as table rows: one per 8-byte slot, plus labels that point past its end. */

export interface SlotRow {
  index: number;
  /** The slot's 16 hex chars as stored; null for a label beyond the data. */
  hex: string | null;
  name: string | null;
  label: SlotLabel | null;
  value: string | null;
  outOfRange: boolean;
}

const SLOT_HEX = 16;

export function slotCount(machineData: string): number {
  return Math.floor(machineData.length / SLOT_HEX);
}

function labelFor(labels: SlotLabel[], index: number): SlotLabel | null {
  return labels.find((l) => index >= l.index && index < l.index + (l.length ?? 1)) ?? null;
}

export function buildSlotRows(machineData: string, map: LabelMap | null, prefix: "S" | "TS"): SlotRow[] {
  const labels = map?.slots ?? [];
  const enums = map?.enums ?? {};
  const count = slotCount(machineData);
  const rows: SlotRow[] = [];

  for (let index = 0; index < count; index++) {
    const hex = machineData.slice(index * SLOT_HEX, (index + 1) * SLOT_HEX);
    const label = labelFor(labels, index);
    const name = label ? ((label.length ?? 1) > 1 ? `${label.name}[${index - label.index}]` : label.name) : null;
    rows.push({
      index,
      hex,
      name,
      label,
      value: formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums, enumName: label?.enum }),
      outOfRange: false,
    });
  }

  for (const label of labels) {
    if (label.index >= count) {
      rows.push({ index: label.index, hex: null, name: label.name, label, value: null, outOfRange: true });
    }
  }
  return rows;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/inspector/model/decode.test.ts src/features/inspector/model/data-stack.test.ts`
Expected: PASS. If `bun:test`'s `it.each` rejects the tuple form, rewrite that block as a `for` loop over the table with one `it` per row.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/model
git commit -m "feat(inspector): value decoding and data-stack rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Label Map resolution and merging

**Files:**
- Create: `src/features/inspector/model/resolve-label-map.ts`
- Create: `src/features/inspector/model/merge-labels.ts`
- Test: `src/features/inspector/model/resolve-label-map.test.ts`, `src/features/inspector/model/merge-labels.test.ts`

**Interfaces:**
- Consumes: `LabelMap`, `SlotLabel`, `CodeLabel` (Task 2); `editDocument` (Task 1); `parseLabelMap` (Task 2)
- Produces:
  - `interface IndexedLabelMap { fileId: string; path: string; name: string; map: LabelMap | null; errors: DocError[] }` (`map === null` means the file is invalid)
  - `type Resolution = { kind: "pinned" | "hash"; entry: IndexedLabelMap; pinnedMissing?: string } | { kind: "ambiguous"; candidates: IndexedLabelMap[]; pinnedMissing?: string } | { kind: "none"; pinnedMissing?: string }`
  - `resolveLabelMap(codeHash: string, pinned: string | undefined, maps: IndexedLabelMap[]): Resolution`
  - `interface GeneratedLabels { slots: SlotLabel[]; codeLabels: CodeLabel[]; codeHash: string; typed: boolean }`
  - `interface MergeConflict { index: number; manual: string; compiler: string }`
  - `mergeGenerated(existing: LabelMap, generated: GeneratedLabels, meta: { sourceFile: string; now: Date; network?: string }): { map: LabelMap; conflicts: MergeConflict[] }`
  - `applyMerge(text: string, merged: LabelMap): string`: edits only `slots`, `codeLabels`, `codeHashes` and `source`

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/model/resolve-label-map.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { LabelMap } from "./label-map";
import { resolveLabelMap, type IndexedLabelMap } from "./resolve-label-map";

const lm = (name: string, hashes: string[]): LabelMap => ({
  version: 1, name, codeHashes: hashes.map((hash) => ({ hash })), slots: [], maps: [], enums: {}, codeLabels: [],
});
const entry = (path: string, map: LabelMap | null): IndexedLabelMap => ({
  fileId: path, path, name: path.split("/").pop()!, map, errors: [],
});

const a = entry("/P/a.labels.json", lm("A", ["1", "2"]));
const b = entry("/Q/b.labels.json", lm("B", ["2"]));
const broken = entry("/Q/broken.labels.json", null);

describe("resolveLabelMap", () => {
  it("prefers a pinned map by path or file name", () => {
    expect(resolveLabelMap("9", "/Q/b.labels.json", [a, b])).toMatchObject({ kind: "pinned", entry: b });
    expect(resolveLabelMap("9", "b.labels.json", [a, b])).toMatchObject({ kind: "pinned", entry: b });
  });

  it("falls back to hash matching when the pinned file is gone", () => {
    expect(resolveLabelMap("1", "gone.labels.json", [a, b])).toEqual({
      kind: "hash", entry: a, pinnedMissing: "gone.labels.json",
    });
  });

  it("matches by hash, reports ambiguity and none, and skips invalid files", () => {
    expect(resolveLabelMap("1", undefined, [a, b, broken])).toEqual({ kind: "hash", entry: a });
    expect(resolveLabelMap("2", undefined, [a, b])).toEqual({ kind: "ambiguous", candidates: [a, b] });
    expect(resolveLabelMap("3", undefined, [a, b])).toEqual({ kind: "none" });
  });

  it("does not pin an invalid file", () => {
    expect(resolveLabelMap("1", "broken.labels.json", [a, broken])).toEqual({
      kind: "hash", entry: a, pinnedMissing: "broken.labels.json",
    });
  });
});
```

`src/features/inspector/model/merge-labels.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseLabelMap, type LabelMap } from "./label-map";
import { applyMerge, mergeGenerated } from "./merge-labels";

const existing: LabelMap = {
  version: 1, name: "M", codeHashes: [{ hash: "1" }], slots: [
    { index: 0, name: "old", origin: "compiler" },
    { index: 1, name: "mine", origin: "manual" },
    { index: 5, name: "import", origin: "imported" },
  ], maps: [], enums: {}, codeLabels: [{ address: 1, name: "gone", origin: "compiler" }],
};

const generated = {
  slots: [
    { index: 0, name: "counter", format: "long" as const, origin: "compiler" as const },
    { index: 1, name: "owner", format: "address" as const, origin: "compiler" as const },
    { index: 2, name: "rate", format: "fixed" as const, origin: "compiler" as const },
  ],
  codeLabels: [{ address: 7, name: "main", origin: "compiler" as const }],
  codeHash: "2",
  typed: true,
};

describe("mergeGenerated", () => {
  const { map, conflicts } = mergeGenerated(existing, generated, {
    sourceFile: "c.smart.c", now: new Date("2026-09-30T12:00:00Z"), network: "testnet",
  });

  it("replaces compiler entries and keeps manual and imported ones", () => {
    expect(map.slots.map((s) => `${s.index}:${s.name}`)).toEqual(["0:counter", "1:mine", "2:rate", "5:import"]);
    expect(map.codeLabels).toEqual(generated.codeLabels);
  });

  it("reports manual entries that shadow a compiler slot", () => {
    expect(conflicts).toEqual([{ index: 1, manual: "mine", compiler: "owner" }]);
  });

  it("adds the hash once and records the source", () => {
    expect(map.codeHashes).toEqual([{ hash: "1" }, { hash: "2", network: "testnet" }]);
    expect(map.source).toEqual({ file: "c.smart.c", generatedAt: "2026-09-30T12:00:00.000Z" });
    const again = mergeGenerated(map, generated, { sourceFile: "c.smart.c", now: new Date() });
    expect(again.map.codeHashes).toHaveLength(2);
  });
});

describe("applyMerge", () => {
  it("keeps comments outside the replaced collections", () => {
    const text = `{
  // header
  "version": 1, "name": "M",
  "codeHashes": [],
  "enums": { "e": { "0": "zero" } } // keep
}`;
    const r = parseLabelMap(text);
    if (!r.ok) throw new Error("fixture");
    const merged = mergeGenerated(r.value, generated, { sourceFile: "c.smart.c", now: new Date(0) }).map;
    const out = applyMerge(text, merged);
    expect(out).toContain("// header");
    expect(out).toContain("// keep");
    const back = parseLabelMap(out);
    expect(back.ok && back.value.slots.length).toBe(3);
    expect(back.ok && back.value.enums).toEqual({ e: { "0": "zero" } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/model/resolve-label-map.test.ts src/features/inspector/model/merge-labels.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/model/resolve-label-map.ts`:

```ts
import type { DocError } from "./jsonc";
import type { LabelMap } from "./label-map";

/**
 * Which Label Map describes a contract. A pin in the watchlist wins; otherwise
 * every valid map in the workspace that lists the contract's code hash is a
 * candidate. A pin that no longer points at a valid file is reported rather
 * than silently dropped, so the UI can offer to fix it.
 */

export interface IndexedLabelMap {
  fileId: string;
  path: string;
  name: string;
  /** Null when the file does not parse or validate. */
  map: LabelMap | null;
  errors: DocError[];
}

export type Resolution =
  | { kind: "pinned" | "hash"; entry: IndexedLabelMap; pinnedMissing?: string }
  | { kind: "ambiguous"; candidates: IndexedLabelMap[]; pinnedMissing?: string }
  | { kind: "none"; pinnedMissing?: string };

function findPinned(pinned: string, maps: IndexedLabelMap[]): IndexedLabelMap | null {
  const valid = maps.filter((m) => m.map);
  const byPath = valid.find((m) => m.path === pinned);
  if (byPath) return byPath;
  const byName = valid.filter((m) => m.name === pinned);
  return byName.length === 1 ? byName[0]! : null;
}

export function resolveLabelMap(
  codeHash: string,
  pinned: string | undefined,
  maps: IndexedLabelMap[],
): Resolution {
  if (pinned) {
    const entry = findPinned(pinned, maps);
    if (entry) return { kind: "pinned", entry };
  }
  const missing = pinned ? { pinnedMissing: pinned } : {};
  const candidates = maps.filter((m) => m.map?.codeHashes.some((h) => h.hash === codeHash));
  if (candidates.length === 1) return { kind: "hash", entry: candidates[0]!, ...missing };
  if (candidates.length > 1) return { kind: "ambiguous", candidates, ...missing };
  return { kind: "none", ...missing };
}
```

`src/features/inspector/model/merge-labels.ts`:

```ts
import { editDocument } from "./jsonc";
import type { CodeLabel, LabelMap, SlotLabel } from "./label-map";

/**
 * Regenerating from source must not cost the user their own work: entries the
 * compiler wrote are replaced wholesale, everything else stays. Where a kept
 * manual entry sits on a slot the compiler now names, the manual one wins and
 * the collision is reported.
 */

export interface GeneratedLabels {
  slots: SlotLabel[];
  codeLabels: CodeLabel[];
  codeHash: string;
  /** False when the compiler adapter fell back to names without types. */
  typed: boolean;
}

export interface MergeConflict {
  index: number;
  manual: string;
  compiler: string;
}

const fromCompiler = (e: { origin?: string }) => e.origin === "compiler";

export function mergeGenerated(
  existing: LabelMap,
  generated: GeneratedLabels,
  meta: { sourceFile: string; now: Date; network?: string },
): { map: LabelMap; conflicts: MergeConflict[] } {
  const kept = existing.slots.filter((s) => !fromCompiler(s));
  const keptIndexes = new Map(kept.map((s) => [s.index, s]));
  const conflicts: MergeConflict[] = [];

  const fresh = generated.slots.filter((s) => {
    const manual = keptIndexes.get(s.index);
    if (manual) conflicts.push({ index: s.index, manual: manual.name, compiler: s.name });
    return !manual;
  });

  const slots = [...kept, ...fresh].sort((a, b) => a.index - b.index);
  const codeLabels = [...existing.codeLabels.filter((c) => !fromCompiler(c)), ...generated.codeLabels];
  const codeHashes = existing.codeHashes.some((h) => h.hash === generated.codeHash)
    ? existing.codeHashes
    : [...existing.codeHashes, { hash: generated.codeHash, ...(meta.network ? { network: meta.network } : {}) }];

  return {
    map: {
      ...existing,
      slots,
      codeLabels,
      codeHashes,
      source: { file: meta.sourceFile, generatedAt: meta.now.toISOString() },
    },
    conflicts,
  };
}

/**
 * Writes a merge back. Only the four collections a merge changes are
 * replaced; comments inside them go with them, comments anywhere else stay.
 */
export function applyMerge(text: string, merged: LabelMap): string {
  let out = text;
  out = editDocument(out, ["codeHashes"], merged.codeHashes);
  out = editDocument(out, ["source"], merged.source);
  out = editDocument(out, ["slots"], merged.slots);
  out = editDocument(out, ["codeLabels"], merged.codeLabels);
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/inspector/model/resolve-label-map.test.ts src/features/inspector/model/merge-labels.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/model
git commit -m "feat(inspector): Label Map resolution and regeneration merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Label generator (SmartC adapter)

**Files:**
- Create: `src/features/inspector/compiler/label-generator.ts`
- Create: `src/features/inspector/compiler/__fixtures__/typed.smart.c`
- Test: `src/features/inspector/compiler/label-generator.test.ts`

**Interfaces:**
- Consumes: `GeneratedLabels` (Task 6); `SlotLabel`, `CodeLabel` (Task 2); `parseCompileError`, `ParsedError` from `@/features/smartc-editor/language/compiler-symbols`
- Produces:
  - `generateLabels(source: string): { ok: true; labels: GeneratedLabels } | { ok: false; error: ParsedError }`
  - `slotsFromMemoryTable(memory: MemorySlotLike[]): SlotLabel[]` (exported for the fallback test)
  - `slotsFromNames(names: string[]): SlotLabel[]`
  - `interface MemorySlotLike { name: string; asmName: string; type: string; declaration: string; address: number; scope: string }`

Verified at planning time against `smartc-signum-compiler@2.3.0`. For

```c
struct SALE { long price; long owner; } sale; long counter; fixed rate; long prices[3]; long *ptr; const long K = 5;
void helper(long a) { long local; ... }
```

`(compiler as any).Program.memory` holds, in address order:
- `r0..r2` with type `register`
- `f100000000` with type `fixed` (a compiler constant)
- `sale` with type `struct` and `address: -1`
- `sale_price` and `sale_owner`
- `counter` (long), `rate` (fixed)
- `prices` with type `array` and declaration `long_ptr` (the pointer slot), then `prices_0..prices_2`
- `ptr` with declaration `long_ptr`
- `K`
- `a` and `local` with `asmName` `helper_a` / `helper_local` and `scope: "helper"`

- [ ] **Step 1: Write the fixture**

`src/features/inspector/compiler/__fixtures__/typed.smart.c`:

```c
#program name Typed
#pragma version 2.3.0

struct SALE { long price; long owner; } sale;
long counter;
fixed rate;
long prices[3];
long *ptr;
const long K = 5;

void main(void) {
    counter++;
    rate = 1.5;
    prices[1] = K;
    sale.price = 2;
    helper(counter);
}

void helper(long a) {
    long local;
    local = a;
}
```

- [ ] **Step 2: Write the failing test**

`src/features/inspector/compiler/label-generator.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateLabels, slotsFromNames } from "./label-generator";

const typed = readFileSync(join(import.meta.dir, "__fixtures__/typed.smart.c"), "utf8");
const counter = readFileSync(join(import.meta.dir, "../../testbed/__fixtures__/counter.smart.c"), "utf8");

describe("generateLabels", () => {
  it("names, types, arrays, structs and scopes", () => {
    const r = generateLabels(typed);
    if (!r.ok) throw new Error(r.error.message);
    const byName = Object.fromEntries(r.labels.slots.map((s) => [s.name, s]));
    expect(r.labels.typed).toBe(true);
    expect(r.labels.codeHash).toMatch(/^\d+$/);
    expect(byName["counter"]).toMatchObject({ format: "long", origin: "compiler" });
    expect(byName["rate"]).toMatchObject({ format: "fixed" });
    expect(byName["sale.price"]).toBeDefined();
    expect(byName["sale.owner"]).toBeDefined();
    expect(byName["helper.local"]).toBeDefined();
    expect(byName["ptr"]).toMatchObject({ format: "unsigned" });
    const prices = r.labels.slots.filter((s) => s.name === "prices");
    expect(prices).toHaveLength(2);
    expect(prices[1]).toMatchObject({ length: 3, format: "long" });
    expect(prices[1]!.index).toBe(prices[0]!.index + 1);
    // registers and compiler constants are not user memory
    expect(r.labels.slots.some((s) => /^r\d+$/.test(s.name) || s.name.startsWith("f1"))).toBe(false);
  });

  it("emits code labels without compiler-internal ones", () => {
    const r = generateLabels(typed);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.labels.codeLabels.every((l) => !l.name.startsWith("__"))).toBe(true);
  });

  it("works on the testbed counter fixture", () => {
    expect(generateLabels(counter).ok).toBe(true);
  });

  it("returns a positioned compile error", () => {
    const r = generateLabels("long a = ;");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.line).toBeGreaterThan(0);
  });
});

describe("fallback", () => {
  it("maps plain names to slot positions without formats", () => {
    expect(slotsFromNames(["r0", "counter", "rate"])).toEqual([
      { index: 1, name: "counter", origin: "compiler" },
      { index: 2, name: "rate", origin: "compiler" },
    ]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/compiler`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

`src/features/inspector/compiler/label-generator.ts`:

```ts
import { SmartC } from "smartc-signum-compiler";
import { parseCompileError, type ParsedError } from "@/features/smartc-editor/language/compiler-symbols";
import type { CodeLabel, SlotLabel } from "../model/label-map";
import type { GeneratedLabels } from "../model/merge-labels";
import type { ValueFormat } from "../model/formats";

/**
 * Turns SmartC source into Label Map entries.
 *
 * The public `getMachineCode().Memory` is only names in slot order. The types
 * that make a data stack readable — fixed vs long, arrays, struct members,
 * function scopes — live in the compiler's private `Program.memory`. It is
 * read behind this one function; if a compiler update moves it, generation
 * falls back to names and says so (`typed: false`) instead of failing.
 */

export interface MemorySlotLike {
  name: string;
  asmName: string;
  type: string;
  declaration: string;
  address: number;
  scope: string;
}

const REGISTER = /^r\d+$/;
/** Compiler-emitted constants such as `f100000000` or `n32`. */
const CONSTANT = /^[fn]\d+$/;

function formatOf(declaration: string): ValueFormat {
  if (declaration === "fixed") return "fixed";
  if (declaration === "long") return "long";
  return "unsigned"; // pointers: long_ptr, struct_ptr, void_ptr, …
}

function isMemorySlotTable(value: unknown): value is MemorySlotLike[] {
  return (
    Array.isArray(value) &&
    value.every((m) => m && typeof m.asmName === "string" && typeof m.address === "number")
  );
}

export function slotsFromMemoryTable(memory: MemorySlotLike[]): SlotLabel[] {
  const structPrefixes = memory
    .filter((m) => m.type === "struct" && m.address === -1)
    .map((m) => ({ prefix: `${m.asmName}_`, name: m.scope ? `${m.scope}.${m.name}` : m.name }));

  const slots: SlotLabel[] = [];
  for (let i = 0; i < memory.length; i++) {
    const m = memory[i]!;
    if (m.address < 0 || m.type === "register" || REGISTER.test(m.asmName)) continue;
    if (m.name === m.asmName && !m.scope && CONSTANT.test(m.asmName)) continue;

    let name = m.scope ? `${m.scope}.${m.name}` : m.name;
    const struct = structPrefixes.find((s) => m.asmName.startsWith(s.prefix));
    if (struct) name = `${struct.name}.${m.asmName.slice(struct.prefix.length)}`;

    if (m.type === "array") {
      slots.push({ index: m.address, name, format: "unsigned", comment: "array pointer", origin: "compiler" }); // i18n-ignore
      const item = new RegExp(`^${m.asmName}_\\d+$`);
      let length = 0;
      while (memory[i + 1 + length] && item.test(memory[i + 1 + length]!.asmName)) length++;
      if (length > 0) {
        const first = memory[i + 1]!;
        slots.push({ index: first.address, name, format: formatOf(first.declaration), length, origin: "compiler" });
      }
      i += length;
      continue;
    }

    slots.push({ index: m.address, name, format: formatOf(m.declaration), origin: "compiler" });
  }
  return slots;
}

export function slotsFromNames(names: string[]): SlotLabel[] {
  return names
    .map((name, index) => ({ index, name, origin: "compiler" as const }))
    .filter((s) => !REGISTER.test(s.name));
}

export function generateLabels(
  source: string,
): { ok: true; labels: GeneratedLabels } | { ok: false; error: ParsedError } {
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source });
    compiler.compile();
    const mc = compiler.getMachineCode();
    const table = (compiler as unknown as { Program?: { memory?: unknown } }).Program?.memory;
    const typed = isMemorySlotTable(table);
    const codeLabels: CodeLabel[] = (mc.Labels ?? [])
      .filter((l) => !l.label.startsWith("__"))
      .map((l) => ({ address: l.address, name: l.label, origin: "compiler" }));
    return {
      ok: true,
      labels: {
        slots: typed ? slotsFromMemoryTable(table) : slotsFromNames(mc.Memory ?? []),
        codeLabels,
        codeHash: mc.MachineCodeHashId,
        typed,
      },
    };
  } catch (e) {
    return { ok: false, error: parseCompileError((e as Error)?.message ?? "") };
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/studio && bun test src/features/inspector/compiler`
Expected: PASS (5 tests). If `helper.local` is missing because SmartC drops unused locals, keep the call to `helper(counter)` in the fixture: it is there to prevent exactly that.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/inspector/compiler
git commit -m "feat(inspector): generate Label Map entries from SmartC source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Inspector client and paged search

**Files:**
- Create: `src/features/inspector/chain/inspector-client.ts`
- Create: `src/features/inspector/chain/paged-search.ts`
- Test: `src/features/inspector/chain/inspector-client.test.ts`, `src/features/inspector/chain/paged-search.test.ts`

**Interfaces:**
- Consumes: `Network`, `nodeHostOf` (Task 4); `Contract` from `@signumjs/contracts`
- Produces:
  - `type ContractStatus = "running" | "stopped" | "finished" | "frozen" | "dead"`
  - `contractStatus(c: Contract): ContractStatus`
  - `interface ContractSummary { id: string; name: string; description: string; creator: string; balance: string; status: ContractStatus; codeHash: string }` (`balance` is in planck)
  - `toSummary(c: Contract): ContractSummary`
  - `class InspectorError extends Error { kind: "not-found" | "unreachable" | "node" }`
  - `interface LedgerLike { contract: Pick<ContractApi, "getContract" | "getContractsByAccount" | "getAllContractIds" | "getAllContractsByCodeHash" | "getContractMapValuesByFirstKey" | "getSingleContractMapValue"> }`
  - `interface InspectorClient { nodeHost: string; getContract(id: string): Promise<Contract>; listByCreator(accountId: string, opts?: { codeHash?: string }): Promise<ContractSummary[]>; countByCodeHash(hash: string): Promise<number>; listByCodeHash(hash: string, page: number, pageSize: number): Promise<ContractSummary[]>; getMapByKey1(id: string, key1: string, page: number, pageSize: number, value?: string): Promise<{ key2: string; value: string }[]>; getMapValue(id: string, key1: string, key2: string): Promise<string> }`
  - `createInspectorClient(network: Network, makeLedger?: (nodeHost: string) => LedgerLike): InspectorClient` (cached per node host when `makeLedger` is omitted)
  - `interface PagedSearch<T> { rows: T[]; done: boolean; loadNext(signal: AbortSignal): Promise<void> }`
  - `createPagedSearch<T>(fetchPage: (page: number) => Promise<T[]>, pageSize: number, total?: number): PagedSearch<T>`
  - `filterSummaries(rows: ContractSummary[], query: string): ContractSummary[]`

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/chain/inspector-client.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { Contract } from "@signumjs/contracts";
import { HttpError } from "@signumjs/http";
import { contractStatus, createInspectorClient, filterSummaries, InspectorError, toSummary, type LedgerLike } from "./inspector-client";

const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    at: "1", name: "Market", description: "NFT market", creator: "9", balanceNQT: "100", machineCodeHashId: "77",
    machineData: "", running: true, stopped: false, finished: false, frozen: false, dead: false, ...over,
  }) as Contract;

function fakeLedger(ats: Contract[], calls: string[] = []): LedgerLike {
  return {
    contract: {
      getContract: async (id: string) => {
        calls.push(`get:${id}`);
        const c = ats.find((a) => a.at === id);
        if (!c) throw new HttpError("u", 200, "Unknown AT", { errorCode: 5, errorDescription: "Unknown AT" });
        return c;
      },
      getContractsByAccount: async ({ accountId }: { accountId: string }) => ({
        ats: ats.filter((a) => a.creator === accountId), requestProcessingTime: 0,
      }),
      getAllContractIds: async () => ({ atIds: ats.map((a) => a.at), requestProcessingTime: 0 }),
      getAllContractsByCodeHash: async ({ firstIndex = 0, lastIndex = 0 }: { firstIndex?: number; lastIndex?: number }) => ({
        ats: ats.slice(firstIndex, lastIndex + 1), requestProcessingTime: 0,
      }),
      getContractMapValuesByFirstKey: async ({ firstIndex = 0 }: { firstIndex?: number }) => ({
        keyValues: firstIndex === 0 ? [{ key2: "1", value: "-1" }] : [], requestProcessingTime: 0,
      }),
      getSingleContractMapValue: async () => ({ value: "5" }),
    } as unknown as LedgerLike["contract"],
  };
}

describe("status and summary", () => {
  it("picks the most significant state", () => {
    expect(contractStatus(contract())).toBe("running");
    expect(contractStatus(contract({ finished: true }))).toBe("finished");
    expect(contractStatus(contract({ stopped: true, dead: true }))).toBe("dead");
    expect(toSummary(contract())).toEqual({
      id: "1", name: "Market", description: "NFT market", creator: "9", balance: "100", status: "running", codeHash: "77",
    });
  });
});

describe("createInspectorClient", () => {
  const ats = [contract(), contract({ at: "2", name: "Other", creator: "8" }), contract({ at: "3" })];
  const client = createInspectorClient("testnet", () => fakeLedger(ats));

  it("maps unknown contracts to not-found", async () => {
    await expect(client.getContract("404")).rejects.toMatchObject({ kind: "not-found" });
  });

  it("maps network failures to unreachable", async () => {
    const down = createInspectorClient("testnet", () => ({
      contract: { getContract: async () => { throw new TypeError("Failed to fetch"); } } as unknown as LedgerLike["contract"],
    }));
    const error = await down.getContract("1").catch((e) => e);
    expect(error).toBeInstanceOf(InspectorError);
    expect(error.kind).toBe("unreachable");
  });

  it("lists by creator, counts and pages by hash", async () => {
    expect((await client.listByCreator("9")).map((s) => s.id)).toEqual(["1", "3"]);
    expect(await client.countByCodeHash("77")).toBe(3);
    expect((await client.listByCodeHash("77", 1, 2)).map((s) => s.id)).toEqual(["3"]);
  });

  it("reads maps", async () => {
    expect(await client.getMapByKey1("1", "10", 0, 100)).toEqual([{ key2: "1", value: "-1" }]);
    expect(await client.getMapValue("1", "10", "1")).toBe("5");
  });
});

describe("filterSummaries", () => {
  it("matches id, name, description and status case-insensitively", () => {
    const rows = [toSummary(contract()), toSummary(contract({ at: "2", name: "Other", finished: true }))];
    expect(filterSummaries(rows, "market").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterSummaries(rows, "FINISHED").map((r) => r.id)).toEqual(["2"]);
    expect(filterSummaries(rows, "").length).toBe(2);
  });
});
```

`src/features/inspector/chain/paged-search.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createPagedSearch } from "./paged-search";

describe("createPagedSearch", () => {
  it("appends pages and stops on a short page", async () => {
    const search = createPagedSearch(async (p) => (p < 2 ? [p * 2, p * 2 + 1] : [4]), 2);
    const signal = new AbortController().signal;
    await search.loadNext(signal);
    await search.loadNext(signal);
    expect(search.done).toBe(false);
    await search.loadNext(signal);
    expect(search.rows).toEqual([0, 1, 2, 3, 4]);
    expect(search.done).toBe(true);
  });

  it("stops at a known total", async () => {
    const search = createPagedSearch(async () => [1, 2], 2, 2);
    await search.loadNext(new AbortController().signal);
    expect(search.done).toBe(true);
  });

  it("keeps loaded rows and drops the in-flight page when aborted", async () => {
    let release!: () => void;
    const search = createPagedSearch(async (p) => {
      if (p === 1) await new Promise<void>((r) => (release = r));
      return [p];
    }, 1);
    const controller = new AbortController();
    await search.loadNext(controller.signal);
    const pending = search.loadNext(controller.signal);
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(search.rows).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/chain`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/chain/inspector-client.ts`:

```ts
import { createClient } from "@signumjs/core/createClient";
import type { ContractApi } from "@signumjs/core";
import type { Contract } from "@signumjs/contracts";
import { nodeHostOf, type Network } from "../model/networks";

/**
 * The inspector's view of the chain: read-only and wallet-free, one client per
 * node. Node errors are sorted into the three things the UI treats
 * differently — the contract is not there, the node is not there, or the node
 * said something else.
 */

export type ContractStatus = "running" | "stopped" | "finished" | "frozen" | "dead";

export interface ContractSummary {
  id: string;
  name: string;
  description: string;
  creator: string;
  /** Planck. */
  balance: string;
  status: ContractStatus;
  codeHash: string;
}

export class InspectorError extends Error {
  constructor(
    readonly kind: "not-found" | "unreachable" | "node",
    message: string,
  ) {
    super(message);
    this.name = "InspectorError";
  }
}

export interface LedgerLike {
  contract: Pick<
    ContractApi,
    | "getContract"
    | "getContractsByAccount"
    | "getAllContractIds"
    | "getAllContractsByCodeHash"
    | "getContractMapValuesByFirstKey"
    | "getSingleContractMapValue"
  >;
}

export interface InspectorClient {
  nodeHost: string;
  getContract(id: string): Promise<Contract>;
  listByCreator(accountId: string, opts?: { codeHash?: string }): Promise<ContractSummary[]>;
  countByCodeHash(hash: string): Promise<number>;
  listByCodeHash(hash: string, page: number, pageSize: number): Promise<ContractSummary[]>;
  getMapByKey1(
    id: string,
    key1: string,
    page: number,
    pageSize: number,
    value?: string,
  ): Promise<{ key2: string; value: string }[]>;
  getMapValue(id: string, key1: string, key2: string): Promise<string>;
}

export function contractStatus(c: Contract): ContractStatus {
  if (c.dead) return "dead";
  if (c.frozen) return "frozen";
  if (c.finished) return "finished";
  if (c.stopped) return "stopped";
  return "running";
}

export function toSummary(c: Contract): ContractSummary {
  return {
    id: c.at,
    name: c.name,
    description: c.description,
    creator: c.creator,
    balance: c.balanceNQT,
    status: contractStatus(c),
    codeHash: c.machineCodeHashId,
  };
}

export function filterSummaries(rows: ContractSummary[], query: string): ContractSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.id, r.name, r.description, r.status].some((field) => field.toLowerCase().includes(q)),
  );
}

/** Node error codes 4 ("Incorrect …") and 5 ("Unknown …") both mean: no such contract. */
function classify(e: unknown): InspectorError {
  const error = e as { status?: number; data?: { errorCode?: number; errorDescription?: string }; message?: string };
  const code = error?.data?.errorCode;
  const message = error?.data?.errorDescription ?? error?.message ?? String(e);
  if (code === 4 || code === 5) return new InspectorError("not-found", message);
  if (e instanceof TypeError || error?.status === 0) return new InspectorError("unreachable", message);
  return new InspectorError("node", message);
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw classify(e);
  }
}

const ledgers = new Map<string, LedgerLike>();
const defaultLedger = (nodeHost: string): LedgerLike => {
  let ledger = ledgers.get(nodeHost);
  if (!ledger) {
    ledger = createClient({ nodeHost }) as unknown as LedgerLike;
    ledgers.set(nodeHost, ledger);
  }
  return ledger;
};

export function createInspectorClient(
  network: Network,
  makeLedger: (nodeHost: string) => LedgerLike = defaultLedger,
): InspectorClient {
  const nodeHost = nodeHostOf(network);
  const { contract } = makeLedger(nodeHost);
  return {
    nodeHost,
    getContract: (id) => call(() => contract.getContract(id)),
    listByCreator: (accountId, opts = {}) =>
      call(async () =>
        (await contract.getContractsByAccount({ accountId, machineCodeHash: opts.codeHash })).ats.map(toSummary),
      ),
    countByCodeHash: (hash) =>
      call(async () => (await contract.getAllContractIds({ machineCodeHash: hash })).atIds.length),
    listByCodeHash: (hash, page, pageSize) =>
      call(async () =>
        (
          await contract.getAllContractsByCodeHash({
            machineCodeHash: hash,
            includeDetails: false,
            firstIndex: page * pageSize,
            lastIndex: (page + 1) * pageSize - 1,
          })
        ).ats.map(toSummary),
      ),
    getMapByKey1: (id, key1, page, pageSize, value) =>
      call(async () =>
        (
          await contract.getContractMapValuesByFirstKey({
            contractId: id,
            key1,
            value,
            firstIndex: page * pageSize,
            lastIndex: (page + 1) * pageSize - 1,
          })
        ).keyValues,
      ),
    getMapValue: (id, key1, key2) =>
      call(async () => (await contract.getSingleContractMapValue({ contractId: id, key1, key2 })).value),
  };
}
```

`src/features/inspector/chain/paged-search.ts`:

```ts
/**
 * Loads a long result list one page at a time. Rows already on screen survive
 * an abort; the page that was in flight is dropped, so a closed dialog never
 * receives a late write.
 */

export interface PagedSearch<T> {
  readonly rows: T[];
  readonly done: boolean;
  loadNext(signal: AbortSignal): Promise<void>;
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

export function createPagedSearch<T>(
  fetchPage: (page: number) => Promise<T[]>,
  pageSize: number,
  total?: number,
): PagedSearch<T> {
  const state = { rows: [] as T[], done: total === 0, page: 0 };
  return {
    get rows() {
      return state.rows;
    },
    get done() {
      return state.done;
    },
    async loadNext(signal) {
      if (state.done) return;
      if (signal.aborted) throw abortError();
      const page = await fetchPage(state.page);
      if (signal.aborted) throw abortError();
      state.rows = [...state.rows, ...page];
      state.page++;
      state.done = page.length < pageSize || (total !== undefined && state.rows.length >= total);
    },
  };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/inspector/chain`
Expected: PASS (9 tests). If `@signumjs/http` is not resolvable from the studio, import `HttpError` from `@signumjs/core` (it re-exports it) or construct `Object.assign(new Error("Unknown AT"), { status: 200, data: { errorCode: 5 } })` in the fake.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/chain
git commit -m "feat(inspector): wallet-free chain client and paged search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Workspace plumbing (label-map index, file updates, followed editor buffer)

**Files:**
- Create: `src/features/inspector/workspace/label-map-index.ts`
- Create: `src/features/inspector/workspace/update-file.ts`
- Create: `src/features/inspector/workspace/use-label-maps.ts`
- Create: `src/features/inspector/workspace/use-followed-file.ts`
- Modify: `src/components/ui/editor/use-editor-file.ts` (add `adopt`)
- Test: `src/features/inspector/workspace/label-map-index.test.ts`, `src/features/inspector/workspace/update-file.test.ts`

**Interfaces:**
- Consumes: `parseLabelMap` (Task 2); `IndexedLabelMap` (Task 6); `useEditorFile`, `EditorFile` (existing)
- Produces:
  - `interface WorkspaceFiles { listFilesRecursive(folderId?: string): { id: string; name: string; path: string }[]; loadFile<T>(id: string): Promise<{ content: T }> }`
  - `isLabelMapName(name: string): boolean`, `isWatchlistName(name: string): boolean`
  - `loadLabelMaps(fs: WorkspaceFiles): Promise<IndexedLabelMap[]>`
  - `updateFileText(fs: { loadFile<T>(id: string): Promise<{ content: T }>; saveFile<T>(id: string, content: T): Promise<void> }, fileId: string, edit: (text: string) => string): Promise<string>` (returns the written text; skips the write when unchanged)
  - `useLabelMaps(): IndexedLabelMap[]` (reloads on `file:*`, `fs:reloaded`)
  - `EditorFile.adopt(text: string): void` (sets the buffer without marking it dirty and drops a pending autosave)
  - `useFollowedFile(file: File): EditorFile` (`useEditorFile` that adopts external writes to the same file while the buffer is clean)

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/workspace/label-map-index.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { isLabelMapName, isWatchlistName, loadLabelMaps } from "./label-map-index";

const files = [
  { id: "a", name: "a.labels.json", path: "/P/a.labels.json" },
  { id: "b", name: "b.labels.json", path: "/P/b.labels.json" },
  { id: "c", name: "c.smart.c", path: "/P/c.smart.c" },
];
const contents: Record<string, string> = {
  a: `{ "version": 1, "name": "A", "codeHashes": [{ "hash": "1" }] }`,
  b: `{ "version": 1 `,
};
const fs = {
  listFilesRecursive: () => files,
  loadFile: async <T,>(id: string) => ({ content: contents[id] as T }),
};

describe("loadLabelMaps", () => {
  it("indexes every labels file, invalid ones with errors", async () => {
    const maps = await loadLabelMaps(fs);
    expect(maps.map((m) => m.fileId)).toEqual(["a", "b"]);
    expect(maps[0]!.map?.name).toBe("A");
    expect(maps[1]!.map).toBeNull();
    expect(maps[1]!.errors.length).toBeGreaterThan(0);
  });

  it("recognises the two file types by suffix", () => {
    expect(isLabelMapName("X.LABELS.JSON")).toBe(true);
    expect(isWatchlistName("deployments.inspect.json")).toBe(true);
    expect(isWatchlistName("a.json")).toBe(false);
  });
});
```

`src/features/inspector/workspace/update-file.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { updateFileText } from "./update-file";

describe("updateFileText", () => {
  it("writes the edited text and skips no-op edits", async () => {
    const store: Record<string, string> = { f: "a" };
    let writes = 0;
    const fs = {
      loadFile: async <T,>(id: string) => ({ content: store[id] as T }),
      saveFile: async <T,>(id: string, content: T) => {
        writes++;
        store[id] = content as string;
      },
    };
    expect(await updateFileText(fs, "f", (t) => t + "b")).toBe("ab");
    await updateFileText(fs, "f", (t) => t);
    expect(store.f).toBe("ab");
    expect(writes).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/workspace`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the pure modules**

`src/features/inspector/workspace/label-map-index.ts`:

```ts
import { parseLabelMap } from "../model/label-map";
import type { IndexedLabelMap } from "../model/resolve-label-map";

/** Every Label Map in the workspace, valid or not — resolution works across projects. */

export interface WorkspaceFiles {
  listFilesRecursive(folderId?: string): { id: string; name: string; path: string }[];
  loadFile<T>(id: string): Promise<{ content: T }>;
}

export const isLabelMapName = (name: string) => name.toLowerCase().endsWith(".labels.json");
export const isWatchlistName = (name: string) => name.toLowerCase().endsWith(".inspect.json");

export async function loadLabelMaps(fs: WorkspaceFiles): Promise<IndexedLabelMap[]> {
  const files = fs.listFilesRecursive().filter((f) => isLabelMapName(f.name));
  return Promise.all(
    files.map(async (f) => {
      const { content } = await fs.loadFile<string>(f.id);
      const parsed = parseLabelMap(typeof content === "string" ? content : "");
      return {
        fileId: f.id,
        path: f.path,
        name: f.name,
        map: parsed.ok ? parsed.value : null,
        errors: parsed.ok ? [] : parsed.errors,
      };
    }),
  );
}
```

`src/features/inspector/workspace/update-file.ts`:

```ts
/**
 * Read–edit–write for a file that is not the one open in the editor, such as
 * the Label Map a "Set label" click writes to while the watchlist is open.
 */
export async function updateFileText(
  fs: {
    loadFile<T>(id: string): Promise<{ content: T }>;
    saveFile<T>(id: string, content: T): Promise<void>;
  },
  fileId: string,
  edit: (text: string) => string,
): Promise<string> {
  const { content } = await fs.loadFile<string>(fileId);
  const before = typeof content === "string" ? content : "";
  const after = edit(before);
  if (after !== before) await fs.saveFile(fileId, after);
  return after;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/studio && bun test src/features/inspector/workspace`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `adopt` to `useEditorFile`**

In `src/components/ui/editor/use-editor-file.ts`:

Add to the `EditorFile` interface, after `download: () => void;`:

```ts
  /**
   * Takes text written to this file from elsewhere — the inspector setting a
   * label while this editor is open — without calling it an edit. A pending
   * autosave is dropped: it would write the stale buffer back over the change.
   */
  adopt: (text: string) => void;
```

Add before the final `return`:

```ts
  const adopt = useCallback(
    (next: string) => {
      autosave.cancel();
      textRef.current = next;
      setText(next);
      setIsDirty(false);
    },
    [autosave],
  );
```

Change the return to `return { text, textRef, onChange, isDirty, save, saveNow, download, adopt };`.

- [ ] **Step 6: Implement the hooks**

`src/features/inspector/workspace/use-label-maps.ts`:

```ts
import { useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { loadLabelMaps } from "./label-map-index";

/**
 * The workspace's Label Maps, kept current. Any file event may be a label
 * change — including one this tab wrote through "Set label" — so every open
 * inspection re-resolves without being told.
 */
export function useLabelMaps(): IndexedLabelMap[] {
  const fs = useFileSystem();
  const [maps, setMaps] = useState<IndexedLabelMap[]>([]);

  useEffect(() => {
    let generation = 0;
    const reload = () => {
      const mine = ++generation;
      loadLabelMaps(fs)
        .then((next) => mine === generation && setMaps(next))
        .catch(() => mine === generation && setMaps([]));
    };
    reload();
    fs.addEventListener("file:*", reload);
    fs.addEventListener("fs:reloaded", reload);
    return () => {
      generation = -1;
      fs.removeEventListener("file:*", reload);
      fs.removeEventListener("fs:reloaded", reload);
    };
  }, [fs]);

  return maps;
}
```

`src/features/inspector/workspace/use-followed-file.ts`:

```ts
import { useEffect } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useEditorFile, type EditorFile } from "@/components/ui/editor/use-editor-file.ts";
import type { File, FileSystemEvent } from "@/lib/file-system";

/**
 * An editor buffer that follows writes made elsewhere while it has nothing
 * unsaved. Without this, a Label Map open here would autosave its old text
 * over a label the inspector just set.
 */
export function useFollowedFile(file: File): EditorFile {
  const fs = useFileSystem();
  const editor = useEditorFile({ file });
  const { isDirty, textRef, adopt } = editor;

  useEffect(() => {
    // File-system events are CustomEvents carrying the FileSystemEvent in `detail`.
    const onUpdated = (e: Event) => {
      const event = (e as CustomEvent<FileSystemEvent>).detail;
      if (event?.id !== file.metadata.id || isDirty) return;
      fs.loadFile<string>(file.metadata.id)
        .then(({ content }) => {
          if (typeof content === "string" && content !== textRef.current) adopt(content);
        })
        .catch(() => undefined);
    };
    fs.addEventListener("file:updated", onUpdated);
    return () => fs.removeEventListener("file:updated", onUpdated);
  }, [fs, file.metadata.id, isDirty, textRef, adopt]);

  return editor;
}
```

- [ ] **Step 7: Run all inspector tests and the editor's dependents**

Run: `cd apps/studio && bun test src/features/inspector src/components`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/features/inspector/workspace apps/studio/src/components/ui/editor/use-editor-file.ts
git commit -m "feat(inspector): workspace Label Map index and followed editor buffers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Monaco JSON setup, file types, JSONC source editor

**Files:**
- Create: `src/features/inspector/model/schemas.ts`
- Create: `src/features/inspector/monaco/register-json.ts`
- Create: `src/features/inspector/ui/jsonc-source-editor.tsx`
- Modify: `src/features/project/filetype-icons.tsx`
- Modify: `src/features/project/new-file-dialog.tsx`
- Modify: `src/features/simulator/scenario/scenario-editor.tsx`
- Test: `src/features/inspector/model/schemas.test.ts`, `src/features/project/filetype-icons.test.ts` (extend)

**Interfaces:**
- Consumes: `LabelMapSchema` (Task 2), `WatchlistSchema` (Task 4), `emptyLabelMap`, `emptyWatchlist`, `useFollowedFile` (Task 9)
- Produces:
  - `labelMapJsonSchema(): object`, `watchlistJsonSchema(): object`
  - `registerStudioJson(monaco: Monaco): void` (idempotent). It registers both schemas with `validate: true`, comments and trailing commas allowed, and the `json5` language (Monarch tokens and a `jsonc-parser` formatter).
  - `FileTypes.LabelMap = "labels"`, `FileTypes.Watchlist = "inspect"`
  - `<JsoncSourceEditor editor={EditorFile} path={string} onMount?={(editor) => void} />`

- [ ] **Step 1: Write the failing tests**

`src/features/inspector/model/schemas.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { labelMapJsonSchema, watchlistJsonSchema } from "./schemas";

describe("JSON Schemas for Monaco", () => {
  it("carries the formats enum and descriptions", () => {
    const text = JSON.stringify(labelMapJsonSchema());
    expect(text).toContain('"fixed"');
    expect(text).toContain("Memory slot index");
    expect(JSON.stringify(watchlistJsonSchema())).toContain("Contract id");
  });
});
```

Append to `src/features/project/filetype-icons.test.ts` (inside its top-level `describe` or as a new one):

```ts
describe("inspection file types", () => {
  it("accepts labels and watchlists before any generic rule", () => {
    expect(acceptedFileType("nft.labels.json")).toBe(FileTypes.LabelMap);
    expect(acceptedFileType("deployments.inspect.json")).toBe(FileTypes.Watchlist);
    expect(acceptedFileType("x.scenario.json")).toBe(FileTypes.Scenario);
  });
});
```

Make sure `acceptedFileType` and `FileTypes` are imported at the top of that test file.

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/inspector/model/schemas.test.ts src/features/project/filetype-icons.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schemas and file types**

`src/features/inspector/model/schemas.ts`:

```ts
import { z } from "zod";
import { LabelMapSchema } from "./label-map";
import { WatchlistSchema } from "./watchlist";

/**
 * JSON Schemas for Monaco, derived from the same Zod schemas the model
 * validates with — one source, so completion and validation cannot disagree.
 * Refinements (enum names must exist) are not representable and stay Zod-only.
 */
export const labelMapJsonSchema = () => z.toJSONSchema(LabelMapSchema, { unrepresentable: "any", io: "input" });
export const watchlistJsonSchema = () => z.toJSONSchema(WatchlistSchema, { unrepresentable: "any", io: "input" });
```

In `src/features/project/filetype-icons.tsx`:
- import `TagsIcon` and `ScanSearchIcon` from `lucide-react`
- add `LabelMap = "labels",` and `Watchlist = "inspect",` to `enum FileTypes`
- add `[FileTypes.LabelMap]: TagsIcon,` and `[FileTypes.Watchlist]: ScanSearchIcon,` to `FileTypeIcons`
- in `acceptedFileType`, before the `.scenario.json` check, add:

```ts
  if (lower.endsWith(".labels.json")) return FileTypes.LabelMap;
  if (lower.endsWith(".inspect.json")) return FileTypes.Watchlist;
```

- extend the doc comment's "Accepted:" list with `Label Map (\`.labels.json\`), Watchlist (\`.inspect.json\`)`

In `src/features/project/new-file-dialog.tsx`:
- add `[FileTypes.LabelMap]: ".labels.json",` and `[FileTypes.Watchlist]: ".inspect.json",` to `EXT`
- import `emptyLabelMap` from `@/features/inspector/model/label-map` and `emptyWatchlist` from `@/features/inspector/model/watchlist`
- extend the `content` expression:

```ts
    const content =
      type === FileTypes.Scenario
        ? serializeScenario(defaultScenario())
        : type === FileTypes.Test
          ? testStarter(finalName, contract)
          : type === FileTypes.LabelMap
            ? emptyLabelMap(base)
            : type === FileTypes.Watchlist
              ? emptyWatchlist()
              : smartcStarter(finalName.slice(0, -ext.length));
```

- add two `SelectItem`s after the Test item:

```tsx
                <SelectItem value={FileTypes.Watchlist}>{t("project.newFile.watchlist")}</SelectItem>
                <SelectItem value={FileTypes.LabelMap}>{t("project.newFile.labelMap")}</SelectItem>
```

Add to `src/i18n/locales/en/project.json` under `newFile`: `"watchlist": "Inspection watchlist"` and `"labelMap": "Label Map"`.

- [ ] **Step 4: Implement the Monaco registration**

`src/features/inspector/monaco/register-json.ts`:

```ts
import type { Monaco } from "@monaco-editor/react";
import { format } from "jsonc-parser";
import { labelMapJsonSchema, watchlistJsonSchema } from "../model/schemas";

/**
 * Monaco's JSON diagnostics options are global to the instance, not per
 * model. The scenario editor used to switch validation off for everything to
 * make room for JSON5; it now has its own `json5` language instead, which the
 * JSON worker never sees, so the inspector files can be validated against
 * their schemas.
 */

let registered = false;

export function registerStudioJson(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.json?.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    comments: "ignore",
    trailingCommas: "ignore",
    enableSchemaRequest: false,
    schemas: [
      {
        uri: "studio://schemas/labels.json", // i18n-ignore
        fileMatch: ["*.labels.json", "**/*.labels.json"], // i18n-ignore
        schema: labelMapJsonSchema(),
      },
      {
        uri: "studio://schemas/inspect.json", // i18n-ignore
        fileMatch: ["*.inspect.json", "**/*.inspect.json"], // i18n-ignore
        schema: watchlistJsonSchema(),
      },
    ],
  } as Parameters<typeof monaco.languages.json.jsonDefaults.setDiagnosticsOptions>[0]);

  monaco.languages.register({ id: "json5" });
  monaco.languages.setMonarchTokensProvider("json5", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "type"],
        [/[A-Za-z_$][\w$]*(?=\s*:)/, "type"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
        [/-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/, "number"],
        [/\b(?:true|false|null)\b/, "keyword"],
        [/[{}[\],:]/, "delimiter"],
      ],
      comment: [
        [/\*\//, "comment", "@pop"],
        [/[^*]+/, "comment"],
        [/\*/, "comment"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("json5", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [["{", "}"], ["[", "]"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerDocumentFormattingEditProvider("json5", {
    provideDocumentFormattingEdits(model, options) {
      return format(model.getValue(), undefined, {
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      }).map((edit) => {
        const start = model.getPositionAt(edit.offset);
        const end = model.getPositionAt(edit.offset + edit.length);
        return {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          text: edit.content,
        };
      });
    },
  });
}
```

- [ ] **Step 5: Move the scenario editor to `json5`**

In `src/features/simulator/scenario/scenario-editor.tsx`:
- import `registerStudioJson` from `@/features/inspector/monaco/register-json`
- change `defaultLanguage="json"` to `defaultLanguage="json5"`
- replace the `beforeMount` body with:

```ts
          beforeMount={(monaco) => {
            registerClimateThemes(monaco);
            // Scenarios are JSON5; the `json5` language keeps them out of the
            // JSON worker, whose options are global and now validate the
            // inspector files. See register-json.ts.
            registerStudioJson(monaco);
          }}
```

The format button keeps working: it runs `editor.action.formatDocument`, which now reaches the `json5` formatting provider.

- [ ] **Step 6: Implement `JsoncSourceEditor`**

`src/features/inspector/ui/jsonc-source-editor.tsx`:

```tsx
import Editor, { type OnMount } from "@monaco-editor/react";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { EDITOR_SCROLLBAR, registerClimateThemes } from "@/theme/monaco-themes";
import { registerEditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { EditorFile } from "@/components/ui/editor/use-editor-file.ts";
import { registerStudioJson } from "../monaco/register-json";

/**
 * The raw-text view of a watchlist or Label Map. The model's `path` is the
 * file's workspace path, which is what the registered schemas' `fileMatch`
 * patterns see — that is how completion and validation find the right schema.
 */
export function JsoncSourceEditor({
  editor,
  path,
  onMount,
}: {
  editor: EditorFile;
  path: string;
  onMount?: Parameters<OnMount>[0] extends infer E ? (editor: E) => void : never;
}) {
  const monacoTheme = useMonacoTheme("json");
  return (
    <div className="min-h-0 flex-1 rounded">
      <Editor
        height="100%"
        path={path}
        defaultLanguage="json"
        value={editor.text}
        theme={monacoTheme}
        onChange={editor.onChange}
        beforeMount={(monaco) => {
          registerClimateThemes(monaco);
          registerStudioJson(monaco);
        }}
        onMount={(instance, monaco) => {
          registerEditorFileActions(instance, monaco, { onDownload: editor.download });
          onMount?.(instance);
        }}
        options={{
          minimap: { enabled: false },
          scrollbar: EDITOR_SCROLLBAR,
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run tests, regenerate i18n types**

Run:
```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector src/features/project src/features/simulator
```
Expected: PASS.

- [ ] **Step 8: Manual check in the running app**

Run `cd apps/studio && bun run dev`. In a project:
1. Create a new file of type "Label Map" and open it. It opens as "unsupported" until Task 13, so check the JSON editor in Task 13 instead.
2. Open an existing `.scenario.json`: highlighting and comments still work, and **Format** still formats.

- [ ] **Step 9: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): file types, Monaco schemas and json5 scenarios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Inspector editor shell (watchlist, contract loading, overview)

**Files:**
- Create: `src/features/inspector/ui/inspector-editor.tsx`
- Create: `src/features/inspector/ui/watchlist-panel.tsx`
- Create: `src/features/inspector/ui/contract-view.tsx`
- Create: `src/features/inspector/ui/overview-tab.tsx`
- Create: `src/features/inspector/ui/use-contract.ts`
- Create: `src/features/inspector/ui/label-map-actions.ts`
- Modify: `src/pages/files/files-page.tsx`
- Modify: `src/features/project/new-project-dialog.tsx`
- Modify: `src/i18n/locales/en/inspector.json`
- Test: `src/features/inspector/ui/label-map-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–10 (`parseWatchlist`, `updateContract`, `removeContract`, `createInspectorClient`, `InspectorError`, `toSummary`, `resolveLabelMap`, `Resolution`, `useLabelMaps`, `useFollowedFile`, `JsoncSourceEditor`, `emptyLabelMap`, `addCodeHash`, `updateFileText`, `addressPrefixOf`)
- Produces:
  - `useContract(entry: WatchEntry | null): { state: "idle" | "loading" | "ready" | "error"; contract: Contract | null; error: InspectorError | null; refresh(): void; client: InspectorClient | null }`
  - `labelMapFileName(base: string, taken: string[]): string`
  - `createLabelMapFor(fs, folderId: string, base: string, codeHash: string, network: string): Promise<string>` (returns the new fileId)
  - `addHashToLabelMap(fs, fileId: string, codeHash: string, network: string): Promise<void>`
  - `<InspectorEditor file={File} />`, `<ContractView entry={WatchEntry} folderId={string} onPin={(path) => void} />`, `<OverviewTab … />`

- [ ] **Step 1: Add the English strings**

Merge into `src/i18n/locales/en/inspector.json` (keep `validation`):

```json
{
  "editor": {
    "viewUi": "Inspector",
    "viewJson": "JSON",
    "invalid": "This file has {count, plural, one {# problem} other {# problems}}. Fix it in the JSON view.",
    "empty": "No contracts yet. Add one to start inspecting.",
    "add": "Add contract",
    "refresh": "Refresh",
    "remove": "Remove from watchlist",
    "select": "Select a contract on the left."
  },
  "status": {
    "running": "Running",
    "stopped": "Stopped",
    "finished": "Finished",
    "frozen": "Frozen",
    "dead": "Dead"
  },
  "network": {
    "mainnet": "Mainnet",
    "testnet": "Testnet",
    "custom": "Custom node"
  },
  "contract": {
    "loading": "Loading contract…",
    "notFound": "Contract {id} was not found on {node}. A contract deployed moments ago appears once its transaction is in a block.",
    "unreachable": "The node {node} did not answer: {message}",
    "nodeError": "The node reported: {message}",
    "retry": "Retry",
    "noLabels": "No Label Map",
    "tabs": { "overview": "Overview", "data": "Data stack", "maps": "Maps" }
  },
  "overview": {
    "id": "Contract",
    "name": "Name",
    "description": "Description",
    "creator": "Creator",
    "balance": "Balance",
    "status": "Status",
    "codeHash": "Code hash",
    "creationBlock": "Created at block",
    "minActivation": "Minimum activation",
    "labelMap": "Label Map",
    "resolvedByHash": "matched by code hash",
    "resolvedByPin": "pinned in this watchlist",
    "pinnedMissing": "The pinned Label Map \"{name}\" is missing or invalid.",
    "ambiguous": "Several Label Maps list this code hash. Choose one:",
    "choose": "Use this one",
    "none": "No Label Map lists this code hash.",
    "create": "Create Label Map",
    "addHash": "Add this hash to…",
    "created": "Label Map created",
    "hashAdded": "Code hash added to {name}"
  }
}
```

Run `cd apps/studio && bun run i18n:types`.

- [ ] **Step 2: Write the failing test for the label-map actions**

`src/features/inspector/ui/label-map-actions.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseLabelMap } from "../model/label-map";
import { addHashToLabelMap, createLabelMapFor, labelMapFileName } from "./label-map-actions";

function fakeFs() {
  const store: Record<string, string> = {};
  const names: Record<string, string> = {};
  return {
    store,
    listFolderContents: () => ({ files: Object.keys(store).map((id) => ({ metadata: { name: names[id]! } })), folders: [] }),
    addFile: async <T,>(_folder: string, name: string, _type: string, content: T) => {
      const id = `f${Object.keys(store).length}`;
      store[id] = content as string;
      names[id] = name;
      return id;
    },
    loadFile: async <T,>(id: string) => ({ content: store[id] as T }),
    saveFile: async <T,>(id: string, content: T) => void (store[id] = content as string),
  };
}

describe("label map actions", () => {
  it("names files uniquely", () => {
    expect(labelMapFileName("NFT Market", [])).toBe("NFT-Market.labels.json");
    expect(labelMapFileName("x", ["x.labels.json"])).not.toBe("x.labels.json");
  });

  it("creates a map for a hash and adds hashes once", async () => {
    const fs = fakeFs();
    const id = await createLabelMapFor(fs, "folder", "Market", "77", "testnet");
    await addHashToLabelMap(fs, id, "88", "mainnet");
    await addHashToLabelMap(fs, id, "88", "mainnet");
    const r = parseLabelMap(fs.store[id]!);
    expect(r.ok && r.value.codeHashes).toEqual([
      { hash: "77", network: "testnet" },
      { hash: "88", network: "mainnet" },
    ]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/ui/label-map-actions.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement the actions**

`src/features/inspector/ui/label-map-actions.ts`:

```ts
import { replaceWhitespace } from "@/lib/string";
import { uniqueName } from "@/features/project/file-naming";
import { FileTypes } from "@/features/project/filetype-icons";
import { emptyLabelMap } from "../model/label-map";
import { addCodeHash } from "../model/label-map-edits";
import { updateFileText } from "../workspace/update-file";

/** Creating and extending Label Maps from the inspector, where there is a contract but maybe no map yet. */

const EXT = ".labels.json";

export function labelMapFileName(base: string, taken: string[]): string {
  return uniqueName(`${replaceWhitespace(base.trim() || "contract")}${EXT}`, taken, EXT); // i18n-ignore
}

interface CreatingFs {
  listFolderContents(folderId?: string): { files: { metadata: { name: string } }[] };
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
}

export async function createLabelMapFor(
  fs: CreatingFs,
  folderId: string,
  base: string,
  codeHash: string,
  network: string,
): Promise<string> {
  const taken = fs.listFolderContents(folderId).files.map((f) => f.metadata.name);
  const name = labelMapFileName(base, taken);
  return fs.addFile(folderId, name, FileTypes.LabelMap, emptyLabelMap(base, [{ hash: codeHash, network }]));
}

export async function addHashToLabelMap(
  fs: Parameters<typeof updateFileText>[0],
  fileId: string,
  codeHash: string,
  network: string,
): Promise<void> {
  await updateFileText(fs, fileId, (text) => addCodeHash(text, { hash: codeHash, network }));
}
```

Check `uniqueName`'s signature in `src/features/project/file-naming.ts` before using it. The call above assumes `uniqueName(name, taken, ext)`, as used in `new-file-dialog.tsx`.

Run: `cd apps/studio && bun test src/features/inspector/ui/label-map-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `useContract`**

`src/features/inspector/ui/use-contract.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { createInspectorClient, InspectorError, type InspectorClient } from "../chain/inspector-client";
import { networkKey } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";

type State = "idle" | "loading" | "ready" | "error";

/** One contract fetched from its node; refetched on demand, never polled (M1). */
export function useContract(entry: WatchEntry | null) {
  const key = entry ? `${entry.id}@${networkKey(entry.network)}` : "";
  const client: InspectorClient | null = useMemo(
    () => (entry ? createInspectorClient(entry.network) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ state: State; contract: Contract | null; error: InspectorError | null }>({
    state: "idle", contract: null, error: null,
  });

  useEffect(() => {
    if (!entry || !client) {
      setResult({ state: "idle", contract: null, error: null });
      return;
    }
    let cancelled = false;
    setResult((r) => ({ ...r, state: "loading", error: null }));
    client
      .getContract(entry.id)
      .then((contract) => !cancelled && setResult({ state: "ready", contract, error: null }))
      .catch((e) =>
        !cancelled &&
        setResult({
          state: "error",
          contract: null,
          error: e instanceof InspectorError ? e : new InspectorError("node", String(e)),
        }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  return { ...result, refresh, client };
}
```

- [ ] **Step 6: Implement the UI components**

`src/features/inspector/ui/watchlist-panel.tsx`:

```tsx
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import type { ContractStatus } from "../chain/inspector-client";
import { networkKey, type Network } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";

/** Spelled out, so every key stays visible to the typed `t` and the i18n scanner. */
export function statusLabel(status: ContractStatus): string {
  switch (status) {
    case "running":
      return t("inspector.status.running");
    case "stopped":
      return t("inspector.status.stopped");
    case "finished":
      return t("inspector.status.finished");
    case "frozen":
      return t("inspector.status.frozen");
    case "dead":
      return t("inspector.status.dead");
  }
}

export function networkLabel(network: Network): string {
  if (network === "mainnet") return t("inspector.network.mainnet");
  if (network === "testnet") return t("inspector.network.testnet");
  return new URL(network.node).host;
}

export const entryKey = (e: WatchEntry) => `${e.id}@${networkKey(e.network)}`;

export function WatchlistPanel({
  entries,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  entries: WatchEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
  onAdd: () => void;
  onRemove: (entry: WatchEntry) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b p-2">
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {t("inspector.editor.add")}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{t("inspector.editor.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {entries.map((entry) => {
            const key = entryKey(entry);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={cn(
                    "group flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                    selected === key && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.alias ?? entry.id}</span>
                    {entry.alias && (
                      <span className="block truncate font-mono text-xs text-muted-foreground">{entry.id}</span>
                    )}
                  </span>
                  <Badge variant="outline">{networkLabel(entry.network)}</Badge>
                  <span
                    role="button"
                    tabIndex={0}
                    title={t("inspector.editor.remove")}
                    className="invisible text-muted-foreground group-hover:visible"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(entry);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
```

`src/features/inspector/ui/overview-tab.tsx`:

```tsx
import type { Contract } from "@signumjs/contracts";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { KVTable } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";
import { contractStatus } from "../chain/inspector-client";
import type { IndexedLabelMap, Resolution } from "../model/resolve-label-map";
import { statusLabel } from "./watchlist-panel";

export function OverviewTab({
  contract,
  resolution,
  labelMaps,
  onPin,
  onCreate,
  onAddHash,
}: {
  contract: Contract;
  resolution: Resolution;
  labelMaps: IndexedLabelMap[];
  onPin: (entry: IndexedLabelMap) => void;
  onCreate: () => void;
  onAddHash: (entry: IndexedLabelMap) => void;
}) {
  const rows = [
    { k: t("inspector.overview.id"), v: `${contract.atRS} (${contract.at})` },
    { k: t("inspector.overview.name"), v: contract.name },
    { k: t("inspector.overview.description"), v: contract.description || "—" },
    { k: t("inspector.overview.creator"), v: `${contract.creatorRS} (${contract.creator})` },
    { k: t("inspector.overview.status"), v: statusLabel(contractStatus(contract)) },
    { k: t("inspector.overview.codeHash"), v: contract.machineCodeHashId },
    { k: t("inspector.overview.creationBlock"), v: String(contract.creationBlock) },
  ];
  const valid = labelMaps.filter((m) => m.map);

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("inspector.overview.balance")}</span>
        <Amount amount={contract.balanceNQT} isAtomic />
        <span className="text-muted-foreground">{t("inspector.overview.minActivation")}</span>
        <Amount amount={contract.minActivation} isAtomic />
      </div>
      <KVTable rows={rows} />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t("inspector.overview.labelMap")}</h3>
        {resolution.pinnedMissing && (
          <p className="text-[var(--amber)]">
            {t("inspector.overview.pinnedMissing", { name: resolution.pinnedMissing })}
          </p>
        )}
        {(resolution.kind === "pinned" || resolution.kind === "hash") && (
          <p>
            {resolution.entry.name}{" "}
            <span className="text-muted-foreground">
              ({resolution.kind === "pinned" ? t("inspector.overview.resolvedByPin") : t("inspector.overview.resolvedByHash")})
            </span>
          </p>
        )}
        {resolution.kind === "ambiguous" && (
          <div className="flex flex-col gap-1">
            <p>{t("inspector.overview.ambiguous")}</p>
            {resolution.candidates.map((c) => (
              <div key={c.fileId} className="flex items-center gap-2">
                <span className="font-mono text-xs">{c.path}</span>
                <Button size="sm" variant="outline" onClick={() => onPin(c)}>
                  {t("inspector.overview.choose")}
                </Button>
              </div>
            ))}
          </div>
        )}
        {resolution.kind === "none" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("inspector.overview.none")}</span>
            <Button size="sm" onClick={onCreate}>
              {t("inspector.overview.create")}
            </Button>
            {valid.length > 0 && (
              <select
                className="rounded border bg-transparent px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const target = valid.find((m) => m.fileId === e.target.value);
                  if (target) onAddHash(target);
                }}
              >
                <option value="" disabled>
                  {t("inspector.overview.addHash")}
                </option>
                {valid.map((m) => (
                  <option key={m.fileId} value={m.fileId}>
                    {m.path}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
```

`src/features/inspector/ui/contract-view.tsx`:

```tsx
import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { addressPrefixOf, networkKey } from "../model/networks";
import { resolveLabelMap, type IndexedLabelMap } from "../model/resolve-label-map";
import type { WatchEntry } from "../model/watchlist";
import { useLabelMaps } from "../workspace/use-label-maps";
import { addHashToLabelMap, createLabelMapFor } from "./label-map-actions";
import { OverviewTab } from "./overview-tab";
import { DataStackTab } from "./data-stack-tab";
import { MapsTab } from "./maps-tab";
import { useContract } from "./use-contract";

/**
 * One contract: fetched from its node, labelled by whichever Label Map the
 * workspace resolves for its code hash. Everything below re-renders from the
 * files, so a label set anywhere shows here without a second copy of state.
 */
export function ContractView({
  entry,
  folderId,
  onPin,
}: {
  entry: WatchEntry;
  folderId: string;
  onPin: (path: string) => void;
}) {
  const fs = useFileSystem();
  const labelMaps = useLabelMaps();
  const { state, contract, error, refresh, client } = useContract(entry);
  const resolution = useMemo(
    () => resolveLabelMap(contract?.machineCodeHashId ?? "", entry.labelMap, labelMaps),
    [contract?.machineCodeHashId, entry.labelMap, labelMaps],
  );
  const active: IndexedLabelMap | null =
    resolution.kind === "pinned" || resolution.kind === "hash" ? resolution.entry : null;
  const prefix = addressPrefixOf(entry.network);
  const network = networkKey(entry.network);

  const createMap = async (): Promise<string | null> => {
    if (!contract) return null;
    try {
      const id = await createLabelMapFor(fs, folderId, entry.alias ?? contract.name, contract.machineCodeHashId, network);
      toast.success(t("inspector.overview.created"));
      return id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <ToolbarButton onClick={refresh} disabled={state === "loading"}>
            <RefreshCw className="h-4 w-4" /> {t("inspector.editor.refresh")}
          </ToolbarButton>
        }
        context={
          state === "ready" && !active ? (
            <ToolbarDiagnostic tone="warning">{t("inspector.contract.noLabels")}</ToolbarDiagnostic>
          ) : null
        }
      />
      {state === "loading" && !contract && (
        <p className="p-4 text-sm text-muted-foreground">{t("inspector.contract.loading")}</p>
      )}
      {state === "error" && error && (
        <div className="m-4 flex flex-col gap-2 rounded border border-[var(--mag)] p-4 text-sm">
          <p>
            {error.kind === "not-found"
              ? t("inspector.contract.notFound", { id: entry.id, node: client?.nodeHost ?? "" })
              : error.kind === "unreachable"
                ? t("inspector.contract.unreachable", { node: client?.nodeHost ?? "", message: error.message })
                : t("inspector.contract.nodeError", { message: error.message })}
          </p>
          <Button size="sm" variant="outline" className="self-start" onClick={refresh}>
            {t("inspector.contract.retry")}
          </Button>
        </div>
      )}
      {contract && client && (
        <Tabs defaultValue="data" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-2 self-start">
            <TabsTrigger value="overview">{t("inspector.contract.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="data">{t("inspector.contract.tabs.data")}</TabsTrigger>
            <TabsTrigger value="maps">{t("inspector.contract.tabs.maps")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
            <OverviewTab
              contract={contract}
              resolution={resolution}
              labelMaps={labelMaps}
              onPin={(m) => onPin(m.path)}
              onCreate={() => void createMap()}
              onAddHash={(m) =>
                addHashToLabelMap(fs, m.fileId, contract.machineCodeHashId, network)
                  .then(() => toast.success(t("inspector.overview.hashAdded", { name: m.name })))
                  .catch((e) => toast.error((e as Error).message))
              }
            />
          </TabsContent>
          <TabsContent value="data" className="min-h-0 flex-1 overflow-hidden">
            <DataStackTab contract={contract} labelMap={active} prefix={prefix} ensureLabelMap={createMap} />
          </TabsContent>
          <TabsContent value="maps" className="min-h-0 flex-1 overflow-auto">
            <MapsTab contract={contract} client={client} labelMap={active} prefix={prefix} ensureLabelMap={createMap} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

`DataStackTab` and `MapsTab` are created in Tasks 12 and 13. For this task, create them as stubs so the build stays green. They are replaced there:

```tsx
// src/features/inspector/ui/data-stack-tab.tsx (stub, replaced in Task 12)
export function DataStackTab(_: {
  contract: import("@signumjs/contracts").Contract;
  labelMap: import("../model/resolve-label-map").IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  return null;
}
```

```tsx
// src/features/inspector/ui/maps-tab.tsx (stub, replaced in Task 13)
export function MapsTab(_: {
  contract: import("@signumjs/contracts").Contract;
  client: import("../chain/inspector-client").InspectorClient;
  labelMap: import("../model/resolve-label-map").IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  return null;
}
```

`src/features/inspector/ui/inspector-editor.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { EditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { File } from "@/lib/file-system";
import { t } from "@/i18n/runtime";
import { addContracts, parseWatchlist, removeContract, updateContract, type WatchEntry } from "../model/watchlist";
import { useFollowedFile } from "../workspace/use-followed-file";
import { JsoncSourceEditor } from "./jsonc-source-editor";
import { ContractView } from "./contract-view";
import { entryKey, WatchlistPanel } from "./watchlist-panel";
import { AddContractDialog } from "./add-contract-dialog";

/**
 * The editor for a `*.inspect.json`: the watchlist on the left, the selected
 * contract on the right. A file that does not validate opens in its JSON view
 * — the inspector never rewrites a file it cannot read.
 */
export function InspectorEditor({ file }: { file: File }) {
  const editor = useFollowedFile(file);
  const parsed = useMemo(() => parseWatchlist(editor.text), [editor.text]);
  const [view, setView] = useState<"ui" | "json">(parsed.ok ? "ui" : "json");
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const entries = parsed.ok ? parsed.value.contracts : [];
  // `?contract=<id>` comes from "Inspect" after a deploy; `?entry=` from a click here.
  const requested = entries.find((e) => e.id === params.get("contract"));
  const selectedKey =
    params.get("entry") ?? (requested ? entryKey(requested) : null) ?? (entries[0] ? entryKey(entries[0]) : null);
  const selected = entries.find((e) => entryKey(e) === selectedKey) ?? null;

  const write = (edit: (text: string) => string) => {
    try {
      editor.onChange(edit(editor.textRef.current));
      void editor.saveNow();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const select = (key: string) => {
    params.set("entry", key);
    params.delete("contract");
    setParams(params, { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <>
            <ToolbarButton weight={view === "ui" ? "primary" : "secondary"} onClick={() => setView("ui")} disabled={!parsed.ok}>
              {t("inspector.editor.viewUi")}
            </ToolbarButton>
            <ToolbarButton weight={view === "json" ? "primary" : "secondary"} onClick={() => setView("json")}>
              {t("inspector.editor.viewJson")}
            </ToolbarButton>
          </>
        }
        context={
          !parsed.ok ? (
            <ToolbarDiagnostic tone="error">
              {t("inspector.editor.invalid", { count: parsed.errors.length })}{" "}
              {t("inspector.validation.at", { line: parsed.errors[0]!.line, message: parsed.errors[0]!.message })}
            </ToolbarDiagnostic>
          ) : null
        }
        readout={<EditorFileActions isDirty={editor.isDirty} onSave={editor.saveNow} onDownload={editor.download} />}
      />
      {view === "json" || !parsed.ok ? (
        <JsoncSourceEditor editor={editor} path={file.metadata.path} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <WatchlistPanel
            entries={entries}
            selected={selected ? entryKey(selected) : null}
            onSelect={select}
            onAdd={() => setAdding(true)}
            onRemove={(e: WatchEntry) => write((text) => removeContract(text, e.id, e.network))}
          />
          {selected ? (
            <ContractView
              key={entryKey(selected)}
              entry={selected}
              folderId={file.metadata.folderId}
              onPin={(path) => write((text) => updateContract(text, selected.id, selected.network, { labelMap: path }))}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t("inspector.editor.select")}</p>
          )}
        </div>
      )}
      <AddContractDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={(added) => write((text) => addContracts(text, added))}
      />
    </div>
  );
}
```

`EditorFileActions` takes `isDirty`, `onSave`, `onDownload` and an optional `onFormat` (`src/components/ui/editor/file-actions.tsx:46`).

Until Task 14 exists, create a stub `add-contract-dialog.tsx`:

```tsx
// src/features/inspector/ui/add-contract-dialog.tsx (stub, replaced in Task 14)
import type { WatchEntry } from "../model/watchlist";
export function AddContractDialog(_: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (e: WatchEntry[]) => void }) {
  return null;
}
```

- [ ] **Step 7: Wire into the files page and the new-project dialog**

In `src/pages/files/files-page.tsx`:
- import `InspectorEditor` from `@/features/inspector/ui/inspector-editor`
- add `{type === FileTypes.Watchlist && <InspectorEditor key={id} file={file!} />}` after the Test line
- add `&& type !== FileTypes.Watchlist` to the "unsupported" condition

In `src/features/project/new-project-dialog.tsx`:
- import `useNavigate` from `react-router` and `emptyWatchlist` from `@/features/inspector/model/watchlist`
- `const navigate = useNavigate();` in the component
- after the `if (projectType === "create") { … }` block add:

```ts
    if (projectType === "inspect") {
      const watchlistId = await fs.addFile(
        folderId,
        `${fileName.toLowerCase()}.inspect.json`,
        FileTypes.Watchlist,
        emptyWatchlist(),
      );
      close();
      navigate(`/projects/${folderId}/files/${watchlistId}`);
      return;
    }
```

- [ ] **Step 8: Run tests, typecheck the new code, try it**

```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/inspector|files-page|new-project-dialog" || echo "no type errors in touched files"
```

Expected: tests PASS; `no type errors in touched files`.

Manual: `bun run dev` → New Project → "Inspect Smart Contract(s)" → the watchlist opens. Switch to JSON, add `{ "id": "<a real testnet contract id>", "network": "testnet" }`, switch back. The contract loads, and Overview shows the fields and "No Label Map" → **Create Label Map** creates `<name>.labels.json` in the project.

- [ ] **Step 9: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): watchlist editor with contract overview and Label Map resolution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Data stack tab with slot labelling

**Files:**
- Modify (replace stub): `src/features/inspector/ui/data-stack-tab.tsx`
- Create: `src/features/inspector/ui/slot-detail.tsx`
- Create: `src/features/inspector/ui/slot-label-dialog.tsx`
- Create: `src/features/inspector/ui/format-select.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `buildSlotRows`, `SlotRow` (Task 5); `allInterpretations`, `slotToBigInt` (Task 5); `upsertSlot`, `removeSlot` (Task 3); `SlotLabelSchema`, `SlotLabel` (Task 2); `updateFileText` (Task 9); `IndexedLabelMap` (Task 6); `FORMATS` (Task 2)
- Produces:
  - `<DataStackTab contract labelMap prefix ensureLabelMap />` (the signature is fixed by the Task 11 stub)
  - `<FormatSelect value onChange allowEmpty? />`
  - `<SlotLabelDialog open onOpenChange initial={SlotLabel} enums={string[]} onSave={(slot: SlotLabel) => void} onRemove?={() => void} />`

- [ ] **Step 1: Add strings**

Merge into `inspector.json`:

```json
{
  "data": {
    "length": "{bytes} bytes, {slots} slots",
    "onlyLabelled": "Only labelled",
    "search": "Search name, index or value",
    "index": "#",
    "name": "Name",
    "value": "Value",
    "raw": "Raw (LE hex)",
    "outOfRange": "beyond the data stack",
    "select": "Select a slot to see every interpretation.",
    "setLabel": "Set label",
    "editLabel": "Edit label",
    "interpretations": "Interpretations",
    "stringReversed": "string (reversed)",
    "saved": "Label saved"
  },
  "label": {
    "title": "Label for slot {index}",
    "name": "Name",
    "format": "Format",
    "formatNone": "(show all)",
    "enum": "Enum",
    "length": "Length (slots)",
    "comment": "Comment",
    "save": "Save",
    "remove": "Remove label"
  }
}
```

Run `bun run i18n:types`.

- [ ] **Step 2: Implement `FormatSelect`**

`src/features/inspector/ui/format-select.tsx`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import { FORMATS, type ValueFormat } from "../model/formats";

const NONE = "__none"; // i18n-ignore

export function FormatSelect({
  value,
  onChange,
  allowEmpty = true,
  id,
}: {
  value: ValueFormat | undefined;
  onChange: (value: ValueFormat | undefined) => void;
  allowEmpty?: boolean;
  id?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : (v as ValueFormat))}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NONE}>{t("inspector.label.formatNone")}</SelectItem>}
        {FORMATS.map((f) => (
          <SelectItem key={f} value={f}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Implement `SlotLabelDialog`** (react-hook-form + zod resolver)

`src/features/inspector/ui/slot-label-dialog.tsx`:

```tsx
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n/runtime";
import { SlotLabelSchema, type SlotLabel } from "../model/label-map";
import { FormatSelect } from "./format-select";

export function SlotLabelDialog({
  open,
  onOpenChange,
  initial,
  enums,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SlotLabel;
  enums: string[];
  onSave: (slot: SlotLabel) => void;
  onRemove?: () => void;
}) {
  const form = useForm<SlotLabel>({ resolver: zodResolver(SlotLabelSchema), defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open, initial, form]);
  const format = form.watch("format");

  const submit = form.handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries({ ...values, origin: "manual" }).filter(([, v]) => v !== "" && v !== undefined),
    ) as SlotLabel;
    onSave(clean);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("inspector.label.title", { index: initial.index })}</DialogTitle>
          </DialogHeader>
          <Label htmlFor="slot-name">{t("inspector.label.name")}</Label>
          <Input id="slot-name" autoFocus {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-[var(--mag)]">{form.formState.errors.name.message}</p>
          )}
          <Label htmlFor="slot-format">{t("inspector.label.format")}</Label>
          <Controller
            control={form.control}
            name="format"
            render={({ field }) => <FormatSelect id="slot-format" value={field.value} onChange={field.onChange} />}
          />
          {format === "enum" && (
            <>
              <Label htmlFor="slot-enum">{t("inspector.label.enum")}</Label>
              <Input id="slot-enum" list="slot-enums" {...form.register("enum")} />
              <datalist id="slot-enums">
                {enums.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </>
          )}
          <Label htmlFor="slot-length">{t("inspector.label.length")}</Label>
          <Input
            id="slot-length"
            type="number"
            min={1}
            {...form.register("length", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
          />
          <Label htmlFor="slot-comment">{t("inspector.label.comment")}</Label>
          <Input id="slot-comment" {...form.register("comment")} />
          <DialogFooter className="mt-2">
            {onRemove && (
              <Button type="button" variant="ghost" onClick={() => { onRemove(); onOpenChange(false); }}>
                {t("inspector.label.remove")}
              </Button>
            )}
            <Button type="submit">{t("inspector.label.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

The dialog does not check that an enum name exists: the whole-map refinement does that. A missing enum shows up as a validation error on the Label Map file, and the value renders as `? (n)`. This is intended. Enums are defined in the Label Map editor (Task 15).

- [ ] **Step 4: Implement `SlotDetail` and `DataStackTab`**

`src/features/inspector/ui/slot-detail.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { KVTable } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";
import { allInterpretations, slotToBigInt } from "../model/decode";
import type { SlotRow } from "../model/data-stack";

export function SlotDetail({ row, prefix, onLabel }: { row: SlotRow; prefix: "S" | "TS"; onLabel: () => void }) {
  const interpretations = row.hex ? allInterpretations(slotToBigInt(row.hex), prefix) : [];
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          #{row.index} {row.name ?? ""}
        </span>
        <Button size="sm" variant="outline" onClick={onLabel}>
          {row.label ? t("inspector.data.editLabel") : t("inspector.data.setLabel")}
        </Button>
      </div>
      {row.label?.comment && <p className="text-muted-foreground">{row.label.comment}</p>}
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{t("inspector.data.interpretations")}</h4>
      <KVTable
        rows={interpretations.map((i) => ({
          k: i.kind === "stringReversed" ? t("inspector.data.stringReversed") : i.kind,
          v: i.value,
        }))}
      />
    </div>
  );
}
```

`src/features/inspector/ui/data-stack-tab.tsx` (replaces the stub):

```tsx
import { useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import { buildSlotRows, slotCount, type SlotRow } from "../model/data-stack";
import { removeSlot, upsertSlot } from "../model/label-map-edits";
import type { SlotLabel } from "../model/label-map";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { updateFileText } from "../workspace/update-file";
import { SlotDetail } from "./slot-detail";
import { SlotLabelDialog } from "./slot-label-dialog";

export function DataStackTab({
  contract,
  labelMap,
  prefix,
  ensureLabelMap,
}: {
  contract: Contract;
  labelMap: IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  const fs = useFileSystem();
  const rows = useMemo(
    () => buildSlotRows(contract.machineData, labelMap?.map ?? null, prefix),
    [contract.machineData, labelMap, prefix],
  );
  const [onlyLabelled, setOnlyLabelled] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<SlotLabel | null>(null);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!onlyLabelled || r.label) &&
      (!q || String(r.index) === q || r.name?.toLowerCase().includes(q) || r.value?.toLowerCase().includes(q)),
  );
  const current: SlotRow | undefined = rows.find((r) => r.index === selected);

  const writeLabel = async (edit: (text: string) => string) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, edit);
      toast.success(t("inspector.data.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-2 text-xs">
          <span className="text-muted-foreground">
            {t("inspector.data.length", { bytes: contract.machineData.length / 2, slots: slotCount(contract.machineData) })}
          </span>
          <label className="flex items-center gap-1">
            <Checkbox checked={onlyLabelled} onCheckedChange={(v) => setOnlyLabelled(v === true)} />
            {t("inspector.data.onlyLabelled")}
          </label>
          <Input
            className="h-7 max-w-64"
            placeholder={t("inspector.data.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-1 text-right">{t("inspector.data.index")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.name")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.value")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.raw")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={`${row.index}-${row.outOfRange}`}
                  onClick={() => setSelected(row.index)}
                  className={cn("cursor-pointer hover:bg-accent", selected === row.index && "bg-accent")}
                >
                  <td className="px-4 py-0.5 text-right font-mono text-muted-foreground">{row.index}</td>
                  <td className="px-2 py-0.5">{row.name ?? ""}</td>
                  <td className="px-2 py-0.5 font-mono">
                    {row.outOfRange ? (
                      <span className="text-[var(--amber)]">{t("inspector.data.outOfRange")}</span>
                    ) : (
                      row.value
                    )}
                  </td>
                  <td className="px-2 py-0.5 font-mono text-xs text-muted-foreground">{row.hex ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="w-80 shrink-0 overflow-auto border-l">
        {current ? (
          <SlotDetail
            row={current}
            prefix={prefix}
            onLabel={() => setEditing(current.label ?? { index: current.index, name: "" })}
          />
        ) : (
          <p className="p-3 text-xs text-muted-foreground">{t("inspector.data.select")}</p>
        )}
      </aside>
      {editing && (
        <SlotLabelDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={editing}
          enums={Object.keys(labelMap?.map?.enums ?? {})}
          onSave={(slot) => void writeLabel((text) => upsertSlot(text, slot))}
          onRemove={editing.name ? () => void writeLabel((text) => removeSlot(text, editing.index)) : undefined}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo "clean"
```

Manual:
1. Open a watchlist with a testnet contract, go to Data stack, and click a slot. The right panel lists all 8 interpretations.
2. Click **Set label** and save `flag` / `bool`. A toast appears, the row now reads `flag` with `true`/`false`, and a `.labels.json` was created if none existed.
3. Open that `.labels.json` in another browser tab, add a `// comment`, save, set another label from the inspector, and check that the comment is still there.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): labelled data stack with slot detail and label dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Maps tab

**Files:**
- Modify (replace stub): `src/features/inspector/ui/maps-tab.tsx`
- Create: `src/features/inspector/ui/map-group-dialog.tsx`
- Create: `src/features/inspector/model/map-keys.ts`
- Test: `src/features/inspector/model/map-keys.test.ts`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `InspectorClient.getMapByKey1` (Task 8); `formatValue`, `decimalToBigInt` (Task 5); `MapGroup`, `isFixedGroup`, `FixedMapGroupSchema`, `PatternMapGroupSchema` (Task 2); `upsertMapGroup` (Task 3); `updateFileText` (Task 9); `FormatSelect` (Task 12)
- Produces:
  - `parseKeyInput(input: string, format: ValueFormat | undefined): { ok: true; key: string } | { ok: false }`. An address input (`S-…`/`TS-…`/numeric) resolves to a numeric id. Everything else must be a decimal. The result is always a signed decimal string, which is what the map API expects.
  - `formatKey2(key2: string, group: MapGroup | null, ctx: FormatContext): { name: string | null; key: string; valueFormat?: ValueFormat; enumName?: string }`
  - `<MapsTab contract client labelMap prefix ensureLabelMap />`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/model/map-keys.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { formatKey2, parseKeyInput } from "./map-keys";

const ctx = { prefix: "S" as const, enums: {} };

describe("parseKeyInput", () => {
  it("accepts decimals and converts addresses to signed decimals", () => {
    expect(parseKeyInput("10", undefined)).toEqual({ ok: true, key: "10" });
    expect(parseKeyInput("-5", "long")).toEqual({ ok: true, key: "-5" });
    const rs = Address.fromNumericId("18446744073709551615", "S").getReedSolomonAddress();
    expect(parseKeyInput(rs, "address")).toEqual({ ok: true, key: "-1" });
    expect(parseKeyInput("abc", undefined)).toEqual({ ok: false });
  });
});

describe("formatKey2", () => {
  it("prefers a named key2, then the group's key2 format", () => {
    const group = { key1: "1", name: "g", key2Format: "address" as const,
      key2: [{ key2: "7", name: "special", valueFormat: "bool" as const }] };
    expect(formatKey2("7", group, ctx)).toEqual({ name: "special", key: "7", valueFormat: "bool", enumName: undefined });
    expect(formatKey2("1", group, ctx).key).toBe(Address.fromNumericId("1", "S").getReedSolomonAddress());
    expect(formatKey2("-1", null, ctx)).toEqual({ name: null, key: "-1" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/studio && bun test src/features/inspector/model/map-keys.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `map-keys.ts`**

```ts
import { Address } from "@signumjs/core";
import { decimalToBigInt, formatValue, type FormatContext } from "./decode";
import type { ValueFormat } from "./formats";
import type { MapGroup } from "./label-map";

/**
 * Map keys are signed 64-bit decimals on the wire. A user thinking "the entry
 * for account S-XXXX" should be able to type the address.
 */
export function parseKeyInput(
  input: string,
  format: ValueFormat | undefined,
): { ok: true; key: string } | { ok: false } {
  const value = input.trim();
  if (/^-?\d+$/.test(value)) return { ok: true, key: BigInt.asIntN(64, BigInt(value)).toString() };
  if (format === "address") {
    try {
      const id = Address.create(value).getNumericId();
      return { ok: true, key: BigInt.asIntN(64, BigInt(id)).toString() };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

export function formatKey2(
  key2: string,
  group: MapGroup | null,
  ctx: FormatContext,
): { name: string | null; key: string; valueFormat?: ValueFormat; enumName?: string } {
  const named = group?.key2?.find((k) => BigInt(k.key2) === BigInt(key2));
  if (named) return { name: named.name, key: key2, valueFormat: named.valueFormat, enumName: named.enum };
  if (group?.key2Format) return { name: null, key: formatValue(decimalToBigInt(key2), group.key2Format, ctx) };
  return { name: null, key: key2 };
}
```

Run the test. Expected: PASS.

- [ ] **Step 4: Add strings**

```json
{
  "maps": {
    "groups": "Labelled groups",
    "free": "Query any key1",
    "key1": "key1",
    "key1For": "key1 ({format})",
    "valueFilter": "only value (optional)",
    "load": "Load",
    "loading": "Loading…",
    "more": "Load more",
    "empty": "No entries.",
    "invalidKey": "Not a valid key for this format.",
    "key2": "key2",
    "value": "Value",
    "labelGroup": "Label this key1",
    "saved": "Map label saved",
    "noGroups": "No map groups labelled yet. Query a key1 below and label it."
  },
  "group": {
    "titleFixed": "Map group for key1 {key1}",
    "titlePattern": "Map group pattern",
    "name": "Name",
    "key1Format": "key1 format (pattern group)",
    "key2Format": "key2 format",
    "valueFormat": "Value format",
    "enum": "Value enum",
    "comment": "Comment",
    "save": "Save"
  }
}
```

Run `bun run i18n:types`.

- [ ] **Step 5: Implement `MapGroupDialog`**

`src/features/inspector/ui/map-group-dialog.tsx`:

```tsx
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n/runtime";
import { FixedMapGroupSchema, PatternMapGroupSchema, isFixedGroup, type MapGroup } from "../model/label-map";
import { FormatSelect } from "./format-select";

export function MapGroupDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MapGroup;
  onSave: (group: MapGroup) => void;
}) {
  const fixed = isFixedGroup(initial);
  const form = useForm<MapGroup>({
    resolver: zodResolver(fixed ? FixedMapGroupSchema : PatternMapGroupSchema) as never,
    defaultValues: initial,
  });
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open, initial, form]);

  const submit = form.handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries({ ...values, origin: "manual" }).filter(([, v]) => v !== "" && v !== undefined),
    ) as MapGroup;
    onSave(clean);
    onOpenChange(false);
  });

  const formatField = (name: "key1Format" | "key2Format" | "valueFormat", label: string, allowEmpty = true) => (
    <>
      <Label>{label}</Label>
      <Controller
        control={form.control}
        name={name as never}
        render={({ field }) => (
          <FormatSelect value={field.value as never} onChange={field.onChange} allowEmpty={allowEmpty} />
        )}
      />
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              {fixed ? t("inspector.group.titleFixed", { key1: initial.key1 }) : t("inspector.group.titlePattern")}
            </DialogTitle>
          </DialogHeader>
          <Label htmlFor="group-name">{t("inspector.group.name")}</Label>
          <Input id="group-name" autoFocus {...form.register("name")} />
          {!fixed && formatField("key1Format", t("inspector.group.key1Format"), false)}
          {formatField("key2Format", t("inspector.group.key2Format"))}
          {formatField("valueFormat", t("inspector.group.valueFormat"))}
          <Label htmlFor="group-enum">{t("inspector.group.enum")}</Label>
          <Input id="group-enum" {...form.register("enum")} />
          <Label htmlFor="group-comment">{t("inspector.group.comment")}</Label>
          <Input id="group-comment" {...form.register("comment")} />
          <DialogFooter className="mt-2">
            <Button type="submit">{t("inspector.group.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Implement `MapsTab`**

`src/features/inspector/ui/maps-tab.tsx` (replaces the stub):

```tsx
import { useEffect, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import type { InspectorClient } from "../chain/inspector-client";
import { decimalToBigInt, formatValue } from "../model/decode";
import { isFixedGroup, type MapGroup } from "../model/label-map";
import { upsertMapGroup } from "../model/label-map-edits";
import { formatKey2, parseKeyInput } from "../model/map-keys";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { updateFileText } from "../workspace/update-file";
import { MapGroupDialog } from "./map-group-dialog";

const PAGE = 100;

type Rows = { key2: string; value: string }[];

/** One key1 worth of entries, loaded when opened and paged on demand. */
function KeyValues({
  client,
  contractId,
  key1,
  group,
  ctx,
  valueFilter,
}: {
  client: InspectorClient;
  contractId: string;
  key1: string;
  group: MapGroup | null;
  ctx: { prefix: "S" | "TS"; enums: Record<string, Record<string, string>> };
  valueFilter?: string;
}) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (next: number) => {
    setBusy(true);
    try {
      const got = await client.getMapByKey1(contractId, key1, next, PAGE, valueFilter);
      setRows((r) => [...(next === 0 ? [] : (r ?? [])), ...got]);
      setPage(next);
      setMore(got.length === PAGE);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, key1, valueFilter]);

  if (rows === null) return <p className="px-6 py-1 text-xs text-muted-foreground">{t("inspector.maps.loading")}</p>;
  if (rows.length === 0) return <p className="px-6 py-1 text-xs text-muted-foreground">{t("inspector.maps.empty")}</p>;

  return (
    <div className="px-6 pb-2">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left">{t("inspector.maps.key2")}</th>
            <th className="py-1 text-left">{t("inspector.maps.value")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = formatKey2(r.key2, group, ctx);
            const format = k.valueFormat ?? group?.valueFormat ?? "long";
            const enumName = k.enumName ?? group?.enum;
            return (
              <tr key={r.key2}>
                <td className="py-0.5 font-mono">
                  {k.name ? <span className="font-sans">{k.name} </span> : null}
                  <span className={k.name ? "text-xs text-muted-foreground" : ""}>{k.key}</span>
                </td>
                <td className="py-0.5 font-mono">{formatValue(decimalToBigInt(r.value), format, { ...ctx, enumName })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {more && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load(page + 1)}>
          {t("inspector.maps.more")}
        </Button>
      )}
    </div>
  );
}

export function MapsTab({
  contract,
  client,
  labelMap,
  prefix,
  ensureLabelMap,
}: {
  contract: Contract;
  client: InspectorClient;
  labelMap: IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  const fs = useFileSystem();
  const groups = labelMap?.map?.maps ?? [];
  const ctx = { prefix, enums: labelMap?.map?.enums ?? {} };
  const [open, setOpen] = useState<Record<string, string | null>>({});
  const [patternInput, setPatternInput] = useState<Record<number, string>>({});
  const [free, setFree] = useState({ key1: "", value: "", active: null as null | { key1: string; value?: string } });
  const [editing, setEditing] = useState<MapGroup | null>(null);

  const saveGroup = async (group: MapGroup) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, (text) => upsertMapGroup(text, group));
      toast.success(t("inspector.maps.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("inspector.maps.groups")}</h3>
        {groups.length === 0 && <p className="text-xs text-muted-foreground">{t("inspector.maps.noGroups")}</p>}
        {groups.map((group, i) => {
          const id = String(i);
          const activeKey = open[id] ?? null;
          if (isFixedGroup(group)) {
            return (
              <div key={id} className="border-b">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-1 text-left text-sm"
                  onClick={() => setOpen((o) => ({ ...o, [id]: activeKey ? null : group.key1 }))}
                >
                  {activeKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {group.name} <span className="font-mono text-xs text-muted-foreground">key1 {group.key1}</span>
                </button>
                {activeKey && (
                  <KeyValues client={client} contractId={contract.at} key1={group.key1} group={group} ctx={ctx} />
                )}
              </div>
            );
          }
          const parsed = parseKeyInput(patternInput[i] ?? "", group.key1Format);
          return (
            <div key={id} className="border-b py-1">
              <div className="flex items-center gap-2 text-sm">
                <span>{group.name}</span>
                <Input
                  className="h-7 max-w-72"
                  placeholder={t("inspector.maps.key1For", { format: group.key1Format })}
                  value={patternInput[i] ?? ""}
                  onChange={(e) => setPatternInput((p) => ({ ...p, [i]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!parsed.ok}
                  onClick={() => parsed.ok && setOpen((o) => ({ ...o, [id]: parsed.key }))}
                >
                  {t("inspector.maps.load")}
                </Button>
              </div>
              {activeKey && (
                <KeyValues key={activeKey} client={client} contractId={contract.at} key1={activeKey} group={group} ctx={ctx} />
              )}
            </div>
          );
        })}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("inspector.maps.free")}</h3>
        <div className="flex items-center gap-2">
          <Input
            className="h-7 max-w-56"
            placeholder={t("inspector.maps.key1")}
            value={free.key1}
            onChange={(e) => setFree((f) => ({ ...f, key1: e.target.value }))}
          />
          <Input
            className="h-7 max-w-48"
            placeholder={t("inspector.maps.valueFilter")}
            value={free.value}
            onChange={(e) => setFree((f) => ({ ...f, value: e.target.value }))}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const key = parseKeyInput(free.key1, undefined);
              const value = free.value.trim() ? parseKeyInput(free.value, undefined) : null;
              if (!key.ok || (value && !value.ok)) {
                toast.error(t("inspector.maps.invalidKey"));
                return;
              }
              setFree((f) => ({ ...f, active: { key1: key.key, value: value?.ok ? value.key : undefined } }));
            }}
          >
            {t("inspector.maps.load")}
          </Button>
          {free.active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing({ key1: free.active!.key1, name: "" })}
            >
              <Tag className="h-4 w-4" /> {t("inspector.maps.labelGroup")}
            </Button>
          )}
        </div>
        {free.active && (
          <KeyValues
            key={`${free.active.key1}|${free.active.value ?? ""}`}
            client={client}
            contractId={contract.at}
            key1={free.active.key1}
            group={null}
            ctx={ctx}
            valueFilter={free.active.value}
          />
        )}
      </section>

      {editing && (
        <MapGroupDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
          onSave={(g) => void saveGroup(g)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify**

```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo "clean"
```

Manual, against a testnet contract that uses maps:
1. Query a key1 under "Query any key1". Rows show key2 and value.
2. **Label this key1**: name it and pick value format `bool`. The group appears under "Labelled groups", and expanding it loads the same rows formatted as bool.
3. In the `.labels.json`, change the group to a pattern (`"key1Format": "address"` instead of `key1`). The Maps tab shows an address input. Type an `S-`/`TS-` address and Load.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): labelled maps with fixed and pattern key1 groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Add-contract dialog (id, creator, code hash)

**Files:**
- Modify (replace stub): `src/features/inspector/ui/add-contract-dialog.tsx`
- Create: `src/features/inspector/ui/network-picker.tsx`
- Create: `src/features/inspector/model/contract-input.ts`
- Test: `src/features/inspector/model/contract-input.test.ts`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `createInspectorClient`, `filterSummaries`, `ContractSummary` (Task 8); `createPagedSearch` (Task 8); `Network`, `networkFromWallet` (Task 4); `WatchEntry` (Task 4); `useWalletStatus` (existing)
- Produces:
  - `parseContractId(input: string): string | null` (numeric id, or `S-`/`TS-` RS address → numeric; otherwise null)
  - `<NetworkPicker value={Network} onChange={(n: Network) => void} />`
  - `<AddContractDialog open onOpenChange onAdd={(entries: WatchEntry[]) => void} />` (signature fixed by the Task 11 stub)

- [ ] **Step 1: Write the failing test**

`src/features/inspector/model/contract-input.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { parseContractId } from "./contract-input";

describe("parseContractId", () => {
  it("accepts numeric ids and RS addresses", () => {
    expect(parseContractId(" 10904650711172151453 ")).toBe("10904650711172151453");
    const rs = Address.fromNumericId("12345", "TS").getReedSolomonAddress();
    expect(parseContractId(rs)).toBe("12345");
    expect(parseContractId("hello")).toBeNull();
    expect(parseContractId("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `cd apps/studio && bun test src/features/inspector/model/contract-input.test.ts`. Expected: FAIL.

`src/features/inspector/model/contract-input.ts`:

```ts
import { Address } from "@signumjs/core";

/** A contract as the user types it — numeric id or `S-…`/`TS-…` address — as the numeric id the API wants. */
export function parseContractId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;
  try {
    return Address.create(value).getNumericId();
  } catch {
    return null;
  }
}
```

Run again. Expected: PASS.

- [ ] **Step 3: Add strings**

```json
{
  "add": {
    "title": "Add contracts",
    "network": "Network",
    "customNode": "Node URL",
    "customTestnet": "This node serves testnet",
    "tabs": { "id": "Contract", "creator": "Creator", "hash": "Code hash" },
    "idLabel": "Contract id or address",
    "creatorLabel": "Creator account id or address",
    "myWallet": "My wallet",
    "hashLabel": "Machine code hash",
    "hashFilter": "Code hash filter (optional)",
    "search": "Search",
    "cancel": "Stop",
    "more": "Load more",
    "found": "{shown} of {total} shown",
    "filter": "Filter loaded results",
    "selectAll": "Select all shown",
    "addSelected": "Add {count, plural, one {# contract} other {# contracts}}",
    "addOne": "Add",
    "invalidId": "Not a contract id or address.",
    "notFound": "No contract {id} on this network.",
    "none": "Nothing found."
  }
}
```

Run `bun run i18n:types`.

- [ ] **Step 4: Implement `NetworkPicker`**

`src/features/inspector/ui/network-picker.tsx`:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import type { Network } from "../model/networks";

export function NetworkPicker({ value, onChange }: { value: Network; onChange: (n: Network) => void }) {
  const kind = typeof value === "string" ? value : "custom";
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={kind}
        onValueChange={(k) => onChange(k === "custom" ? { node: "https://" } : (k as "mainnet" | "testnet"))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mainnet">{t("inspector.network.mainnet")}</SelectItem>
          <SelectItem value="testnet">{t("inspector.network.testnet")}</SelectItem>
          <SelectItem value="custom">{t("inspector.network.custom")}</SelectItem>
        </SelectContent>
      </Select>
      {typeof value === "object" && (
        <div className="flex items-center gap-2">
          <Input
            aria-label={t("inspector.add.customNode")}
            value={value.node}
            onChange={(e) => onChange({ ...value, node: e.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs">
            <Checkbox
              checked={!!value.testnet}
              onCheckedChange={(c) => onChange({ ...value, testnet: c === true || undefined })}
            />
            {t("inspector.add.customTestnet")}
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `AddContractDialog`**

`src/features/inspector/ui/add-contract-dialog.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { t } from "@/i18n/runtime";
import { createInspectorClient, filterSummaries, type ContractSummary } from "../chain/inspector-client";
import { createPagedSearch, type PagedSearch } from "../chain/paged-search";
import { parseContractId } from "../model/contract-input";
import { networkFromWallet, type Network } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";
import { NetworkPicker } from "./network-picker";
import { statusLabel } from "./watchlist-panel";

const PAGE = 100;

/**
 * Three ways in: one contract, everything a creator deployed, or every
 * instance of a code hash. The last two can run to thousands — pages load on
 * request, the loaded rows filter locally, and "Stop" drops only the page in
 * flight.
 */
export function AddContractDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entries: WatchEntry[]) => void;
}) {
  const wallet = useWalletStatus();
  const [network, setNetwork] = useState<Network>(wallet ? networkFromWallet(wallet.network) : "testnet");
  const [tab, setTab] = useState<"id" | "creator" | "hash">("id");
  const [input, setInput] = useState("");
  const [hashFilter, setHashFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<ContractSummary[]>([]);
  const [done, setDone] = useState(true);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const search = useRef<PagedSearch<ContractSummary> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const reset = () => {
    abort.current?.abort();
    search.current = null;
    setRows([]);
    setTotal(null);
    setDone(true);
    setPicked(new Set());
    setError("");
    setBusy(false);
  };
  useEffect(() => {
    if (!open) reset();
  }, [open]);
  useEffect(reset, [tab, network]);

  const client = useMemo(() => createInspectorClient(network), [JSON.stringify(network)]);

  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      await work(controller.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };

  const loadNext = () =>
    run(async (signal) => {
      await search.current!.loadNext(signal);
      setRows(search.current!.rows);
      setDone(search.current!.done);
    });

  const startSearch = () => {
    reset();
    const id = parseContractId(input);
    if (tab === "id") {
      if (!id) return setError(t("inspector.add.invalidId"));
      return run(async () => {
        try {
          await client.getContract(id);
        } catch (e) {
          if ((e as { kind?: string }).kind === "not-found") throw new Error(t("inspector.add.notFound", { id }));
          throw e;
        }
        onAdd([{ id, network }]);
        onOpenChange(false);
      });
    }
    if (tab === "creator") {
      if (!id) return setError(t("inspector.add.invalidId"));
      return run(async () => {
        const all = await client.listByCreator(id, { codeHash: hashFilter.trim() || undefined });
        setTotal(all.length);
        search.current = createPagedSearch(async (page) => all.slice(page * PAGE, (page + 1) * PAGE), PAGE, all.length);
        await search.current.loadNext(abort.current!.signal);
        setRows(search.current.rows);
        setDone(search.current.done);
      });
    }
    const hash = input.trim();
    if (!/^\d+$/.test(hash)) return setError(t("inspector.add.invalidId"));
    return run(async (signal) => {
      const count = await client.countByCodeHash(hash);
      setTotal(count);
      search.current = createPagedSearch((page) => client.listByCodeHash(hash, page, PAGE), PAGE, count);
      await search.current.loadNext(signal);
      setRows(search.current.rows);
      setDone(search.current.done);
    });
  };

  const shown = filterSummaries(rows, filter);
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.add.title")}</DialogTitle>
        </DialogHeader>
        <Label>{t("inspector.add.network")}</Label>
        <NetworkPicker value={network} onChange={setNetwork} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="id">{t("inspector.add.tabs.id")}</TabsTrigger>
            <TabsTrigger value="creator">{t("inspector.add.tabs.creator")}</TabsTrigger>
            <TabsTrigger value="hash">{t("inspector.add.tabs.hash")}</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="add-input">
                  {tab === "id"
                    ? t("inspector.add.idLabel")
                    : tab === "creator"
                      ? t("inspector.add.creatorLabel")
                      : t("inspector.add.hashLabel")}
                </Label>
                <Input
                  id="add-input"
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void startSearch()}
                />
              </div>
              {tab === "creator" && wallet && (
                <Button variant="outline" onClick={() => setInput(wallet.accountId)}>
                  {t("inspector.add.myWallet")}
                </Button>
              )}
              {busy ? (
                <Button variant="outline" onClick={() => abort.current?.abort()}>
                  {t("inspector.add.cancel")}
                </Button>
              ) : (
                <Button onClick={() => void startSearch()}>
                  {tab === "id" ? t("inspector.add.addOne") : t("inspector.add.search")}
                </Button>
              )}
            </div>
            {tab === "creator" && (
              <Input
                placeholder={t("inspector.add.hashFilter")}
                value={hashFilter}
                onChange={(e) => setHashFilter(e.target.value)}
              />
            )}
            {error && <p className="text-sm text-[var(--mag)]">{error}</p>}
            {tab !== "id" && total !== null && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("inspector.add.found", { shown: rows.length, total })}
                  </span>
                  <Input
                    className="h-7 max-w-64"
                    placeholder={t("inspector.add.filter")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
                    {t("inspector.add.selectAll")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded border">
                  {shown.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t("inspector.add.none")}</p>}
                  {shown.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 border-b px-2 py-1 text-sm hover:bg-accent">
                      <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      <span className="w-48 shrink-0 truncate font-mono text-xs">{r.id}</span>
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                    </label>
                  ))}
                  {!done && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void loadNext()}>
                      {t("inspector.add.more")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        {tab !== "id" && (
          <DialogFooter>
            <Button
              disabled={picked.size === 0}
              onClick={() => {
                onAdd([...picked].map((id) => ({ id, network })));
                onOpenChange(false);
              }}
            >
              {t("inspector.add.addSelected", { count: picked.size })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Verify**

```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo "clean"
```

Manual:
1. **Contract** tab: paste a `TS-…` contract address and click Add. It appears in the watchlist. A made-up id shows "No contract … on this network".
2. **Creator** tab with "My wallet" (wallet connected on testnet): shows your contracts. Select two and add them.
3. **Code hash** tab with the hash of a widely deployed testnet contract: the first 100 rows appear with "100 of N shown". Load more, then press Stop during a load: the rows loaded so far stay.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): add contracts by id, creator or code hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Label Map editor with generation from source

**Files:**
- Create: `src/features/inspector/ui/label-map-editor.tsx`
- Create: `src/features/inspector/ui/generate-labels-dialog.tsx`
- Create: `src/features/inspector/ui/enum-lines.ts`
- Test: `src/features/inspector/ui/enum-lines.test.ts`
- Modify: `src/pages/files/files-page.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `useFollowedFile` (Task 9); `JsoncSourceEditor` (Task 10); `parseLabelMap`, `isFixedGroup` (Task 2); `removeSlot`, `upsertSlot`, `removeMapGroup`, `upsertMapGroup`, `addCodeHash`, `removeCodeHash`, `setEnum`, `removeEnum` (Task 3); `generateLabels` (Task 7); `mergeGenerated`, `applyMerge`, `MergeConflict` (Task 6); `SlotLabelDialog` (Task 12); `MapGroupDialog` (Task 13)
- Produces:
  - `<LabelMapEditor file={File} />`
  - `parseEnumLines(text: string): Record<string, string> | null` and `enumToLines(values: Record<string, string>): string` in `src/features/inspector/ui/enum-lines.ts`

- [ ] **Step 1: Write the failing test for the enum text format**

`src/features/inspector/ui/enum-lines.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { enumToLines, parseEnumLines } from "./enum-lines";

describe("enum lines", () => {
  it("round-trips 'value = label' lines", () => {
    const values = { "0": "idle", "-1": "broken" };
    expect(parseEnumLines(enumToLines(values))).toEqual(values);
    expect(parseEnumLines("1 = a\n\n 2=b ")).toEqual({ "1": "a", "2": "b" });
    expect(parseEnumLines("x = a")).toBeNull();
  });
});
```

`src/features/inspector/ui/enum-lines.ts` (pure, no React):

```ts
/** Enums are edited as plain lines, `value = label`, one per line. */
export function enumToLines(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

export function parseEnumLines(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(-?\d+)\s*=\s*(.+)$/.exec(line);
    if (!m) return null;
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}
```

Run: `cd apps/studio && bun test src/features/inspector/ui/enum-lines.test.ts`. Expected: FAIL, then PASS after creating `enum-lines.ts`.

- [ ] **Step 2: Add strings**

```json
{
  "labels": {
    "tabs": { "slots": "Slots", "maps": "Maps", "enums": "Enums", "hashes": "Code hashes" },
    "generate": "Generate from source…",
    "add": "Add",
    "edit": "Edit",
    "remove": "Remove",
    "origin": "Origin",
    "index": "Slot",
    "name": "Name",
    "format": "Format",
    "length": "Length",
    "key1": "key1",
    "noEntries": "Nothing here yet.",
    "enumName": "Enum name",
    "enumValues": "One per line: value = label",
    "enumInvalid": "Every line must read \"value = label\" with a decimal value.",
    "hash": "Hash",
    "hashNetwork": "Network (note)",
    "hashNote": "Note",
    "hashInvalid": "A code hash is a decimal number.",
    "saved": "Saved"
  },
  "generate": {
    "title": "Generate labels from SmartC source",
    "source": "Source file",
    "noSources": "No .smart.c file in the workspace.",
    "run": "Compile and preview",
    "apply": "Apply",
    "summary": "{slots} slots and {codeLabels} code labels from {file}. Code hash {hash}.",
    "untyped": "Types unavailable: the compiler's memory table was not found, only names were generated.",
    "conflicts": "Your own labels win on these slots:",
    "conflict": "slot {index}: kept \"{manual}\", compiler says \"{compiler}\"",
    "compileError": "Line {line}: {message}",
    "applied": "Labels regenerated"
  }
}
```

Run `bun run i18n:types`.

- [ ] **Step 3: Implement `GenerateLabelsDialog`**

`src/features/inspector/ui/generate-labels-dialog.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { generateLabels } from "../compiler/label-generator";
import type { LabelMap } from "../model/label-map";
import { mergeGenerated, type MergeConflict } from "../model/merge-labels";

type Preview =
  | { ok: true; merged: LabelMap; conflicts: MergeConflict[]; typed: boolean; hash: string; file: string }
  | { ok: false; message: string };

export function GenerateLabelsDialog({
  open,
  onOpenChange,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: LabelMap;
  onApply: (merged: LabelMap) => void;
}) {
  const fs = useFileSystem();
  const sources = useMemo(
    () => (open ? fs.listFilesRecursive().filter((f) => f.name.endsWith(".smart.c")) : []),
    [fs, open],
  );
  const [fileId, setFileId] = useState<string>(() =>
    sources.find((s) => s.name === current.source?.file)?.id ?? sources[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<Preview | null>(null);

  const run = async () => {
    const meta = sources.find((s) => s.id === fileId);
    if (!meta) return;
    const { content } = await fs.loadFile<string>(fileId);
    const result = generateLabels(content ?? "");
    if (!result.ok) {
      setPreview({ ok: false, message: t("inspector.generate.compileError", { line: result.error.line, message: result.error.message }) });
      return;
    }
    const { map, conflicts } = mergeGenerated(current, result.labels, { sourceFile: meta.name, now: new Date() });
    setPreview({ ok: true, merged: map, conflicts, typed: result.labels.typed, hash: result.labels.codeHash, file: meta.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.generate.title")}</DialogTitle>
        </DialogHeader>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("inspector.generate.noSources")}</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <Label>{t("inspector.generate.source")}</Label>
            <Select value={fileId} onValueChange={(v) => { setFileId(v); setPreview(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="self-start" onClick={() => void run()}>
              {t("inspector.generate.run")}
            </Button>
            {preview && !preview.ok && <p className="text-[var(--mag)]">{preview.message}</p>}
            {preview?.ok && (
              <>
                <p>
                  {t("inspector.generate.summary", {
                    slots: preview.merged.slots.filter((s) => s.origin === "compiler").length,
                    codeLabels: preview.merged.codeLabels.length,
                    file: preview.file,
                    hash: preview.hash,
                  })}
                </p>
                {!preview.typed && <p className="text-[var(--amber)]">{t("inspector.generate.untyped")}</p>}
                {preview.conflicts.length > 0 && (
                  <div>
                    <p>{t("inspector.generate.conflicts")}</p>
                    <ul className="list-disc pl-5">
                      {preview.conflicts.map((c) => (
                        <li key={c.index}>{t("inspector.generate.conflict", { ...c })}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!preview?.ok}
            onClick={() => {
              if (preview?.ok) onApply(preview.merged);
              onOpenChange(false);
            }}
          >
            {t("inspector.generate.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `LabelMapEditor`**

`src/features/inspector/ui/label-map-editor.tsx`:

```tsx
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { EditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { File } from "@/lib/file-system";
import { t } from "@/i18n/runtime";
import { isFixedGroup, parseLabelMap, type MapGroup, type SlotLabel } from "../model/label-map";
import {
  addCodeHash,
  removeCodeHash,
  removeEnum,
  removeMapGroup,
  removeSlot,
  setEnum,
  upsertMapGroup,
  upsertSlot,
} from "../model/label-map-edits";
import { applyMerge } from "../model/merge-labels";
import { useFollowedFile } from "../workspace/use-followed-file";
import { enumToLines, parseEnumLines } from "./enum-lines";
import { GenerateLabelsDialog } from "./generate-labels-dialog";
import { JsoncSourceEditor } from "./jsonc-source-editor";
import { MapGroupDialog } from "./map-group-dialog";
import { SlotLabelDialog } from "./slot-label-dialog";

/**
 * The editor for a `*.labels.json`: tables over the same text the JSON view
 * shows. Every change goes through a comment-preserving edit of that text,
 * then through the ordinary save — there is no second model to fall out of
 * step with the file.
 */
export function LabelMapEditor({ file }: { file: File }) {
  const editor = useFollowedFile(file);
  const parsed = useMemo(() => parseLabelMap(editor.text), [editor.text]);
  const [view, setView] = useState<"ui" | "json">(parsed.ok ? "ui" : "json");
  const [slot, setSlot] = useState<SlotLabel | null>(null);
  const [group, setGroup] = useState<MapGroup | null>(null);
  const [generating, setGenerating] = useState(false);
  const [enumDraft, setEnumDraft] = useState({ name: "", lines: "" });
  const [hashDraft, setHashDraft] = useState({ hash: "", network: "", note: "" });

  const write = (edit: (text: string) => string) => {
    try {
      editor.onChange(edit(editor.textRef.current));
      void editor.saveNow();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const map = parsed.ok ? parsed.value : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <>
            <ToolbarButton weight={view === "ui" ? "primary" : "secondary"} onClick={() => setView("ui")} disabled={!parsed.ok}>
              {t("inspector.editor.viewUi")}
            </ToolbarButton>
            <ToolbarButton weight={view === "json" ? "primary" : "secondary"} onClick={() => setView("json")}>
              {t("inspector.editor.viewJson")}
            </ToolbarButton>
            <ToolbarButton onClick={() => setGenerating(true)} disabled={!parsed.ok}>
              <Wand2 className="h-4 w-4" /> {t("inspector.labels.generate")}
            </ToolbarButton>
          </>
        }
        context={
          !parsed.ok ? (
            <ToolbarDiagnostic tone="error">
              {t("inspector.editor.invalid", { count: parsed.errors.length })}{" "}
              {t("inspector.validation.at", { line: parsed.errors[0]!.line, message: parsed.errors[0]!.message })}
            </ToolbarDiagnostic>
          ) : null
        }
        readout={<EditorFileActions isDirty={editor.isDirty} onSave={editor.saveNow} onDownload={editor.download} />}
      />

      {view === "json" || !map ? (
        <JsoncSourceEditor editor={editor} path={file.metadata.path} />
      ) : (
        <Tabs defaultValue="slots" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-2 self-start">
            <TabsTrigger value="slots">{t("inspector.labels.tabs.slots")}</TabsTrigger>
            <TabsTrigger value="maps">{t("inspector.labels.tabs.maps")}</TabsTrigger>
            <TabsTrigger value="enums">{t("inspector.labels.tabs.enums")}</TabsTrigger>
            <TabsTrigger value="hashes">{t("inspector.labels.tabs.hashes")}</TabsTrigger>
          </TabsList>

          <TabsContent value="slots" className="min-h-0 flex-1 overflow-auto p-4">
            <Button size="sm" variant="outline" onClick={() => setSlot({ index: map.slots.length ? Math.max(...map.slots.map((s) => s.index)) + 1 : 0, name: "" })}>
              {t("inspector.labels.add")}
            </Button>
            <table className="mt-2 w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-right">{t("inspector.labels.index")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.name")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.format")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.length")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.origin")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {map.slots.map((s) => (
                  <tr key={s.index} className="hover:bg-accent">
                    <td className="text-right font-mono">{s.index}</td>
                    <td className="px-2">{s.name}</td>
                    <td className="px-2 font-mono text-xs">{s.format ?? ""}{s.enum ? ` (${s.enum})` : ""}</td>
                    <td className="px-2">{s.length ?? ""}</td>
                    <td className="px-2 text-xs text-muted-foreground">{s.origin ?? "manual"}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSlot(s)}>{t("inspector.labels.edit")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => write((x) => removeSlot(x, s.index))}>{t("inspector.labels.remove")}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {map.slots.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("inspector.labels.noEntries")}</p>}
          </TabsContent>

          <TabsContent value="maps" className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setGroup({ key1: "0", name: "" })}>
                {t("inspector.labels.add")} ({t("inspector.labels.key1")})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setGroup({ key1Format: "address", name: "" })}>
                {t("inspector.labels.add")} ({t("inspector.group.key1Format")})
              </Button>
            </div>
            <ul className="mt-2 text-sm">
              {map.maps.map((g, i) => (
                <li key={i} className="flex items-center gap-2 border-b py-1">
                  <span className="flex-1">
                    {g.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {isFixedGroup(g) ? `key1 ${g.key1}` : `key1: ${g.key1Format}`}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setGroup(g)}>{t("inspector.labels.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeMapGroup(x, i))}>{t("inspector.labels.remove")}</Button>
                </li>
              ))}
            </ul>
            {map.maps.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("inspector.labels.noEntries")}</p>}
          </TabsContent>

          <TabsContent value="enums" className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-2">
              {Object.entries(map.enums).map(([name, values]) => (
                <div key={name} className="flex items-start gap-2 border-b pb-2 text-sm">
                  <span className="w-40 font-mono">{name}</span>
                  <pre className="flex-1 text-xs">{enumToLines(values)}</pre>
                  <Button size="sm" variant="ghost" onClick={() => setEnumDraft({ name, lines: enumToLines(values) })}>{t("inspector.labels.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeEnum(x, name))}>{t("inspector.labels.remove")}</Button>
                </div>
              ))}
              <Input placeholder={t("inspector.labels.enumName")} value={enumDraft.name} onChange={(e) => setEnumDraft((d) => ({ ...d, name: e.target.value }))} />
              <Textarea placeholder={t("inspector.labels.enumValues")} rows={5} value={enumDraft.lines} onChange={(e) => setEnumDraft((d) => ({ ...d, lines: e.target.value }))} />
              <Button
                size="sm"
                className="self-start"
                disabled={!enumDraft.name.trim()}
                onClick={() => {
                  const values = parseEnumLines(enumDraft.lines);
                  if (!values) return toast.error(t("inspector.labels.enumInvalid"));
                  write((x) => setEnum(x, enumDraft.name.trim(), values));
                  setEnumDraft({ name: "", lines: "" });
                }}
              >
                {t("inspector.labels.add")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="hashes" className="min-h-0 flex-1 overflow-auto p-4">
            <ul className="text-sm">
              {map.codeHashes.map((h) => (
                <li key={h.hash} className="flex items-center gap-2 border-b py-1">
                  <span className="font-mono">{h.hash}</span>
                  <span className="text-xs text-muted-foreground">{[h.network, h.note].filter(Boolean).join(" · ")}</span>
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeCodeHash(x, h.hash))}>{t("inspector.labels.remove")}</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input placeholder={t("inspector.labels.hash")} value={hashDraft.hash} onChange={(e) => setHashDraft((d) => ({ ...d, hash: e.target.value }))} />
              <Input placeholder={t("inspector.labels.hashNetwork")} value={hashDraft.network} onChange={(e) => setHashDraft((d) => ({ ...d, network: e.target.value }))} />
              <Input placeholder={t("inspector.labels.hashNote")} value={hashDraft.note} onChange={(e) => setHashDraft((d) => ({ ...d, note: e.target.value }))} />
              <Button
                onClick={() => {
                  if (!/^\d+$/.test(hashDraft.hash.trim())) return toast.error(t("inspector.labels.hashInvalid"));
                  write((x) =>
                    addCodeHash(x, {
                      hash: hashDraft.hash.trim(),
                      ...(hashDraft.network.trim() ? { network: hashDraft.network.trim() } : {}),
                      ...(hashDraft.note.trim() ? { note: hashDraft.note.trim() } : {}),
                    }),
                  );
                  setHashDraft({ hash: "", network: "", note: "" });
                }}
              >
                {t("inspector.labels.add")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {slot && map && (
        <SlotLabelDialog
          open
          onOpenChange={(o) => !o && setSlot(null)}
          initial={slot}
          enums={Object.keys(map.enums)}
          onSave={(s) => write((x) => upsertSlot(x, s))}
        />
      )}
      {group && (
        <MapGroupDialog open onOpenChange={(o) => !o && setGroup(null)} initial={group} onSave={(g) => write((x) => upsertMapGroup(x, g))} />
      )}
      {generating && map && (
        <GenerateLabelsDialog
          open
          onOpenChange={setGenerating}
          current={map}
          onApply={(merged) => {
            write((x) => applyMerge(x, merged));
            toast.success(t("inspector.generate.applied"));
          }}
        />
      )}
    </div>
  );
}
```

Two follow-ups when implementing:
- Editing a fixed group whose `key1` the user changes in the dialog would create a second group, because `upsertMapGroup` matches on `key1`. `MapGroupDialog` does not expose `key1`, so this cannot happen from the UI. Keep it that way.
- Use `Textarea` from `@/components/ui/textarea` (it exists).

- [ ] **Step 5: Wire into the files page**

In `src/pages/files/files-page.tsx`, import `LabelMapEditor` and add `{type === FileTypes.LabelMap && <LabelMapEditor key={id} file={file!} />}`. Also add `&& type !== FileTypes.LabelMap` to the "unsupported" condition.

- [ ] **Step 6: Verify**

```bash
cd apps/studio && bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/inspector|files-page" || echo "clean"
```

Manual:
1. Open a `.labels.json`: the Slots, Maps, Enums and Code-hashes tabs render.
2. Switch to JSON: typing `"format": "` offers the eight formats, hovering `index` shows "Memory slot index…", and `"format": "float"` is underlined. Comments do not produce errors.
3. **Generate from source…**: pick the project's `.smart.c` and preview. The summary shows the slot count and hash. Apply: slots appear with origin `compiler`, and a manual slot on the same index is kept and was listed as a conflict.
4. Open the same `.labels.json` in a second tab (same file, same browser), set a label from the inspector in the first tab, and check that the second tab's view updates without an edit of its own (Review Focus 1).

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): Label Map editor with generation from source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Inspect after deploy, and the rail rule

**Files:**
- Create: `src/features/inspector/workspace/inspect-deployed.ts`
- Test: `src/features/inspector/workspace/inspect-deployed.test.ts`
- Create: `src/features/inspector/ui/inspect-deployed-button.tsx`
- Create: `src/features/workflow/rail-visibility.ts`
- Test: `src/features/workflow/rail-visibility.test.ts`
- Modify: `src/features/asm-editor/deployment-view/deployment-flow.tsx`
- Modify: `src/features/asm-editor/deployment-view/large-contract-deployment.tsx`
- Modify: `src/features/asm-editor/deployment-view/deployment-view.tsx`
- Modify: `src/pages/deploy/deploy-page.tsx`
- Modify: `src/features/workflow/rail.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `generateLabels` (Task 7); `mergeGenerated`, `applyMerge` (Task 6); `emptyLabelMap` (Task 2); `emptyWatchlist`, `addContracts` (Task 4); `updateFileText` (Task 9); `isLabelMapName`, `isWatchlistName` (Task 9); `labelMapFileName` (Task 11); `networkFromWallet` (Task 4)
- Produces:
  - `inspectDeployed(fs: InspectFs, args: { projectFolderId: string; sourceFileId: string; contractId: string; network: Network; now?: Date }): Promise<{ watchlistId: string }>`
  - `interface InspectFs { getFileMetadata(id: string): { name: string; folderId: string } | null; listFolderContents(folderId?: string): { files: { metadata: { id: string; name: string } }[] }; addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>; loadFile<T>(id: string): Promise<{ content: T }>; saveFile<T>(id: string, content: T): Promise<void> }`
  - `showsRail(files: { name: string }[], hasContract: boolean): boolean`
  - `DeploymentFlow` / `LargeContractDeployment` / `DeploymentView` gain `successAction?: (transactionId: string) => ReactNode`

**Fact relied on:** Signum creates an AT with the id of its creation transaction (`AT` is constructed from `transaction.getId()` in the node). The contract id to inspect is therefore the deploy's `transactionId`. Verify once in Step 8: after a testnet deploy, the inspector must find the contract under that id.

- [ ] **Step 1: Write the failing tests**

`src/features/workflow/rail-visibility.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { showsRail } from "./rail-visibility";

describe("showsRail", () => {
  it("hides only for contract-less folders that hold inspection files", () => {
    expect(showsRail([{ name: "a.inspect.json" }], false)).toBe(false);
    expect(showsRail([{ name: "a.labels.json" }], false)).toBe(false);
    expect(showsRail([], false)).toBe(true);
    expect(showsRail([{ name: "a.inspect.json" }], true)).toBe(true);
  });
});
```

`src/features/inspector/workspace/inspect-deployed.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLabelMap } from "../model/label-map";
import { parseWatchlist } from "../model/watchlist";
import { inspectDeployed } from "./inspect-deployed";

const source = readFileSync(join(import.meta.dir, "../../testbed/__fixtures__/counter.smart.c"), "utf8");

function fakeFs() {
  const files: Record<string, { name: string; folderId: string; content: string }> = {
    src: { name: "counter.smart.c", folderId: "P", content: source },
  };
  let next = 0;
  return {
    files,
    getFileMetadata: (id: string) => files[id] ?? null,
    listFolderContents: (folderId?: string) => ({
      files: Object.entries(files)
        .filter(([, f]) => f.folderId === folderId)
        .map(([id, f]) => ({ metadata: { id, name: f.name } })),
    }),
    addFile: async <T,>(folderId: string, name: string, _t: string, content: T) => {
      const id = `n${next++}`;
      files[id] = { name, folderId, content: content as string };
      return id;
    },
    loadFile: async <T,>(id: string) => ({ content: files[id]!.content as T }),
    saveFile: async <T,>(id: string, content: T) => void (files[id]!.content = content as string),
  };
}

describe("inspectDeployed", () => {
  it("creates labels and watchlist next to the source, and reuses them on a second deploy", async () => {
    const fs = fakeFs();
    const args = { projectFolderId: "P", sourceFileId: "src", network: "testnet" as const };
    const first = await inspectDeployed(fs, { ...args, contractId: "111" });
    const second = await inspectDeployed(fs, { ...args, contractId: "222" });
    expect(second.watchlistId).toBe(first.watchlistId);

    const names = Object.values(fs.files).map((f) => f.name).sort();
    expect(names).toEqual(["counter.labels.json", "counter.smart.c", "deployments.inspect.json"]);

    const labels = parseLabelMap(Object.values(fs.files).find((f) => f.name === "counter.labels.json")!.content);
    expect(labels.ok && labels.value.slots.length).toBeGreaterThan(0);
    expect(labels.ok && labels.value.codeHashes[0]!.network).toBe("testnet");

    const list = parseWatchlist(fs.files[first.watchlistId]!.content);
    expect(list.ok && list.value.contracts.map((c) => c.id)).toEqual(["111", "222"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/studio && bun test src/features/workflow/rail-visibility.test.ts src/features/inspector/workspace/inspect-deployed.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/workflow/rail-visibility.ts`:

```ts
/**
 * The rail describes a contract's way from source to chain. A folder that
 * only inspects contracts has no such way, and four empty cells would say
 * something false about it. An empty new project keeps the rail: there, "no
 * contract yet" is the guidance.
 */
const INSPECTION = /\.(inspect|labels)\.json$/i;

export function showsRail(files: { name: string }[], hasContract: boolean): boolean {
  return hasContract || !files.some((f) => INSPECTION.test(f.name));
}
```

`src/features/inspector/workspace/inspect-deployed.ts`:

```ts
import { FileTypes } from "@/features/project/filetype-icons";
import { generateLabels } from "../compiler/label-generator";
import { emptyLabelMap, parseLabelMap } from "../model/label-map";
import { applyMerge, mergeGenerated } from "../model/merge-labels";
import { networkKey, type Network } from "../model/networks";
import { addContracts, emptyWatchlist } from "../model/watchlist";
import { updateFileText } from "./update-file";

/**
 * "Inspect" after a deploy: the Label Map is generated beside the source it
 * came from, and the new contract joins the project's `deployments.inspect.json`.
 * Both files are complementary to the project, not a separate one — the next
 * deploy extends the same two.
 */

export interface InspectFs {
  getFileMetadata(id: string): { name: string; folderId: string } | null;
  listFolderContents(folderId?: string): { files: { metadata: { id: string; name: string } }[] };
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
  loadFile<T>(id: string): Promise<{ content: T }>;
  saveFile<T>(id: string, content: T): Promise<void>;
}

const WATCHLIST = "deployments.inspect.json"; // i18n-ignore

async function findOrCreate(
  fs: InspectFs,
  folderId: string,
  name: string,
  type: string,
  initial: () => string,
): Promise<string> {
  const existing = fs.listFolderContents(folderId).files.find((f) => f.metadata.name === name);
  return existing ? existing.metadata.id : fs.addFile(folderId, name, type, initial());
}

export async function inspectDeployed(
  fs: InspectFs,
  args: { projectFolderId: string; sourceFileId: string; contractId: string; network: Network; now?: Date },
): Promise<{ watchlistId: string }> {
  const meta = fs.getFileMetadata(args.sourceFileId);
  if (!meta) throw new Error(`Source not found: ${args.sourceFileId}`);
  const base = meta.name.replace(/\.smart\.c$/i, "");
  const network = networkKey(args.network);

  const { content } = await fs.loadFile<string>(args.sourceFileId);
  const generated = generateLabels(content ?? "");
  if (generated.ok) {
    const labelsId = await findOrCreate(fs, meta.folderId, `${base}.labels.json`, FileTypes.LabelMap, () =>
      emptyLabelMap(base),
    );
    await updateFileText(fs, labelsId, (text) => {
      const current = parseLabelMap(text);
      if (!current.ok) return text; // never rewrite a file the user broke by hand
      const { map } = mergeGenerated(current.value, generated.labels, {
        sourceFile: meta.name,
        now: args.now ?? new Date(),
        network,
      });
      return applyMerge(text, map);
    });
  }

  const watchlistId = await findOrCreate(fs, args.projectFolderId, WATCHLIST, FileTypes.Watchlist, emptyWatchlist);
  await updateFileText(fs, watchlistId, (text) => addContracts(text, [{ id: args.contractId, network: args.network }]));
  return { watchlistId };
}
```

Run the tests. Expected: PASS.

- [ ] **Step 4: Add strings**

```json
{
  "deploy": {
    "inspect": "Inspect",
    "inspectHint": "Open this contract in the inspector, with labels generated from this source",
    "failed": "Could not prepare the inspection: {message}"
  }
}
```

Run `bun run i18n:types`.

- [ ] **Step 5: Thread `successAction` through the deploy components**

In `deployment-flow.tsx`:
- add `successAction?: (transactionId: string) => ReactNode;` to `DeploymentFlowProps`, destructure it, and pass it on to `<LargeContractDeployment … successAction={successAction} />` and to `DeploymentSteps`
- in `DeploymentSteps` (add the prop to its props type), inside the `currentStep === "success"` alert, after the `div` holding the transaction id, render:

```tsx
            {transaction && successAction && <div className="mt-3">{successAction(transaction.transactionId)}</div>}
```

- in `large-contract-deployment.tsx`, accept the same optional prop and render it in its success state beside its transaction id, the same way. Find that spot by searching for `announceDeployment` in the file; the success rendering follows it.
- in `deployment-view.tsx`, accept `successAction` and pass it to `DeploymentFlow`.

`src/features/inspector/ui/inspect-deployed-button.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { t } from "@/i18n/runtime";
import { networkFromWallet } from "../model/networks";
import { inspectDeployed } from "../workspace/inspect-deployed";

export function InspectDeployedButton({
  projectFolderId,
  sourceFileId,
  contractId,
}: {
  projectFolderId: string;
  sourceFileId: string;
  contractId: string;
}) {
  const fs = useFileSystem();
  const wallet = useWalletStatus();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || !wallet}
      title={t("inspector.deploy.inspectHint")}
      onClick={async () => {
        if (!wallet) return;
        setBusy(true);
        try {
          const { watchlistId } = await inspectDeployed(fs, {
            projectFolderId,
            sourceFileId,
            contractId,
            network: networkFromWallet(wallet.network),
          });
          navigate(`/projects/${projectFolderId}/files/${watchlistId}?contract=${contractId}`);
        } catch (e) {
          toast.error(t("inspector.deploy.failed", { message: (e as Error).message }));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ScanSearch className="h-4 w-4" /> {t("inspector.deploy.inspect")}
    </Button>
  );
}
```

In `src/pages/deploy/deploy-page.tsx`, change `<DeploymentView data={machineData} />` to:

```tsx
        {machineData && (
          <DeploymentView
            data={machineData}
            successAction={(transactionId) => (
              <InspectDeployedButton
                projectFolderId={projectId}
                sourceFileId={contract.id}
                contractId={transactionId}
              />
            )}
          />
        )}
```

Here `projectId` is the resolved project id from `useProjectFacts` in that page. Use whichever variable holds it: the page already destructures `contract: choice` from `useProjectFacts(routeFolderId)`, so also take `projectId` from there.

- [ ] **Step 6: Apply the rail rule**

In `src/features/workflow/rail.tsx`, where `useProjectFacts` provides `files` and `contract`, return early before building `cells`:

```ts
  if (!showsRail(files, !!contract)) return null;
```

Import `showsRail` from `./rail-visibility`. Place the early return **after** all hooks in the component (`useCompileVerdict`, `useDeploymentCount` …), so the hook order stays stable. If `files` is named differently there, use the `ProjectFacts.files` value.

- [ ] **Step 7: Run the full studio test suite**

```bash
cd apps/studio && bun run i18n:types && bun test
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/inspector|deployment|deploy-page|rail" || echo "clean"
```

Expected: all tests PASS; `clean`.

- [ ] **Step 8: End-to-end check on testnet**

1. Connect the XT wallet on testnet, open a development project, and deploy.
2. On success, click **Inspect**. The Studio creates `<name>.labels.json` next to the source and `deployments.inspect.json` in the project root, then opens the watchlist with the new contract selected.
3. Right after the deploy the contract shows "not found … appears once its transaction is in a block". After the next block, **Retry** loads it. The data stack shows the compiler's variable names. This confirms the contract id = transaction id fact.
4. Open an inspector-only project: the rail is hidden. Open a development project: the rail is shown.

- [ ] **Step 9: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): inspect a contract right after deploying it; hide the rail in inspection-only folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Translations and final verification

**Files:**
- Create: `src/i18n/locales/{de,es,fr,it,pt-BR,ru,uk,zh-CN}/inspector.json`
- Modify: `src/i18n/locales/{de,es,fr,it,pt-BR,ru,uk,zh-CN}/index.ts`
- Modify: `src/i18n/locales/*/project.json` (the two `newFile` keys from Task 10)
- Modify: `src/i18n/GLOSSARY.md`

- [ ] **Step 1: Extend the glossary first**

In `src/i18n/GLOSSARY.md`:
- add to **Never translated**: `.labels.json`, `.inspect.json`, `key1`, `key2`, format names (`long`, `unsigned`, `fixed`, `hex`, `address`, `string`, `bool`, `enum`), Label Map field names (`codeHashes`, `slots`, `maps`, `enums`, `codeLabels`)
- add to **Terms**:

| English | de | pt-BR | fr | es | it | uk | ru | zh-CN |
|---|---|---|---|---|---|---|---|---|
| Label Map | Label Map | Label Map | Label Map | Label Map | Label Map | Label Map | Label Map | Label Map |
| inspect | inspizieren | inspecionar | inspecter | inspeccionar | ispezionare | інспектувати | инспектировать | 检查 |
| watchlist | Watchlist | lista de observação | liste de suivi | lista de seguimiento | watchlist | список спостереження | список наблюдения | 观察列表 |
| data stack | Data Stack | pilha de dados | pile de données | pila de datos | stack dei dati | стек даних | стек данных | 数据栈 |
| slot | Slot | slot | emplacement | ranura | slot | слот | слот | 槽位 |
| code hash | Code-Hash | hash do código | hash du code | hash del código | hash del codice | хеш коду | хеш кода | 代码哈希 |

- [ ] **Step 2: Translate**

For each of the eight locales, create `inspector.json` with every key of `en/inspector.json`. Follow the glossary and the per-language style table: address form, button mood, French narrow no-break spaces, zh-CN punctuation. Keep every `{placeholder}`, plural `{count, plural, …}` block and `` `code` `` span identical. Add the two `newFile` keys to each `project.json`.

Register the namespace in each locale's `index.ts`: `import inspector from "./inspector.json";` and `inspector,` in the `messages` object.

- [ ] **Step 3: Run the i18n checks and the whole suite**

```bash
cd apps/studio && bun run i18n:scan && bun run i18n:report && bun test
```

Expected:
- `i18n:scan` reports no untranslated literals in `features/inspector`. Fix any it finds with `t()`, or with `// i18n-ignore` for code terms.
- `i18n:report` shows 0 missing `inspector.*` keys for every locale.
- all tests PASS, including `src/i18n/locales.test.ts` (placeholders, tags and plurals intact).

- [ ] **Step 4: Typecheck and build**

```bash
cd apps/studio && bunx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
cd apps/studio && bun run build
```

Expected: no new type errors compared with `git stash`-free `development` (compare the error count if the baseline is not zero); the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/i18n
git commit -m "i18n(inspector): translations for all locales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section | Task(s) |
|---|---|
| §3.1 Label Map, origins | 2, 3, 6 |
| §3.2 Watchlist | 4, 11 |
| §3.3 No special project kind, workspace-wide resolution | 9, 11, 16 |
| §4.0 JSONC, Zod 4, jsonc-parser, positioned errors, Monaco schema, scenarios on json5 | 1, 10 |
| §4.1 Watchlist format (plus deviation 3) | 4 |
| §4.2 Label Map format, formats, map groups by key1 | 2, 5, 13 |
| §5.1 Resolution | 6, 11 |
| §5.2 Generation merge | 6, 15, 16 |
| §5.3 Compiler adapter with fallback | 7 |
| §6.2 Inspector client | 8 |
| §6.3 InspectorEditor, ContractView tabs | 11, 12, 13 |
| §6.3 AddContractDialog (plus deviation 1) | 14 |
| §6.3 LabelMapEditor, Generate from source | 15 |
| §6.4 File types, files page, new project, Monaco, deploy Inspect, rail (plus deviation 4) | 10, 11, 15, 16 |
| §7 Data flow (label change → re-render) | 9, 11, 12 |
| §8 Error handling | 1, 2, 5, 8, 11, 14, 15 |
| §9 Testing | every task; i18n in 17 |
| §10 Roadmap | out of scope; M2/M3 get their own plans |
