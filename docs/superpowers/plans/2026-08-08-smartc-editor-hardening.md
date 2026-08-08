# SmartC Monaco Editor — Härtung: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der SmartC-Monaco-Editor bekommt SmartC-korrektes Syntax-Highlighting, Completion/Hover/Signaturen für benutzerdefinierte Symbole (Variablen, `#define`s, Funktionen, Labels, struct-Member) und verbesserte Diagnostics — bei behobenem Zweitdatei-Bug.

**Architecture:** Eigene Monaco-Language-ID `"smartc"` mit eigenem Monarch-Tokenizer. Ein reiner, DOM-freier Symbolscanner (`scanSymbols`) liefert Live-Symbole aus dem Buffer (Rückgrat), angereichert durch den Compiler (`getMachineCode().Memory`) bei sauberem Compile. Ein per-Model-Cache versorgt einmalig global registrierte Provider mit Dokument-Kontext. Ein debounced Compile pro Änderung bedient Diagnostics und Compiler-Symbole gemeinsam.

**Tech Stack:** TypeScript, React 19, `@monaco-editor/react`, `monaco-editor`, `smartc-signum-compiler` v2.3.0, Bun (`bun test`, `bun run build`).

**Spec:** `docs/superpowers/specs/2026-08-08-smartc-editor-hardening-design.md`

---

## Datei-Struktur

Neues Verzeichnis `apps/studio/src/features/smartc-editor/language/`. Wiederverwendet werden die bestehenden statischen Tabellen unter `language-definitions/` (`keywords.ts` → `SmartCKeywords`, `SmartCDisabledKeywords`; `functions.ts` → `SmartCFunctions`).

```
apps/studio/src/features/smartc-editor/
  language-definitions/
    keywords.ts            (bestehend, wiederverwendet)
    functions.ts           (bestehend, wiederverwendet)
    smartc-language-definitions.ts  (bestehend — wird in Slice 5 gelöscht)
  language/                          (NEU)
    symbols.ts             Typen SmartCSymbols + emptySymbols + mergeSymbols
    symbol-scanner.ts      scanSymbols(source) → SmartCSymbols  (PURE)
    symbol-scanner.test.ts
    compiler-symbols.ts    parseCompileError + analyzeWithCompiler  (PURE)
    compiler-symbols.test.ts
    monarch.ts             smartcMonarch: IMonarchLanguage
    language-config.ts     smartcLanguageConfig: LanguageConfiguration
    symbol-cache.ts        per-Model-Cache + updateModel(monaco, model)
    completion-provider.ts createCompletionProvider(monaco)
    hover-provider.ts      createHoverProvider(monaco)
    signature-help-provider.ts createSignatureHelpProvider(monaco)
    register.ts            registerSmartC(monaco) — Orchestrator + Model-Lifecycle
  smartc-editor.tsx        (bestehend — auf "smartc" umgestellt)
```

**Testbarkeit:** `symbols.ts`, `symbol-scanner.ts`, `compiler-symbols.ts` sind rein (kein Monaco/DOM) → `bun test`. Die Monaco-verdrahteten Teile (Monarch, Provider, register, symbol-cache) werden per `bun run build` + manuellem Smoke-Test verifiziert (kein jsdom im Repo).

**Testlauf-Konvention:** immer aus dem Repo-Root:
`bun test <pfad>` bzw. `bun run build` (im `apps/studio`-Verzeichnis oder via `cd apps/studio && bun run build`).

---

## Slice 1 — Dedizierte `smartc`-Sprache, Tokenizer, portierte Provider, Lifecycle-Fix

Ziel: Ohne Feature-Regression auf eine eigene Sprache umstellen. Highlighting wird SmartC-korrekt; die bestehenden Built-in-Completion/Hover/Signaturen + die Compile-Validierung werden 1:1 auf `"smartc"` portiert; der Zweitdatei-Bug verschwindet durch korrektes Model-Lifecycle. **Keine Unit-Tests** (Monaco-verdrahtet) — Verifikation via Build + Smoke.

### Task 1.1: Monarch-Tokenizer

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/monarch.ts`

- [ ] **Step 1: Implementieren**

```ts
import type * as Monaco from "monaco-editor";
import { SmartCFunctions } from "../language-definitions/functions";
import { SmartCDisabledKeywords } from "../language-definitions/keywords";

const builtinFunctions = Object.keys(SmartCFunctions);

