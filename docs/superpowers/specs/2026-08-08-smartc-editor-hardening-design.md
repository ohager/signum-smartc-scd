# SmartC Monaco Editor — Härtung (Design)

**Datum:** 2026-08-08
**Phase:** 1 (Monaco-Editor) der SmartC-Studio-Roadmap
**Status:** Design abgenommen, bereit für Implementierungsplan
**Vorbedingung:** Phase 0 (SCD-Entfernung) ist abgeschlossen und auf `development` committet.

## Kontext

`apps/studio` ist eine Web-IDE für Signum-SmartC-Contracts (React 19 + Monaco). Die
SmartC-Monaco-Einbettung fühlt sich „unrund" an: Built-in-**Funktionen** werden gut
vervollständigt, aber **benutzerdefinierte Symbole** (Variablen, `#define`s, Labels,
Funktionen, struct-Member) gar nicht, und das Syntax-Highlighting ist generisches C.

### Wurzelursachen (aus der Analyse)

- Der Completion-/Hover-/Signature-Provider speist sich ausschließlich aus zwei
  **statischen** Tabellen (`SmartCKeywords`, `SmartCFunctions`) und macht **keine
  Dokument-Analyse** → benutzerdefinierte Symbole sind strukturell nicht vorschlagbar.
- Es gibt **keinen SmartC-Monarch-Tokenizer**; gehighlightet wird mit Monacos Stock-`"c"`.
  Folge: `fixed` gilt nicht als Typ, `#program`/`#pragma` als generische Präprozessor-
  Direktiven, Underscore-Zahlen (`4_0000_0000`) tokenisieren falsch, Built-ins ohne eigene
  Farbe. `SmartCDisabledKeywords` (in SmartC ungültige C-Keywords) ist definiert, aber
  ungenutzt.
- Der Compiler (`smartc-signum-compiler` v2.3.0) hält sein reiches internes Modell
  (`CONTRACT.memory[]`, `functions[]`, `macros[]`) im **privaten** Feld `Program`. Öffentlich
  ist nur `getMachineCode(): MACHINE_OBJECT` mit `Memory: string[]` (Variablennamen),
  `Labels[]`, `Warnings` — **aber nur nach erfolgreichem `compile()`**.
- Nebenbefunde: Diagnostics zeigen nur `markers[0]`, Warnings nie; der `onDidCreateModel`-
  Handler ist auskommentiert und zusammen mit dem globalen `hasExtendedAlready`-Guard bekommt
  eine **später geöffnete zweite SmartC-Datei vermutlich keine Live-Diagnostics**; voller
  Recompile pro Edit im Main-Thread; keine `triggerCharacters`.

## Ziele

Completion/Hover/Signaturen kennen benutzerdefinierte Symbole; Highlighting ist
SmartC-korrekt; Diagnostics zeigen mehr als den ersten Fehler; der Zweitdatei-Bug ist weg.

**In-Scope:** Symbolscanner (Rückgrat A), dedizierter SmartC-Monarch-Tokenizer +
Language-Config, Provider auf Symbolmodell umstellen, Diagnostics-Verbesserung +
Model-Lifecycle-Fix, Compiler-Symbol-Anreicherung (B).

**Non-Scope (YAGNI/später):** Compile im Web-Worker (Perf), echter LSP, Formatter/Rename/
Go-to-Definition, Scope-Awareness (lokal vs. global) in der Completion.

## Entscheidung: eigene Language-ID `"smartc"`

Statt weiterhin die Stock-`"c"`-Sprache zu überschreiben, wird eine eigene Language-ID
`"smartc"` mit eigenem Tokenizer + Config registriert. Vorteile: korrektes Highlighting ohne
globale C-Nebenwirkungen, sauberer Model-Guard (`=== "smartc"`), `SmartCDisabledKeywords`
sinnvoll nutzbar. `smartc-editor.tsx` setzt `defaultLanguage="smartc"`.

## Architektur

Heute steckt alles in `extendCLangWithSmartC` mit globalem Zustand. Zerlegung in fokussierte,
einzeln testbare Einheiten unter `apps/studio/src/features/smartc-editor/language/`:

```
Editor (smartc-editor.tsx)
   └─ registerSmartC(monaco)                    ← Orchestrator (idempotent), ersetzt extendCLangWithSmartC
        ├─ language/smartc-monarch.ts            Monarch-Tokenizer (reine Daten)
        ├─ language/smartc-language-config.ts    Brackets/Comments/AutoClose
        ├─ model/symbol-scanner.ts   scanSymbols(text) → SmartCSymbols       ← PURE, DOM-frei, Rückgrat (A)
        ├─ model/compiler-symbols.ts extractCompilerSymbols(text) → …|null   ← PURE, Anreicherung (B)
        ├─ model/symbol-cache.ts     per-Model-Cache (debounced), merge A+B
        └─ providers/
             ├─ completion-provider.ts   built-ins + Doc-Symbole, triggerChars, Disabled-Filter
             ├─ hover-provider.ts        built-ins + Doc-Symbole (Typ/Expansion)
             ├─ signature-help.ts        built-ins + User-Funktionen
             └─ diagnostics.ts           alle Fehler + Warnings, korrektes Model-Lifecycle
```

**Datenfluss:** Bei jeder (debounced) Änderung aktualisiert `symbol-cache` die Symbole für
das jeweilige Model (Scanner immer; Compiler-Symbole bei sauberem Compile). Die Provider sind
**einmalig global** registriert (Monaco-Eigenheit), lesen aber pro Anfrage die Symbole des
jeweiligen Models aus dem Cache. Das löst „globale Provider, aber Dokument-Kontext nötig" und
beseitigt den Zweitdatei-Bug (idempotente Registrierung + Model-Listener via
`onDidCreateModel` + Disposables statt einmaligem Snapshot).

