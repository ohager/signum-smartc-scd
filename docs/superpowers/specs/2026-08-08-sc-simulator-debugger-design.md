# SC-Simulator + Step-Debugger (Design)

**Datum:** 2026-08-08
**Phase:** 2 der SmartC-Studio-Roadmap — erstes Teilprojekt
**Status:** Design abgenommen, bereit für Implementierungsplan
**Vorbedingung:** Phase 1 (Monaco-Editor-Härtung) abgeschlossen auf `development`.

## Kontext

`apps/studio` ist eine Web-IDE für Signum-SmartC-Contracts. Der Editor ist gehärtet; jetzt
folgt der erste Baustein der Plattform-Phase: ein eingebetteter **SC-Simulator** (deleterium,
`SC-Simulator`) mit einem **Step-Debugger**, damit man einen Contract lokal ausführen und
schrittweise debuggen kann, ohne ihn auf die Blockchain zu deployen.

Wichtig: Dieses Teilprojekt ist **rein im Browser** lauffähig (SC-Simulator ist JS und laut
Owner problemlos einbettbar) und braucht **keinen** Companion-Daemon. Es läuft in der
bestehenden App (auch im späteren gehosteten „Lite"-Modus).

## Ziele

Einen vollwertigen Step-Debugger liefern: einen Contract gegen ein Szenario ausführen,
per Breakpoints anhalten, schrittweise durchlaufen und Zustand live inspizieren.

## Entscheidungen (abgenommen)

- **Voller Step-Debugger** (nicht nur „run + inspect").
- **Source-Level-Stepping ist die feste v1-Zusage**; die **Assembly-Ansicht ist synchronisiert**
  (hebt die aktuelle Instruktion mit hervor). Eigenständiges Assembly-Level-Stepping wird
  **nur aufgenommen, wenn die Engine es hergibt** (per Spike verifiziert — sehr wahrscheinlich,
  da SC-Simulator nativ auf Instruktionsebene steppt).
- **Source-Map** (`asmLine ↔ sourceLine`) wird aus den Verbose-Assembly-Zeilenkommentaren des
  Compilers gebaut.
- **Szenario** wird per **Formular-UI** erstellt und als **`.scenario.json`-Projektdatei**
  gespeichert (wiederverwendbar, versionierbar).
- **Layout D** (IDE-Standard-Hybrid, wie VS Code / IntelliJ / WebStorm): Editor mittig
  (Breakpoint-Gutter, Current-Line-Highlight, source⇄asm-Split), rechte **Inspector**-Spalte,
  unteres **Dock**, Step-Toolbar oben.
- **Integration:** SC-Simulator wird als **Engine eingebettet, eigene React-UI** darum gebaut
  (volle Kontrolle über Layout D + Source-Highlighting).
- **Ein Contract** unter Debug (Multi-Contract = spätere Extension, wird nicht verbaut).

## Spike zuerst (Entrisikung)

Die einzige echte Unbekannte ist die konkrete SC-Simulator-API. Die erste Plan-Aufgabe ist ein
Wegwerf-**Spike**, der beantwortet: Welches Eingabeformat lädt die Engine (Maschinencode-Hex
vs. Assembly)? Wie lauten `load / step / continue / reset`? Wie liest man `aktuelle Instruktion ·
Speicher (per Variablenname) · Register · Balance · emittierte Transaktionen · Status`? Meldet
die Engine die aktuelle **Assembly-Zeile** direkt (dann Source-Map = ein Hop) oder eine
Code-Adresse (zweiter Hop, gekapselt in `source-map.ts`)?

Ergebnis des Spikes = die reale Implementierung des `SimulatorEngine`-Adapters. Alles andere
hängt nur an dessen Interface, deshalb entrisikt der Spike, ohne die UI-Arbeit zu blockieren.

## Architektur & Modul-Zerlegung

Neues Feature-Verzeichnis `apps/studio/src/features/simulator/`, integriert mit dem bestehenden
`smartc-editor` (Monaco) und `smartc-signum-compiler`. Tiefe, einzeln testbare Einheiten:

```
features/simulator/
  engine/
    simulator-engine.ts   SimulatorEngine-Interface + SC-Simulator-Adapter   ← Isolations-Naht (Spike füllt Adapter)
    engine.types.ts        DebugState { currentAsmLine, memory{name→val}, registers, balance, emittedTx[], status, steps }
  compile-for-debug.ts     nutzt smartc-signum-compiler → { machineCode, assembly, verbose }
  source-map.ts            buildSourceMap(verboseAssembly) → { asmLine ↔ sourceLine }          (PURE, Unit-Test)
  scenario/
    scenario.types.ts      ScenarioFile (accounts, balances, timeline aus txs + block-advances)
    scenario-io.ts         parse / serialize / validate + Übersetzung ScenarioFile → Engine-Setup (PURE, Unit-Test)
    scenario-form.tsx      Formular-UI ⇄ ScenarioFile
  store.ts                 jotai DebugSession (siehe unten)
  ui/
    debug-toolbar.tsx      continue / step-over / into / out / reset / stop + [source|asm] + Status-Badge
    inspector-panel.tsx    Variables · Registers · Watch · Call stack · Breakpoints
    bottom-dock.tsx        Scenario · Console/Output · Emitted Txs · Balance (Tabs)
    editor-decorations.ts  Current-Line-Highlight + Breakpoint-Gutter, in die bestehende Monaco-Instanz verdrahtet
```

**Kern-Naht:** UI und Store hängen ausschließlich am typisierten **`SimulatorEngine`**-Interface
(`load / applyScenario / step / stepOver / continue(breakpoints) / reset / getState`), nie an
SC-Simulator-Interna. Das lokalisiert das gesamte Engine-Risiko in einem Adapter (Spike-Ergebnis)
und macht die Debugger-UI gegen eine Fake-Engine testbar.

## Datenfluss & Source-Map

```
"Debug" auf einer .smart.c-Datei
   → compileForDebug(source): smartc-signum-compiler mit Verbose-Assembly
        → { machineCode, assembly, sourceMap }         (Compile-Fehler ⇒ Debug blockiert, bestehende Diagnostics)
   → engine.load(machineCode) + engine.applyScenario(scenario)   → pausiert am Einstieg
   → step / stepOver / continue(breakpoints) / reset
        → engine.getState(): { currentAsmLine, memory{name→value}, registers, balance, emittedTx[], status, steps }
   → currentAsmLine → sourceLine (Source-Map)  → Highlight (Monaco im Source-Modus / Assembly-View im Asm-Modus)
   → Inspector: Speicher per Name, Register, Balance; Bottom-Dock: emittierte Txs + Console
```

**Source-Map = ein Hop (`asmLine ↔ sourceLine`).** SC-Simulators Debugger kennt die aktuelle
Assembly-Zeile; wir mappen nur Assembly↔Source über die **Verbose-Assembly-Zeilenkommentare**
des Compilers. `buildSourceMap` ist eine reine Funktion.

Zwei Feinheiten, im Design berücksichtigt:
1. `compileForDebug` schaltet Verbose-Ausgabe ein, indem es `#pragma verboseAssembly` **injiziert,
   falls nicht vorhanden**; die Source-Map **kompensiert den dadurch entstehenden Zeilenversatz**,
   damit Highlights auf den echten Nutzerzeilen landen.
2. Meldet die Engine statt einer Asm-Zeile eine **Code-Adresse**, kommt ein zweiter Hop hinzu —
   vollständig in `source-map.ts` gekapselt (Spike klärt das).

**Breakpoints:** in der Monaco-Gutter auf Source-Zeilen gesetzt → per Source-Map auf Asm-Zeilen
gemappt → `continue` läuft bis zur nächsten Breakpoint-Asm-Zeile oder Programmende, mit einem
**Max-Step-Sicherheitslimit**, damit ein schleifender Contract den Tab nicht aufhängt.

## Debug-Session-Modell + `.scenario.json`

**DebugSession** (jotai-Store, an **einen** Contract gebunden):
```ts
{ fileId, contractName, scenario, state: DebugState | null,
  breakpoints: Set<number /* sourceLine */>,
  runState: "idle" | "paused" | "running" | "ended" | "error",
  viewMode: "source" | "asm", error?: string }
```
`reset` startet mit dem aktuellen Szenario neu. Einzel-Contract, aber ohne hartkodierten
Singleton — Multi-Contract lässt sich später ergänzen.

**Szenario als erstklassige Datei** — neuer Dateityp `scenario` (`.scenario.json`) mit einem
**Formular-Editor** (in `files-page` geroutet wie `smartc`/`asm`, plus ein `filetype-icons`-Eintrag
— klein und konsistent mit der Phase-1-Datei-Verdrahtung). Format konzeptionell an
`smartc-testbed` angelehnt (damit „failing Test im Debugger öffnen" später natürlich ist):
```jsonc
{
  "version": 1,
  "contract": { "creator": "<accountId>", "activationAmount": "1_0000_0000" },
  "accounts": [ { "id": "alice", "balance": "100_0000_0000" } ],
  "timeline": [
    { "type": "tx", "sender": "alice", "amount": "5_0000_0000", "message": { /* Methode+Args oder Hex */ } },
    { "type": "blocks", "count": 3 }        // N Blöcke vorspulen (timeLapse)
  ]
}
```
`scenario-io.ts` (rein): parse / serialize / validate und **Übersetzung `ScenarioFile` → Engine-Setup**
(exakte Engine-Felder per Spike bestätigt). Die Debug-Session nutzt standardmäßig ein
Geschwister-`<contract>.scenario.json` und lässt ein anderes auswählen.

## UI (Layout D)

- **DebugToolbar** — continue / step-over / step-into / step-out / reset / stop + **source⇄asm**-Toggle
  + Status-Badge (`runState` · Step-Zähler). Buttons dispatchen Store-Aktionen → `SimulatorEngine`.
- **Editor-Integration** (`editor-decorations.ts`) — Breakpoint-**Gutter** (Klick toggelt
  `store.breakpoints`), **Current-Line**-Dekoration aus `state.currentAsmLine → sourceLine`.
  Source-Modus nutzt den bestehenden Monaco-`.smart.c`-Editor; **Asm-Modus** zeigt eine
  read-only Monaco-Assembly-Ansicht mit denselben Dekorationen.
- **InspectorPanel** (rechts) — **Variables** (Engine-Speicher per SmartC-Name), **Registers**,
  **Watch**, **Call stack**, **Breakpoints**-Liste. *v1-Realität:* Variables/Registers/Breakpoints
  solide; **Watch und Call-stack sind in v1 minimal** (AT hat flache Call-Semantik; Watch = eine
  gewählte Variable/Register anzeigen) und wachsen später.
- **BottomDock** (Tabs) — **Scenario** (das Formular), **Console/Output** (Logs, Warnings,
  Halt-/Exit-Grund), **Emitted Txs** (Empfänger · Betrag · Nachricht), **Balance** (Contract-Balance
  im Verlauf).
- **ScenarioForm** — Transaktionen / Block-Advances / Accounts+Balances hinzufügen/bearbeiten;
  liest/schreibt `<contract>.scenario.json`.

## Fehlerbehandlung

- Compile-Fehler → Debug deaktiviert, bestehende Diagnostics wiederverwendet.
- Ungültiges Szenario → Fehler im Scenario-Tab, Run blockiert.
- Engine-Ausgänge (halt / exit / out-of-gas / Step-Limit) → in **Status + Console** gespiegelt,
  nie ein Crash. Der Engine-Adapter fängt/normalisiert SC-Simulator-Exceptions.
- **Max-Step-Limit** bei `continue` gegen Endlosschleifen.

## Testing

- **Unit (`bun test`, DOM-frei):** `source-map`-Builder; `scenario-io` (parse/serialize/validate);
  Breakpoint→Asm-Mapping.
- **Integration:** Engine-Adapter — bekannten kompilierten Contract + Szenario laden, steppen,
  `DebugState` prüfen (node-fähiges JS, wie der `compiler-symbols`-Test); genaue Assertions
  werden nach dem Spike konkretisiert.
- **UI:** Build + manueller Smoke-Test.

## v1-Grenzen & spätere Extensions

**v1-Grenzen:** ein Contract unter Debug · Source-Level-Stepping garantiert, Asm-Level-Stepping
falls Engine es hergibt · Watch/Call-stack minimal · kein Time-Travel/Back-Step · keine
Cross-Contract-Calls.

**Spätere Extensions:** Multi-Contract-Switching + Cross-Contract-Calls · „failing
`smartc-testbed`-Szenario im Debugger öffnen" · Time-Travel · reichere Watch-Ausdrücke.
Bleibt browser-only — kein Daemon nötig.