export const smartcMonarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".smartc",
  keywords: [
    "if", "else", "while", "do", "for", "switch", "case", "default",
    "break", "continue", "goto", "return", "sizeof", "const", "struct",
    "asm", "sleep", "exit", "halt",
  ],
  typeKeywords: ["long", "fixed", "void"],
  // referenced via @invalidKeywords in the tokenizer cases
  invalidKeywords: SmartCDisabledKeywords,
  builtinFunctions,
  operators: [
    "=", "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "<", ">",
    "<=", ">=", "==", "!=", "&&", "||", "<<", ">>", "++", "--",
    "+=", "-=", "*=", "/=", "->", ".",
  ],
  symbols: /[=><!~?:&|+\-*/^%]+/,
  tokenizer: {
    root: [
      [/#\s*(program|pragma|include|define)\b/, "keyword.directive"],
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            "@invalidKeywords": "invalid",
            "@typeKeywords": "type",
            "@keywords": "keyword",
            "@builtinFunctions": "predefined",
            "@default": "identifier",
          },
        },
      ],
      { include: "@whitespace" },
      [/\d[\d_]*\.\d[\d_]*/, "number.float"],
      [/0[xX][0-9a-fA-F_]+/, "number.hex"],
      [/\d[\d_]*/, "number"],
      [/[{}()[\]]/, "@brackets"],
      [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
      [/"/, { token: "string.quote", next: "@string" }],
      [/'/, { token: "string.quote", next: "@char" }],
      [/;/, "delimiter"],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
    string: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, { token: "string.quote", next: "@pop" }],
    ],
    char: [
      [/[^'\\]+/, "string"],
      [/\\./, "string.escape"],
      [/'/, { token: "string.quote", next: "@pop" }],
    ],
  },
};
```

- [ ] **Step 2: Build zur Syntaxprüfung**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed` (Datei wird noch nicht importiert; Build prüft nur Kompilierbarkeit nach Task 1.7).

### Task 1.2: Language-Konfiguration

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/language-config.ts`

- [ ] **Step 1: Implementieren**

```ts
import type * as Monaco from "monaco-editor";

export const smartcLanguageConfig: Monaco.languages.LanguageConfiguration = {
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};
```

### Task 1.3: Completion-Provider (nur Built-ins, portiert)

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/completion-provider.ts`

- [ ] **Step 1: Implementieren**

```ts
import type * as Monaco from "monaco-editor";
import { SmartCKeywords, SmartCDisabledKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";

export function createCompletionProvider(
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemProvider {
  const disabled = new Set(SmartCDisabledKeywords);
  return {
    triggerCharacters: [".", ">"], // '>' fires for '->'
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const items: Monaco.languages.CompletionItem[] = [];

      for (const [kw, info] of Object.entries(SmartCKeywords)) {
        if (disabled.has(kw)) continue;
        items.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          detail: info.detail,
          documentation: info.documentation,
          range,
        });
      }

      for (const [fn, info] of Object.entries(SmartCFunctions)) {
        const args = info.params
          .map((p, i) => `\${${i + 1}:${p.name}}`)
          .join(", ");
        items.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}(${args})`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: info.detail,
          documentation: { value: info.documentation, isTrusted: true },
          range,
        });
      }

      return { suggestions: items };
    },
  };
}
```

### Task 1.4: Hover-Provider (nur Built-ins, portiert)

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/hover-provider.ts`

- [ ] **Step 1: Implementieren**

```ts
import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";

export function createHoverProvider(
  _monaco: typeof Monaco,
): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const fn = SmartCFunctions[word.word];
      if (fn) {
        return {
          contents: [
            { value: `\`${fn.signature}\` - **SmartC Function**` },
            { value: fn.documentation },
          ],
        };
      }
      const kw = SmartCKeywords[word.word];
      if (kw) {
        return {
          contents: [
            { value: `\`${word.word}\` - **SmartC Keyword**` },
            { value: kw.documentation },
          ],
        };
      }
      return null;
    },
  };
}
```

### Task 1.5: Signature-Help-Provider (nur Built-ins, portiert)

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/signature-help-provider.ts`

- [ ] **Step 1: Implementieren**

```ts
import type * as Monaco from "monaco-editor";
import { SmartCFunctions } from "../language-definitions/functions";

/** Finds the innermost function call name and active parameter index at `textUntilPosition`. */
export function findActiveCall(
  textUntilPosition: string,
): { name: string; activeParameter: number } | null {
  let depth = 0;
  let open = -1;
  for (let i = textUntilPosition.length - 1; i >= 0; i--) {
    const ch = textUntilPosition[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      depth--;
      if (depth < 0) {
        open = i;
        break;
      }
    }
  }
  if (open === -1) return null;

  let name = "";
  for (let i = open - 1; i >= 0; i--) {
    const ch = textUntilPosition[i];
    if (/[a-zA-Z0-9_]/.test(ch)) name = ch + name;
    else break;
  }
  if (!name) return null;

  const rel = textUntilPosition.substring(open + 1);
  let commas = 0;
  let nested = 0;
  let inStr = false;
  let strCh = "";
  for (let i = 0; i < rel.length; i++) {
    const ch = rel[i];
    if (inStr) {
      if (ch === strCh && rel[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strCh = ch;
    } else if (ch === "(") nested++;
    else if (ch === ")") nested--;
    else if (ch === "," && nested === 0) commas++;
  }
  return { name, activeParameter: commas };
}

export function createSignatureHelpProvider(
  _monaco: typeof Monaco,
): Monaco.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ["(", ","],
    provideSignatureHelp(model, position) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const call = findActiveCall(textUntilPosition);
      if (!call) return null;

      const info = SmartCFunctions[call.name];
      if (!info) return null;

      const signature: Monaco.languages.SignatureInformation = {
        label: info.signature,
        documentation: { value: info.documentation, isTrusted: true },
        parameters: info.params.map((p) => ({
          label: p.name,
          documentation: { value: p.documentation, isTrusted: true },
        })),
      };
      return {
        value: {
          signatures: [signature],
          activeSignature: 0,
          activeParameter: Math.min(call.activeParameter, info.params.length - 1),
        },
        dispose: () => {},
      };
    },
  };
}
```