**Warum diese Schnitte:** `scanSymbols` und `extractCompilerSymbols` sind reine Funktionen
(String rein, typisierte Symbole raus) — ohne Monaco/DOM mit `bun test` prüfbar. Die Provider
werden zu dünnen Adaptern über dem Symbolmodell.

## Symbolmodell + Scanner (Rückgrat A)

`scanSymbols(source: string): SmartCSymbols` — reine Funktion.

```ts
interface SmartCSymbols {
  variables: { name; declaration: 'long'|'fixed'|'void'|'struct'; typeName?; isPointer?; isArray?; line }[]
  macros:    { name; params?: string[]; value?; line }[]     // #define (obj- oder funktionsartig)
  functions: { name; returnType; params: {type;name}[]; line }[]
  structs:   { name; members: {name; declaration}[]; line }[]
  labels:    { name; line }[]
  constants: { name; value?; line }[]                          // const long X = ...
}
```

**Heuristiken (zeilenorientiert):**

1. **Zuerst Kommentare + String-Inhalte neutralisieren** (durch Platzhalter ersetzen) →
   keine Fehltreffer durch `;`/`{` in Strings/Kommentaren. Wichtigster Robustheitsschritt.
2. Deklarationen: `long|fixed|void|struct <T>` + komma-separierte Deklaratoren — deckt
   `long a, b, c;`, `fixed p = 1.5;`, `long * ptr;`, `long arr[4];`, `struct Foo bar;` ab.
3. Funktionen: Typ + Name + `( … )` + `{` → Rückgabetyp/Name/Parameter.
4. `struct NAME { … };` → Name + Member. `const …` → Konstante. Labels: `^\s*\w+:` (ohne
   `case`/`default`).

**Ehrliche Grenzen:** Regex ≠ echter Parser — mehrzeilige/`\`-fortgesetzte Makros und exotische
Fälle können danebenliegen. Akzeptabel, weil (a) compile-unabhängig und live, (b) Option B die
autoritative Variablenliste bei sauberem Compile liefert.

## Provider + Diagnostics (inkl. Bugfixes)

- **Completion:** Built-ins (`SmartCKeywords` + `SmartCFunctions`-Snippets) **+ Doc-Symbole**
  aus dem Cache (Variablen→`Variable`, Makros→Snippet/Konstante, Funktionen→Snippet,
  Labels→nach `goto `, struct-Member→nach `.`/`->`). `triggerCharacters: ['.', '->']`.
  `SmartCDisabledKeywords` werden herausgefiltert; Monacos `wordBasedSuggestions` wird
  **abgeschaltet** (unser Scanner liefert die Doc-Identifier → kein `int`/`char`-Rauschen).
- **Hover:** zusätzlich Doc-Symbole — Variable → `long name` (+ Zeile), Makro →
  `#define NAME → value`, Funktion → Signatur.
- **Signature-Help:** bestehende Klammer-Logik plus User-Funktionen aus dem Modell.
- **Diagnostics:** Compiler-**Warnings** (`MACHINE_OBJECT.Warnings`) als Warning-Marker;
  Error-Parsing robuster (Fehler ohne exaktes `At line`-Muster nicht mehr verschlucken →
  Fallback-Marker auf Zeile 1). **Lifecycle-Fix:** Provider einmalig global mit Disposables;
  Model-Listener via `onDidCreateModel` + bestehende Modelle, pro Model verdrahtet/entsorgt.

## Compiler-Anreicherung (B), effizient verzahnt

Schlüssel-Optimierung: **ein** debounced Compile pro Änderung bedient **beides** —
Diagnostics *und* Symbole. `extractCompilerSymbols` nutzt den erfolgreichen Compile:
`getMachineCode().Memory` (autoritative Variablen), `.Labels`, `.Warnings`. Merge im Cache:
Scanner immer (UX/Live), Compiler-Symbole überschreiben/bestätigen bei Erfolg. Offensichtlich
compiler-interne Namen (Register `r0…`, Aux-Vars) werden gefiltert. Bei Compile-Fehler →
`null`, Scanner trägt allein.

## Testing

- **Unit (`bun test`, DOM-frei):**
  - `symbol-scanner.test.ts` — Mehrfach-Decl, Pointer, Array, struct+Member, Funktionen,
    obj-/func-Makros, Labels, Kommentar/String-Stripping, Trickfälle.
  - `compiler-symbols.test.ts` — gültiger Contract → Memory/Labels/Warnings; ungültig → null.
  - Error-Parsing-Test für Diagnostics.
- **Smoke (manuell):** Variablen/`#define`s autocompleten; Highlighting korrekt (`fixed`,
  `#program`, `4_0000_0000`); zweite Datei bekommt Diagnostics; mehrere Fehler/Warnings sichtbar.

## Rollout (kleine Commits, jeder hält `bun run build` grün)

1. Tokenizer + Language-Registrierung (`"smartc"`) → sichtbarer Highlight-Gewinn, unabhängig.
2. Symbolscanner + Completion/Hover-Verdrahtung → die Kernlücke (Variablen/`#define`s).
3. Diagnostics-Verbesserung + Model-Lifecycle-Fix.
4. Compiler-Anreicherung (B).
5. Signature-Help für User-Funktionen.

Slices 1+2 liefern den Löwenanteil. Der alte `extendCLangWithSmartC` bleibt, bis
`registerSmartC` steht, und wird dann entfernt.