### Task 1.6: Symbol-Cache mit Compile-Diagnostics (noch ohne Scanner)

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/symbol-cache.ts`

- [ ] **Step 1: Implementieren** (portiert die bestehende Compile-als-Linter-Logik; robusteres Diagnostics + Scanner folgen in Slice 2/3)

```ts
import type * as Monaco from "monaco-editor";
import { SmartC } from "smartc-signum-compiler";

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function updateModel(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): void {
  const source = model.getValue();
  const markers: Monaco.editor.IMarkerData[] = [];
  try {
    new SmartC({ language: "C", sourceCode: source }).compile();
  } catch (e: any) {
    const result = SmartCErrorPattern.exec(e.message ?? "");
    if (result?.groups) {
      const { line, column, message } = result.groups;
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: parseInt(line),
        startColumn: parseInt(column),
        endLineNumber: parseInt(line),
        endColumn: parseInt(column) + 1,
      });
    }
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
}

export function clearModel(model: Monaco.editor.ITextModel): void {
  model; // no cache yet; extended in Slice 2
}
```

### Task 1.7: Orchestrator `registerSmartC` mit korrektem Model-Lifecycle

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/register.ts`

- [ ] **Step 1: Implementieren**

```ts
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
    model.onWillDispose(() => clearModel(model));
    run();
  };

  monaco.editor.getModels().forEach(wire);
  monaco.editor.onDidCreateModel(wire);
}
```

### Task 1.8: Editor auf `"smartc"` umstellen

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx`

- [ ] **Step 1: Import ersetzen**

Ersetze die Zeile
```ts
import { extendCLangWithSmartC } from "./language-definitions/smartc-language-definitions.ts";
```
durch
```ts
import { registerSmartC, SMARTC_LANGUAGE_ID } from "./language/register.ts";
```

- [ ] **Step 2: Registrierung in `beforeMount`, Aufruf aus `onMount` entfernen**

Im `handleEditorDidMount` die Zeile `extendCLangWithSmartC(monaco);` **entfernen** (die restlichen `editor.addAction(...)`-Aufrufe bleiben).

Am `<Editor>`-Element:
- `defaultLanguage="c"` → `defaultLanguage={SMARTC_LANGUAGE_ID}`
- `beforeMount={(monaco) => {}}` → `beforeMount={(monaco) => registerSmartC(monaco)}`

- [ ] **Step 3: Build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [ ] **Step 4: Manueller Smoke-Test**

`cd apps/studio && bun run dev`, dann im Browser: (a) `.smart.c`-Datei öffnen → `long`/`fixed`/`void` als Typ, `#program`/`#pragma` als Direktive, Built-in-Funktionen hervorgehoben; `4_0000_0000` als Zahl. (b) Built-in-Completion (`getNextTx` etc.) + Hover funktionieren. (c) Zwei `.smart.c`-Dateien nacheinander öffnen → **beide** zeigen Fehler-Marker bei fehlerhaftem Code.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/smartc-editor/language apps/studio/src/features/smartc-editor/smartc-editor.tsx
git commit -m "feat(editor): dedicated smartc Monaco language + tokenizer, ported providers, fixed model lifecycle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 2 — Symbolscanner + Live-Completion/Hover (Kernlücke)

Ziel: benutzerdefinierte Symbole (Variablen, `#define`s, Funktionen, Labels, struct + Member, Konstanten) werden live vervollständigt und gehovert. **TDD** für den Scanner.

### Task 2.1: Symbol-Typen

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/symbols.ts`

- [ ] **Step 1: Implementieren**

```ts
export type SmartCDecl = "long" | "fixed" | "void" | "struct";

export interface SmartCVariable {
  name: string;
  declaration: SmartCDecl;
  typeName?: string; // struct type name
  isPointer?: boolean;
  isArray?: boolean;
  line: number;
}
export interface SmartCMacro {
  name: string;
  params?: string[];
  value?: string;
  line: number;
}
export interface SmartCFunctionSymbol {
  name: string;
  returnType: string;
  params: { type: string; name: string }[];
  line: number;
}
export interface SmartCStruct {
  name: string;
  members: { name: string; declaration: string }[];
  line: number;
}
export interface SmartCLabel {
  name: string;
  line: number;
}
export interface SmartCConstant {
  name: string;
  value?: string;
  line: number;
}

export interface SmartCSymbols {
  variables: SmartCVariable[];
  macros: SmartCMacro[];
  functions: SmartCFunctionSymbol[];
  structs: SmartCStruct[];
  labels: SmartCLabel[];
  constants: SmartCConstant[];
}

export function emptySymbols(): SmartCSymbols {
  return { variables: [], macros: [], functions: [], structs: [], labels: [], constants: [] };
}
```

### Task 2.2: Symbolscanner — Test zuerst

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts`

- [ ] **Step 1: Failing test schreiben**

```ts
import { describe, it, expect } from "bun:test";
import { scanSymbols, stripCommentsAndStrings } from "./symbol-scanner";

describe("stripCommentsAndStrings", () => {
  it("removes line comments but keeps line count", () => {
    const out = stripCommentsAndStrings("long a; // long b;\nlong c;");
    expect(out.split("\n").length).toBe(2);
    expect(out).not.toContain("long b");
    expect(out).toContain("long a;");
    expect(out).toContain("long c;");
  });

  it("removes string contents", () => {
    const out = stripCommentsAndStrings('long a = "long z;";');
    expect(out).not.toContain("long z");
    expect(out).toContain("long a =");
  });
});

describe("scanSymbols", () => {
  it("extracts multi-declaration variables", () => {
    const s = scanSymbols("long a, b, c;");
    expect(s.variables.map((v) => v.name)).toEqual(["a", "b", "c"]);
    expect(s.variables[0].declaration).toBe("long");
  });

  it("extracts fixed variable with initializer", () => {
    const s = scanSymbols("fixed price = 1.5;");
    expect(s.variables.map((v) => v.name)).toEqual(["price"]);
    expect(s.variables[0].declaration).toBe("fixed");
  });

  it("flags pointers and arrays", () => {
    const s = scanSymbols("long * ptr;\nlong arr[4];");
    const byName = Object.fromEntries(s.variables.map((v) => [v.name, v]));
    expect(byName["ptr"].isPointer).toBe(true);
    expect(byName["arr"].isArray).toBe(true);
  });

  it("extracts const as constant", () => {
    const s = scanSymbols("const long MAX = 10;");
    expect(s.constants.map((c) => c.name)).toEqual(["MAX"]);
    expect(s.variables).toHaveLength(0);
  });

  it("extracts object-like and function-like macros", () => {
    const s = scanSymbols("#define TOKEN 123\n#define ADD(a, b) ((a)+(b))");
    const byName = Object.fromEntries(s.macros.map((m) => [m.name, m]));
    expect(byName["TOKEN"].value).toBe("123");
    expect(byName["TOKEN"].params).toBeUndefined();
    expect(byName["ADD"].params).toEqual(["a", "b"]);
  });

  it("extracts function definitions with params", () => {
    const s = scanSymbols("long doThing(long x, fixed y) {\n  return x;\n}");
    expect(s.functions).toHaveLength(1);
    expect(s.functions[0].name).toBe("doThing");
    expect(s.functions[0].returnType).toBe("long");
    expect(s.functions[0].params).toEqual([
      { type: "long", name: "x" },
      { type: "fixed", name: "y" },
    ]);
  });

  it("extracts struct types with members and struct instances", () => {
    const s = scanSymbols("struct Point {\n  long x;\n  long y;\n};\nstruct Point p;");
    expect(s.structs).toHaveLength(1);
    expect(s.structs[0].name).toBe("Point");
    expect(s.structs[0].members.map((m) => m.name)).toEqual(["x", "y"]);
    const p = s.variables.find((v) => v.name === "p");
    expect(p?.declaration).toBe("struct");
    expect(p?.typeName).toBe("Point");
  });

  it("extracts labels but not case/default", () => {
    const s = scanSymbols("myLabel:\n  goto myLabel;\ncase 1:");
    expect(s.labels.map((l) => l.name)).toEqual(["myLabel"]);
  });

  it("ignores commented-out declarations", () => {
    const s = scanSymbols("// long ghost;\nlong real;");
    expect(s.variables.map((v) => v.name)).toEqual(["real"]);
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts`
Expected: FAIL mit „Cannot find module './symbol-scanner'".

### Task 2.3: Symbolscanner implementieren

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/symbol-scanner.ts`

- [ ] **Step 1: Implementieren**

```ts
import { type SmartCSymbols, type SmartCDecl, emptySymbols } from "./symbols";

/** Replaces comment and string/char contents with spaces, preserving newlines and length. */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  type State = "code" | "line" | "block" | "dq" | "sq";
  let state: State = "code";
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"') { state = "dq"; out += " "; i++; continue; }
      if (c === "'") { state = "sq"; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") { out += c === "\n" ? "\n" : " "; if (c === "\n") state = "code"; i++; continue; }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; out += "  "; i += 2; }
      else { out += c === "\n" ? "\n" : " "; i++; }
      continue;
    }
    // dq / sq
    if (c === "\\") { out += "  "; i += 2; continue; }
    if ((state === "dq" && c === '"') || (state === "sq" && c === "'")) state = "code";
    out += c === "\n" ? "\n" : " ";
    i++;
  }
  return out;
}

interface Declarator { name: string; isPointer?: boolean; isArray?: boolean; value?: string }

function splitDeclarators(s: string): Declarator[] {
  return s
    .split(",")
    .map((part): Declarator => {
      const p = part.trim();
      const isPointer = /^\*/.test(p);
      const isArray = /\[/.test(p);
      const eq = p.indexOf("=");
      const lhs = (eq >= 0 ? p.slice(0, eq) : p).trim();
      const value = eq >= 0 ? p.slice(eq + 1).trim() : undefined;
      const m = /(\w+)/.exec(lhs.replace(/^\*+\s*/, ""));
      return { name: m ? m[1] : "", isPointer: isPointer || undefined, isArray: isArray || undefined, value };
    })
    .filter((d) => d.name.length > 0);
}

const TYPE = String.raw`(?:long|fixed|void|struct\s+\w+)`;

export function scanSymbols(source: string): SmartCSymbols {
  const syms = emptySymbols();
  const lines = stripCommentsAndStrings(source).split("\n");

  let inStruct: { name: string; line: number; members: { name: string; declaration: string }[] } | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    const lineNo = idx + 1;
    if (!line) continue;

    const mDef = /^#define\s+(\w+)\s*(\(([^)]*)\))?\s*(.*)$/.exec(line);
    if (mDef) {
      const params = mDef[2]
        ? mDef[3].split(",").map((x) => x.trim()).filter(Boolean)
        : undefined;
      syms.macros.push({ name: mDef[1], params, value: (mDef[4] ?? "").trim() || undefined, line: lineNo });
      continue;
    }
    if (line.startsWith("#")) continue; // #program / #pragma / #include

    if (inStruct) {
      if (line.startsWith("}")) {
        syms.structs.push({ name: inStruct.name, members: inStruct.members, line: inStruct.line });
        const inst = /^\}\s*(\w+)\s*;/.exec(line);
        if (inst) syms.variables.push({ name: inst[1], declaration: "struct", typeName: inStruct.name, line: lineNo });
        inStruct = null;
        continue;
      }
      const mem = new RegExp(String.raw`^(long|fixed|void|struct\s+\w+)\s+(.+);`).exec(line);
      if (mem) for (const d of splitDeclarators(mem[2])) inStruct.members.push({ name: d.name, declaration: mem[1] });
      continue;
    }

    const structOpen = /^struct\s+(\w+)\s*\{/.exec(line);
    if (structOpen) {
      inStruct = { name: structOpen[1], line: lineNo, members: [] };
      continue;
    }

    const fn = new RegExp(String.raw`^(${TYPE})\s+\*?\s*(\w+)\s*\(([^)]*)\)\s*\{?\s*$`).exec(line);
    if (fn) {
      const params = fn[3].trim()
        ? fn[3].split(",").map((p) => {
            const parts = p.trim().split(/\s+/);
            const name = (parts.pop() ?? "").replace(/[*[\]]/g, "");
            return { type: parts.join(" "), name };
          })
        : [];
      syms.functions.push({ name: fn[2], returnType: fn[1], params, line: lineNo });
      continue;
    }

    const structInst = /^struct\s+(\w+)\s+([^;{]+);/.exec(line);
    if (structInst) {
      for (const d of splitDeclarators(structInst[2]))
        syms.variables.push({ name: d.name, declaration: "struct", typeName: structInst[1], isPointer: d.isPointer, isArray: d.isArray, line: lineNo });
      continue;
    }

    const decl = /^(const\s+)?(long|fixed|void)\s+([^;{]+);/.exec(line);
    if (decl) {
      const declaration = decl[2] as SmartCDecl;
      for (const d of splitDeclarators(decl[3])) {
        if (decl[1]) syms.constants.push({ name: d.name, value: d.value, line: lineNo });
        else syms.variables.push({ name: d.name, declaration, isPointer: d.isPointer, isArray: d.isArray, line: lineNo });
      }
      continue;
    }

    const lab = /^(\w+)\s*:(?!:)/.exec(line);
    if (lab && lab[1] !== "case" && lab[1] !== "default" && !line.includes("?")) {
      syms.labels.push({ name: lab[1], line: lineNo });
    }
  }

  return syms;
}
```

- [ ] **Step 2: Test ausführen (muss bestehen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts`
Expected: PASS (alle Cases grün). Falls ein Regex-Case fehlschlägt, Regex/Reihenfolge anpassen, bis grün.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/smartc-editor/language/symbols.ts apps/studio/src/features/smartc-editor/language/symbol-scanner.ts apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts
git commit -m "feat(editor): document symbol scanner for SmartC (variables, macros, functions, structs, labels)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2.4: Scanner in den Symbol-Cache einhängen

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/symbol-cache.ts`

- [ ] **Step 1: Cache + Scanner ergänzen**

Ersetze den kompletten Inhalt von `symbol-cache.ts` durch:

```ts
import type * as Monaco from "monaco-editor";
import { SmartC } from "smartc-signum-compiler";
import { scanSymbols } from "./symbol-scanner";
import { type SmartCSymbols, emptySymbols } from "./symbols";

const cache = new Map<string, SmartCSymbols>();

export function getSymbols(model: Monaco.editor.ITextModel): SmartCSymbols {
  return cache.get(model.uri.toString()) ?? emptySymbols();
}

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function updateModel(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): void {
  const source = model.getValue();

  cache.set(model.uri.toString(), scanSymbols(source));

  const markers: Monaco.editor.IMarkerData[] = [];
  try {
    new SmartC({ language: "C", sourceCode: source }).compile();
  } catch (e: any) {
    const result = SmartCErrorPattern.exec(e.message ?? "");
    if (result?.groups) {
      const { line, column, message } = result.groups;
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: parseInt(line),
        startColumn: parseInt(column),
        endLineNumber: parseInt(line),
        endColumn: parseInt(column) + 1,
      });
    }
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
}

export function clearModel(model: Monaco.editor.ITextModel): void {
  cache.delete(model.uri.toString());
}
```

### Task 2.5: Doc-Symbole in Completion + Hover

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/completion-provider.ts`
- Modify: `apps/studio/src/features/smartc-editor/language/hover-provider.ts`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx`

- [ ] **Step 1: Completion um Doc-Symbole erweitern**

In `completion-provider.ts` oben ergänzen:
```ts
import { getSymbols } from "./symbol-cache";
```
Direkt vor `return { suggestions: items };` einfügen:
```ts
      const sym = getSymbols(model);
      for (const v of sym.variables)
        items.push({ label: v.name, kind: monaco.languages.CompletionItemKind.Variable, insertText: v.name, detail: `${v.declaration}${v.isPointer ? " *" : ""} ${v.name}`, range });
      for (const c of sym.constants)
        items.push({ label: c.name, kind: monaco.languages.CompletionItemKind.Constant, insertText: c.name, detail: `const ${c.name}`, range });
      for (const m of sym.macros) {
        const insert = m.params ? `${m.name}(${m.params.map((p, i) => `\${${i + 1}:${p}}`).join(", ")})` : m.name;
        items.push({ label: m.name, kind: monaco.languages.CompletionItemKind.Constant, insertText: insert, insertTextRules: m.params ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined, detail: `#define ${m.name}`, documentation: m.value, range });
      }
      for (const f of sym.functions) {
        const args = f.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
        items.push({ label: f.name, kind: monaco.languages.CompletionItemKind.Function, insertText: `${f.name}(${args})`, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: `${f.returnType} ${f.name}(...)`, range });
      }
      for (const st of sym.structs)
        items.push({ label: st.name, kind: monaco.languages.CompletionItemKind.Struct, insertText: st.name, detail: `struct ${st.name}`, range });

      const seen = new Set<string>();
      const deduped = items.filter((it) => {
        const key = `${it.kind}:${it.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { suggestions: deduped };
```
und die alte Zeile `return { suggestions: items };` entfernen.

- [ ] **Step 2: Hover um Doc-Symbole erweitern**

In `hover-provider.ts` oben ergänzen:
```ts
import { getSymbols } from "./symbol-cache";
```
Vor `return null;` (am Ende von `provideHover`) einfügen:
```ts
      const sym = getSymbols(model);
      const v = sym.variables.find((x) => x.name === word.word);
      if (v) return { contents: [{ value: `\`${v.declaration}${v.isPointer ? " *" : ""} ${v.name}\` — SmartC variable (line ${v.line})` }] };
      const m = sym.macros.find((x) => x.name === word.word);
      if (m) return { contents: [{ value: `\`#define ${m.name}${m.params ? `(${m.params.join(", ")})` : ""}\`${m.value ? ` → \`${m.value}\`` : ""}` }] };
      const f = sym.functions.find((x) => x.name === word.word);
      if (f) return { contents: [{ value: `\`${f.returnType} ${f.name}(${f.params.map((p) => `${p.type} ${p.name}`).join(", ")})\` — SmartC function` }] };
```
Das erste Argument der Funktion umbenennen: `provideHover(model, position)` bleibt; `createHoverProvider(_monaco)` → `createHoverProvider(_monaco)` unverändert (monaco nicht nötig).

- [ ] **Step 3: Word-based Suggestions abschalten**

In `smartc-editor.tsx` im `options={{ ... }}`-Objekt des `<Editor>` ergänzen:
```ts
            wordBasedSuggestions: "off",
```

- [ ] **Step 4: Build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [ ] **Step 5: Manueller Smoke-Test**

`bun run dev`: In einer `.smart.c`-Datei `long counter;` und `#define LIMIT 100` deklarieren; danach beim Tippen von `coun`/`LIM` erscheinen `counter`/`LIMIT` in der Completion; Hover über `counter` zeigt den Typ. Kein `int`/`char` mehr in den Vorschlägen.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/smartc-editor/language apps/studio/src/features/smartc-editor/smartc-editor.tsx
git commit -m "feat(editor): live document-symbol completion & hover; disable word-based suggestions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 3 — Diagnostics-Qualität + gemeinsamer Compile

Ziel: robustes Error-Parsing (nichts mehr verschlucken) + Compiler-Warnings anzeigen; ein Compile pro Änderung als Basis für Slice 4. **TDD** für das reine Error-Parsing.

### Task 3.1: `parseCompileError` + `analyzeWithCompiler` — Test zuerst

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/compiler-symbols.test.ts`

- [ ] **Step 1: Failing test schreiben**

```ts
import { describe, it, expect } from "bun:test";
import { parseCompileError, analyzeWithCompiler } from "./compiler-symbols";

describe("parseCompileError", () => {
  it("parses standard 'At line' errors", () => {
    expect(parseCompileError("At line: 5:3. Unknown token 'foo'")).toEqual({
      line: 5,
      column: 3,
      message: "Unknown token 'foo'",
    });
  });

  it("falls back to line 1 for unrecognised messages", () => {
    const r = parseCompileError("Something exploded");
    expect(r.line).toBe(1);
    expect(r.column).toBe(1);
    expect(r.message).toBe("Something exploded");
  });
});

describe("analyzeWithCompiler", () => {
  it("returns compiler symbols for valid source", () => {
    const r = analyzeWithCompiler("#pragma maxAuxVars 1\nlong a, b, c; a=b/~c;");
    expect(r.error).toBeNull();
    expect(r.compiler).not.toBeNull();
    expect(r.compiler!.variables).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("returns a parsed error for invalid source", () => {
    const r = analyzeWithCompiler("long ;;; broken");
    expect(r.compiler).toBeNull();
    expect(r.error).not.toBeNull();
    expect(typeof r.error!.message).toBe("string");
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/compiler-symbols.test.ts`
Expected: FAIL mit „Cannot find module './compiler-symbols'".

### Task 3.2: `compiler-symbols.ts` implementieren

**Files:**
- Create: `apps/studio/src/features/smartc-editor/language/compiler-symbols.ts`

- [ ] **Step 1: Implementieren**

```ts
import { SmartC } from "smartc-signum-compiler";

export interface ParsedError {
  line: number;
  column: number;
  message: string;
}
export interface CompilerSymbols {
  variables: string[];
  labels: string[];
  warnings: string;
}
export interface CompileAnalysis {
  compiler: CompilerSymbols | null;
  error: ParsedError | null;
}

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function parseCompileError(message: string): ParsedError {
  const m = SmartCErrorPattern.exec(message ?? "");
  if (m?.groups) {
    return {
      line: parseInt(m.groups.line),
      column: parseInt(m.groups.column),
      message: m.groups.message,
    };
  }
  return { line: 1, column: 1, message: (message ?? "").trim() || "Compilation error" };
}

function isInternalName(name: string): boolean {
  return /^r\d+$/.test(name); // aux registers r0, r1, ...
}

export function analyzeWithCompiler(source: string): CompileAnalysis {
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source });
    compiler.compile();
    const mc = compiler.getMachineCode();
    return {
      error: null,
      compiler: {
        variables: (mc.Memory ?? []).filter((n) => !isInternalName(n)),
        labels: (mc.Labels ?? []).map((l) => l.label),
        warnings: mc.Warnings ?? "",
      },
    };
  } catch (e: any) {
    return { compiler: null, error: parseCompileError(e?.message ?? "") };
  }
}
```

- [ ] **Step 2: Test ausführen (muss bestehen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/compiler-symbols.test.ts`
Expected: PASS.

### Task 3.3: Symbol-Cache auf `analyzeWithCompiler` umstellen (Warnings + robuste Fehler)

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/symbol-cache.ts`

- [ ] **Step 1: `updateModel` umstellen**

Ersetze in `symbol-cache.ts` die Imports von `SmartC` und die `SmartCErrorPattern`-Konstante durch:
```ts
import { analyzeWithCompiler } from "./compiler-symbols";
```
und ersetze den Body von `updateModel` ab `const markers ...` durch:
```ts
  const { error, compiler } = analyzeWithCompiler(source);
  const markers: Monaco.editor.IMarkerData[] = [];
  if (error) {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + 1,
    });
  }
  if (compiler && compiler.warnings.trim()) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: compiler.warnings.trim(),
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    });
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
```
(Die `SmartC`-Kompilierung wird nun ausschließlich über `analyzeWithCompiler` gemacht.)

- [ ] **Step 2: Build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [ ] **Step 3: Manueller Smoke-Test**

Fehlerhafter Code → Marker mit korrekter Zeile; Code mit Compiler-Warning → gelber Warning-Marker; Fehler ohne `At line`-Präfix → Marker auf Zeile 1 (nicht verschluckt).

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/smartc-editor/language
git commit -m "feat(editor): robust diagnostics with warnings and non-swallowing error parsing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 4 — Compiler-Symbol-Anreicherung (Merge)

Ziel: Bei sauberem Compile liefert der Compiler die autoritative Variablen-/Label-Liste; sie wird mit den Scanner-Symbolen gemerged. **TDD** für die reine Merge-Funktion.

### Task 4.1: `mergeSymbols` — Test zuerst

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts` (neue describe-Gruppe anhängen)

- [ ] **Step 1: Failing test schreiben**

Am Ende von `symbol-scanner.test.ts` anhängen:
```ts
import { mergeSymbols } from "./symbols";
import type { CompilerSymbols } from "./compiler-symbols";

describe("mergeSymbols", () => {
  it("adds compiler-only variables and labels without duplicating scanner ones", () => {
    const scanned = scanSymbols("long a;");
    const compiler: CompilerSymbols = { variables: ["a", "b"], labels: ["loop"], warnings: "" };
    const merged = mergeSymbols(scanned, compiler);
    expect(merged.variables.map((v) => v.name).sort()).toEqual(["a", "b"]);
    expect(merged.labels.map((l) => l.name)).toContain("loop");
  });

  it("returns scanner symbols unchanged when compiler is null", () => {
    const scanned = scanSymbols("long a;");
    const merged = mergeSymbols(scanned, null);
    expect(merged.variables.map((v) => v.name)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Test ausführen (muss fehlschlagen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts`
Expected: FAIL mit „mergeSymbols is not a function" / „not exported".

### Task 4.2: `mergeSymbols` implementieren

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/symbols.ts`

- [ ] **Step 1: Import-Typ + Funktion ergänzen** (am Dateiende)

```ts
import type { CompilerSymbols } from "./compiler-symbols";

/** Merges scanner symbols with authoritative compiler symbols (variables/labels). */
export function mergeSymbols(
  scanned: SmartCSymbols,
  compiler: CompilerSymbols | null,
): SmartCSymbols {
  if (!compiler) return scanned;
  const known = new Set(scanned.variables.map((v) => v.name));
  const extraVars: SmartCVariable[] = compiler.variables
    .filter((name) => !known.has(name))
    .map((name) => ({ name, declaration: "long" as const, line: 0 }));
  const knownLabels = new Set(scanned.labels.map((l) => l.name));
  const extraLabels = compiler.labels
    .filter((name) => !knownLabels.has(name))
    .map((name) => ({ name, line: 0 }));
  return {
    ...scanned,
    variables: [...scanned.variables, ...extraVars],
    labels: [...scanned.labels, ...extraLabels],
  };
}
```

- [ ] **Step 2: Test ausführen (muss bestehen)**

Run: `bun test apps/studio/src/features/smartc-editor/language/symbol-scanner.test.ts`
Expected: PASS.

### Task 4.3: Merge in `updateModel` verdrahten

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/symbol-cache.ts`

- [ ] **Step 1: Scanner + Compiler mergen**

In `symbol-cache.ts`: Import ergänzen
```ts
import { mergeSymbols } from "./symbols";
import { scanSymbols } from "./symbol-scanner";
```
`updateModel` so umbauen, dass der bereits berechnete `compiler` in den Cache-Merge fließt (eine einzige `analyzeWithCompiler`-Auswertung, kein doppelter Compile):
```ts
export function updateModel(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const source = model.getValue();
  const { error, compiler } = analyzeWithCompiler(source);

  cache.set(model.uri.toString(), mergeSymbols(scanSymbols(source), compiler));

  const markers: Monaco.editor.IMarkerData[] = [];
  if (error) {
    markers.push({ severity: monaco.MarkerSeverity.Error, message: error.message, startLineNumber: error.line, startColumn: error.column, endLineNumber: error.line, endColumn: error.column + 1 });
  }
  if (compiler && compiler.warnings.trim()) {
    markers.push({ severity: monaco.MarkerSeverity.Warning, message: compiler.warnings.trim(), startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 });
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
}
```
(Der frühere separate `cache.set(..., scanSymbols(source))` entfällt — er wird durch die gemergte Version ersetzt.)

- [ ] **Step 2: Build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [ ] **Step 3: Manueller Smoke-Test**

Gültiger Contract mit deklarierten Variablen + `goto`-Label → Variablen und Label erscheinen in der Completion auch dann verlässlich, wenn der Scanner sie (z.B. bei ungewöhnlicher Schreibweise) verpasst.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/smartc-editor/language
git commit -m "feat(editor): enrich symbols with authoritative compiler memory/labels on clean compile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 5 — Signature-Help für User-Funktionen + Aufräumen

Ziel: Signaturhilfe auch für selbst definierte Funktionen; toten Alt-Code entfernen.

### Task 5.1: Signature-Help auf User-Funktionen erweitern

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/language/signature-help-provider.ts`

- [ ] **Step 1: Doc-Funktionen einbeziehen**

Import ergänzen:
```ts
import { getSymbols } from "./symbol-cache";
```
Im `provideSignatureHelp` nach `const info = SmartCFunctions[call.name];` den Fall „User-Funktion" ergänzen — ersetze den Block ab `const info = ...` bis zum `return { value: ... }` durch:
```ts
      const builtin = SmartCFunctions[call.name];
      if (builtin) {
        const signature: Monaco.languages.SignatureInformation = {
          label: builtin.signature,
          documentation: { value: builtin.documentation, isTrusted: true },
          parameters: builtin.params.map((p) => ({
            label: p.name,
            documentation: { value: p.documentation, isTrusted: true },
          })),
        };
        return {
          value: { signatures: [signature], activeSignature: 0, activeParameter: Math.min(call.activeParameter, builtin.params.length - 1) },
          dispose: () => {},
        };
      }

      const userFn = getSymbols(model).functions.find((f) => f.name === call.name);
      if (userFn) {
        const label = `${userFn.returnType} ${userFn.name}(${userFn.params.map((p) => `${p.type} ${p.name}`).join(", ")})`;
        const signature: Monaco.languages.SignatureInformation = {
          label,
          parameters: userFn.params.map((p) => ({ label: `${p.type} ${p.name}` })),
        };
        return {
          value: { signatures: [signature], activeSignature: 0, activeParameter: Math.min(call.activeParameter, Math.max(userFn.params.length - 1, 0)) },
          dispose: () => {},
        };
      }
      return null;
```

- [ ] **Step 2: Build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

### Task 5.2: Alten Alt-Code entfernen

**Files:**
- Delete: `apps/studio/src/features/smartc-editor/language-definitions/smartc-language-definitions.ts`

- [ ] **Step 1: Sicherstellen, dass nichts mehr darauf verweist**

Run: `grep -rn "smartc-language-definitions\|extendCLangWithSmartC" apps/studio/src`
Expected: keine Treffer (der Import wurde in Task 1.8 ersetzt).

- [ ] **Step 2: Datei löschen**

```bash
git rm apps/studio/src/features/smartc-editor/language-definitions/smartc-language-definitions.ts
```

- [ ] **Step 3: Build + alle Tests**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`
Run: `bun test apps/studio/src/features/smartc-editor/language`
Expected: alle Tests PASS.

- [ ] **Step 4: Manueller Smoke-Test (Endabnahme)**

Eine eigene Funktion `long calc(long x) { ... }` definieren; beim Aufruf `calc(` erscheint die Signatur. Highlighting/Completion/Diagnostics unverändert korrekt.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/smartc-editor
git commit -m "feat(editor): signature help for user functions; remove legacy c-language extension

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Abschluss

Nach Slice 5: SmartC-korrektes Highlighting, Completion/Hover/Signaturen für benutzerdefinierte Symbole, robuste Diagnostics mit Warnings, Zweitdatei-Bug behoben, Alt-Code entfernt. `bun run build` grün, `bun test apps/studio/.../language` grün.

**Bekannte Grenzen (bewusst, siehe Spec):** einzeilige `struct P { ... };`-Definitionen und mehrzeilige (`\`) Makros werden vom Scanner nicht voll erfasst (Compiler-Anreicherung fängt Variablen bei sauberem Compile ab); keine Scope-Awareness; Compile läuft im Main-Thread. Diese sind Non-Scope und ggf. Kandidaten für spätere Iterationen.
