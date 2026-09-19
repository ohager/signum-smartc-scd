# Design Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Studio's stock shadcn/zinc appearance with the Signum design language from `signum-sandbox` — four climates, radius 0, hairlines, a Monaco theme that belongs to the app, and an event-bound motion vocabulary.

**Architecture:** One token layer in `styles/globals.css` holds four `[data-theme]` blocks; shadcn's semantic variables are re-pointed at those tokens, so all 35 existing components inherit the climate untouched. A small TypeScript layer (`src/theme/`) holds only what CSS cannot reach — the Monaco theme derivation and the picker metadata. Motion is CSS-only, with its numbers declared once in TypeScript and published as custom properties.

**Tech Stack:** Tailwind CSS 4 (`@theme inline`, `@custom-variant`), shadcn new-york with `cssVariables: true`, next-themes 0.4.6, `@monaco-editor/react`, Bun test.

**Spec:** `docs/superpowers/specs/2026-09-18-design-language-design.md`

---

## Two corrections to the spec

Found while reading the code; the spec's intent is unchanged.

1. **The dim text slot cannot be called `--muted`.** shadcn's `--muted` is a *surface* (`bg-muted` is used in every editor header) and `--muted-foreground` is its text. A Signum slot of the same name would silently repaint every muted surface with a text colour. The slot is **`--dim`**, and shadcn is aliased `--muted: var(--bg2); --muted-foreground: var(--dim);`.
2. **The `dark:` variant must be redefined.** `styles/globals.css:5` declares `@custom-variant dark (&:is(.dark *))`, and there are **101 `dark:` utilities across 20 files**. Dropping the `.dark` class in favour of `data-theme` would silently disable all of them. Task 2 redefines the variant over the three dark climates.

## File structure

```
apps/studio/
  styles/globals.css                         MODIFY  four [data-theme] blocks, shadcn aliases, dark variant
  src/index.css                              MODIFY  literals → token references
  src/App.tsx                                MODIFY  ThemeProvider reconfigured
  src/theme/
    climates.ts                              CREATE  the four climates: picker metadata + Monaco-facing colours
    climates.test.ts                         CREATE
    monaco-themes.ts                         CREATE  buildSmartcTheme / buildAsmTheme / registerClimateThemes
    monaco-themes.test.ts                    CREATE
    use-monaco-theme.ts                      CREATE  replaces seven hard-coded theme strings
  src/motion/
    tokens.ts                                CREATE  durations, easings, springs, publish to CSS
    tokens.test.ts                           CREATE
    resolve.ts                               CREATE  explicit choice vs prefers-reduced-motion
    resolve.test.ts                          CREATE
    motion.css                               CREATE  keyframes: flash, arrive, pulse, nudge
    use-motion.ts                            CREATE  the data-motion switch
  src/components/ui/
    button.tsx                               MODIFY  + console, console-primary variants
    panel.tsx                                CREATE  hairline box / bracketed variant
    grid-backdrop.tsx                        CREATE  the static 40px grid, for arrival surfaces
    theme-switch.tsx                         MODIFY  becomes the climate picker
    page.tsx                                 MODIFY  PageFooter's hard-coded white
    editor/editor-toolbar.tsx                CREATE  the header the four editors hard-code four times
  src/components/ui/layout/left-sidebar.tsx        MODIFY  the Orbitron wordmark
  src/features/home/{hero,project-grid,how-it-works}.tsx  MODIFY  backdrop + bracketed panels
  src/features/simulator/ui/debug-primitives.tsx   MODIFY  Pill/Section/KVTable onto tokens
```

Each of the ten tasks below leaves the app building and the suite green.

---

## Task 1: The four climates as data

**Files:**
- Create: `apps/studio/src/theme/climates.ts`
- Test: `apps/studio/src/theme/climates.test.ts`

This module holds **only** what CSS cannot reach: the colours Monaco needs and the metadata the picker needs. The chrome's palette lives in `globals.css` and is not duplicated here.

- [x] **Step 1: Write the failing test**

```ts
// apps/studio/src/theme/climates.test.ts
import { describe, it, expect } from "bun:test";
import { CLIMATES, DEFAULT_CLIMATE, climateById, CLIMATE_IDS } from "./climates";

describe("climates", () => {
  it("offers exactly the four approved climates, in picker order", () => {
    expect(CLIMATE_IDS).toEqual(["nexus", "dawn", "solaris", "terminal"]);
  });

  it("starts on nexus", () => {
    expect(DEFAULT_CLIMATE).toBe("nexus");
  });

  it("gives every climate the colours Monaco needs", () => {
    for (const climate of CLIMATES) {
      for (const key of ["code", "gutter", "keyword", "type", "number", "comment", "string"] as const) {
        expect(climate.editor[key]).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(climate.accent1).toMatch(/^#[0-9a-f]{6}$/);
      expect(climate.accent2).toMatch(/^#[0-9a-f]{6}$/);
      expect(climate.text).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("knows which climates are dark, because Monaco inherits from a base", () => {
    expect(climateById("dawn")!.base).toBe("vs");
    expect(climateById("nexus")!.base).toBe("vs-dark");
    expect(climateById("solaris")!.base).toBe("vs-dark");
    expect(climateById("terminal")!.base).toBe("vs-dark");
  });

  it("returns undefined for an id it does not know", () => {
    expect(climateById("aurora")).toBeUndefined();
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd apps/studio && bun test src/theme/climates.test.ts`
Expected: FAIL — `Cannot find module './climates'`

- [x] **Step 3: Write the implementation**

```ts
// apps/studio/src/theme/climates.ts

/**
 * The four climates, as far as TypeScript needs to know them.
 *
 * The chrome's palette lives in `styles/globals.css` — one source, switched by
 * `[data-theme]`. What cannot be reached from CSS is Monaco, which takes its
 * colours as a JavaScript object, and the picker, which needs a label and a
 * dot. That, and nothing else, is what this file holds.
 */

export type ClimateId = "nexus" | "dawn" | "solaris" | "terminal";

/** The colours Monaco paints the code surface with. */
export interface ClimateEditorColours {
  /** The editor ground. Deliberately a step off `--bg`, so code sits apart from the chrome. */
  code: string;
  gutter: string;
  keyword: string;
  type: string;
  number: string;
  comment: string;
  string: string;
}

export interface Climate {
  id: ClimateId;
  label: string;
  /** Monaco inherits from one of its two built-in bases. */
  base: "vs" | "vs-dark";
  /** The dot in the picker, and the colour a selection is tinted with. */
  accent1: string;
  /** Cursor, active line, focused border. */
  accent2: string;
  text: string;
  editor: ClimateEditorColours;
}

export const CLIMATES: Climate[] = [
  {
    id: "nexus",
    label: "Nexus",
    base: "vs-dark",
    accent1: "#0066ff",
    accent2: "#00aaff",
    text: "#d0e4ff",
    editor: {
      code: "#0a0f1c",
      gutter: "#2e3c55",
      keyword: "#5aa7ff",
      type: "#60c8ff",
      number: "#ffd700",
      comment: "#3d4d68",
      string: "#00ffaa",
    },
  },
  {
    id: "dawn",
    label: "Dawn",
    base: "vs",
    accent1: "#0055cc",
    accent2: "#0066ff",
    text: "#1a2540",
    editor: {
      code: "#f7f9ff",
      gutter: "#a8b6d4",
      keyword: "#0b3d91",
      type: "#0055cc",
      number: "#b87000",
      comment: "#94a3b8",
      string: "#00956b",
    },
  },
  {
    id: "solaris",
    label: "Solaris",
    base: "vs-dark",
    accent1: "#ff9500",
    accent2: "#ffd700",
    text: "#ffe8c0",
    editor: {
      code: "#120c05",
      gutter: "#5c4520",
      keyword: "#ffb84d",
      type: "#ffe566",
      number: "#39d353",
      comment: "#5c4520",
      string: "#39d353",
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    base: "vs-dark",
    accent1: "#00cc00",
    accent2: "#00ff00",
    text: "#90ee90",
    editor: {
      code: "#001200",
      gutter: "#2a5a2a",
      keyword: "#66ff66",
      type: "#00cc00",
      number: "#ffcc00",
      comment: "#2a5a2a",
      string: "#00ff00",
    },
  },
];

export const CLIMATE_IDS = CLIMATES.map((climate) => climate.id);

export const DEFAULT_CLIMATE: ClimateId = "nexus";

export function climateById(id: string): Climate | undefined {
  return CLIMATES.find((climate) => climate.id === id);
}
```

- [x] **Step 4: Run the test and watch it pass**

Run: `cd apps/studio && bun test src/theme/climates.test.ts`
Expected: PASS, 5 tests

- [x] **Step 5: Commit**

```bash
git add apps/studio/src/theme/climates.ts apps/studio/src/theme/climates.test.ts
git commit -m "feat(studio): the four climates as data"
```

---

## Task 2: The token layer

**Files:**
- Modify: `apps/studio/styles/globals.css` (full rewrite of lines 1–78, plus the variant on line 5)
- Modify: `apps/studio/src/App.tsx:13`
- Modify: `apps/studio/src/index.css:1-8`

No test: this is a stylesheet. It is verified by the build and, at the end, in the browser.

- [x] **Step 1: Rewrite the head of `styles/globals.css`**

Replace everything from line 1 up to and including the closing brace of the `.dark` block (line 78) with:

```css
@import "tailwindcss";

@plugin "tailwindcss-animate";

/*
 * `dark:` utilities are used 101 times across 20 files. The class they keyed
 * off is gone, so the variant now matches the three dark climates instead.
 * Dawn is the light one and deliberately absent.
 */
@custom-variant dark (&:is([data-theme="nexus"] *, [data-theme="solaris"] *, [data-theme="terminal"] *));

/*
 * Four climates, one token layer.
 *
 * Each block declares the Signum slots and then points shadcn's semantic
 * variables at them, so all 35 shadcn components inherit the climate without
 * being touched. Note `--dim` rather than `--muted`: shadcn's `--muted` is a
 * surface, not a text colour.
 */

:root,
[data-theme="nexus"] {
  --bg: #050810;
  --bg2: #080d1a;
  --panel: rgba(8, 16, 40, 0.85);
  --border-1: rgba(0, 102, 255, 0.18);
  --border-2: rgba(0, 170, 255, 0.3);
  --accent-1: #0066ff;
  --accent-2: #00aaff;
  --accent-3: #60c8ff;
  --green: #00ffaa;
  --mag: #ff0055;
  --amber: #ff9500;
  --gold: #ffd700;
  --text: #d0e4ff;
  --dim: #5a7090;
  --code: #0a0f1c;
  --gutter: #2e3c55;
  --grid-line: rgba(0, 102, 255, 0.04);
  --card-hover: 0 8px 32px rgba(0, 102, 255, 0.18);
  --glow: 0 0 20px rgba(0, 102, 255, 0.35);
}

[data-theme="dawn"] {
  --bg: #eef2fb;
  --bg2: #e2e8f8;
  --panel: rgba(255, 255, 255, 0.94);
  --border-1: rgba(0, 102, 255, 0.14);
  --border-2: rgba(0, 102, 255, 0.26);
  --accent-1: #0055cc;
  --accent-2: #0066ff;
  --accent-3: #3388ff;
  --green: #00956b;
  --mag: #cc0044;
  --amber: #c06000;
  --gold: #b87000;
  --text: #1a2540;
  --dim: #6678a0;
  --code: #f7f9ff;
  --gutter: #a8b6d4;
  --grid-line: rgba(0, 102, 255, 0.06);
  --card-hover: 0 6px 24px rgba(0, 102, 255, 0.12);
  /* In daylight a glow reads as dirt. It becomes a drop shadow instead. */
  --glow: 0 2px 12px rgba(0, 102, 255, 0.18);
}

[data-theme="solaris"] {
  --bg: #0d0906;
  --bg2: #1a1204;
  --panel: rgba(36, 20, 4, 0.88);
  --border-1: rgba(255, 149, 0, 0.2);
  --border-2: rgba(255, 200, 0, 0.32);
  --accent-1: #ff9500;
  --accent-2: #ffd700;
  --accent-3: #ffe566;
  --green: #39d353;
  --mag: #ff3d6b;
  /* Not the sandbox's #ff9500: there it is the accent colour as well, and a
     compiler warning cannot look like a primary button. */
  --amber: #ff7a00;
  --gold: #ffd700;
  --text: #ffe8c0;
  --dim: #9a7040;
  --code: #120c05;
  --gutter: #5c4520;
  --grid-line: rgba(255, 149, 0, 0.05);
  --card-hover: 0 8px 32px rgba(255, 149, 0, 0.18);
  --glow: 0 0 20px rgba(255, 149, 0, 0.35);
}

[data-theme="terminal"] {
  --bg: #000a00;
  --bg2: #001400;
  --panel: rgba(0, 20, 0, 0.9);
  --border-1: rgba(0, 255, 0, 0.16);
  --border-2: rgba(0, 255, 0, 0.32);
  --accent-1: #00cc00;
  --accent-2: #00ff00;
  --accent-3: #66ff66;
  --green: #00ff00;
  --mag: #ff3300;
  --amber: #ff8800;
  --gold: #ffcc00;
  --text: #90ee90;
  --dim: #3a7a3a;
  --code: #001200;
  --gutter: #2a5a2a;
  --grid-line: rgba(0, 255, 0, 0.05);
  --card-hover: 0 0 20px rgba(0, 255, 0, 0.16);
  --glow: 0 0 16px rgba(0, 255, 0, 0.4);
}

/* Terminal is the mono climate: the whole surface, not just the code. */
[data-theme="terminal"] {
  --font-body: "JetBrains Mono", ui-monospace, monospace;
}

/* shadcn keeps speaking its own language; it just points at ours. */
:root,
[data-theme] {
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--panel);
  --card-foreground: var(--text);
  --popover: var(--bg2);
  --popover-foreground: var(--text);
  --primary: var(--accent-1);
  --primary-foreground: var(--bg);
  --secondary: var(--bg2);
  --secondary-foreground: var(--text);
  --muted: var(--bg2);
  --muted-foreground: var(--dim);
  --accent: var(--accent-2);
  --accent-foreground: var(--bg);
  --destructive: var(--mag);
  --destructive-foreground: var(--bg);
  --border: var(--border-1);
  --input: var(--border-2);
  --ring: var(--accent-2);
  --radius: 0rem;
  --chart-1: var(--accent-1);
  --chart-2: var(--green);
  --chart-3: var(--amber);
  --chart-4: var(--accent-3);
  --chart-5: var(--mag);
  --sidebar: var(--bg2);
  --sidebar-background: var(--bg2);
  --sidebar-foreground: var(--text);
  --sidebar-primary: var(--accent-1);
  --sidebar-primary-foreground: var(--bg);
  --sidebar-accent: var(--border-1);
  --sidebar-accent-foreground: var(--text);
  --sidebar-border: var(--border-1);
  --sidebar-ring: var(--accent-2);
}
```

Leave the `@theme inline` block (lines 80–137 of the original) and the `@layer base` block untouched: they already map these variables into Tailwind's colour scale.

- [x] **Step 2: Add the typefaces and the body font to `@layer base`**

At the top of `styles/globals.css`, immediately after `@import "tailwindcss";`, add:

```css
@import url("https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;700&family=Orbitron:wght@400;700;900&display=swap");
```

And extend the existing `@layer base` block at the end of the file:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-body, "Exo 2", ui-sans-serif, system-ui, sans-serif);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
}
```

- [x] **Step 3: Reconfigure the provider**

In `apps/studio/src/App.tsx`, replace line 13:

```tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
```

with:

```tsx
<ThemeProvider
  attribute="data-theme"
  themes={["nexus", "dawn", "solaris", "terminal"]}
  defaultTheme="nexus"
  enableSystem={false}
>
```

`enableSystem` stays off: four climates do not map onto a binary OS preference.

- [x] **Step 4: Strip the loose Signum colours from `src/index.css`**

Replace lines 3–7 of `apps/studio/src/index.css`:

```css
@theme {
  --color-signum-blue: #0066ff;
  --color-signum-lightblue: #0099ff;
  --color-signum-green: #00ff88;
}
```

with nothing. Then replace the hard-coded literals further down the same file:

```css
.debug-current-line { background: color-mix(in srgb, var(--accent-2) 12%, transparent); }
.debug-current-glyph { background: var(--accent-2); }
.debug-breakpoint { background: var(--mag); border-radius: 50%; width: 10px !important; height: 10px !important; margin: 5px 0 0 6px; }

.test-glyph-idle    { color: var(--dim); }
.test-glyph-pending { color: var(--dim); }
.test-glyph-running { color: var(--accent-2); }
.test-glyph-passed  { color: var(--green); }
.test-glyph-failed  { color: var(--mag); }
.test-glyph-skipped { color: var(--dim); opacity: 0.6; }

.test-glyph-runnable:hover { color: var(--green); }

.test-inline-ok { color: var(--green); margin-left: 3ch; }

.test-inline-value {
  color: var(--dim);
  font-style: italic;
  opacity: 0.9;
  cursor: pointer;
  margin-left: 3ch;
}
```

Keep the existing `::before` triangle geometry block for the test glyphs exactly as it is — only the colour rules change.

- [x] **Step 5: Replace the utilities that used the deleted colours**

`src/features/home/project-grid.tsx` styles its cards with them:

```tsx
<Card className="group h-full transition-colors hover:border-signum-blue/40 dark:hover:border-signum-lightblue/40">
  …
  <FolderIcon className="… text-muted-foreground transition-colors group-hover:text-signum-blue dark:group-hover:text-signum-lightblue" />
```

becomes

```tsx
<Card className="group h-full transition-colors hover:border-[var(--accent-2)]">
  …
  <FolderIcon className="… text-muted-foreground transition-colors group-hover:text-[var(--accent-2)]" />
```

The `dark:` twin disappears: one accent per climate, and the climate already
knows whether it is dark.

Then confirm nothing else refers to them:

Run: `cd apps/studio && grep -rn "signum-blue\|signum-lightblue\|signum-green" src styles`
Expected: no output.

- [x] **Step 6: Verify build and suite**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`, and the suite green at its current count.

- [x] **Step 7: Commit**

```bash
git add apps/studio/styles/globals.css apps/studio/src/index.css apps/studio/src/App.tsx
git commit -m "feat(studio): one token layer, four climates"
```

---

## Task 3: The climate picker

**Files:**
- Modify: `apps/studio/src/components/ui/theme-switch.tsx` (full replacement)

`ThemeSwitch` is a sun/moon toggle over two themes. It becomes four dots.

- [x] **Step 1: Replace the component**

```tsx
// apps/studio/src/components/ui/theme-switch.tsx
import { useTheme } from "next-themes";
import { CLIMATES } from "@/theme/climates";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Four climates, four dots, each in its own accent. The active one is ringed.
 *
 * A toggle would have been wrong here: these are not two states of one thing,
 * they are four different rooms.
 */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Colour climate">
      {CLIMATES.map((climate) => {
        const active = theme === climate.id;
        return (
          <Tooltip key={climate.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTheme(climate.id)}
                aria-label={climate.label}
                aria-pressed={active}
                className="flex h-5 w-5 cursor-pointer items-center justify-center border transition-colors"
                style={{
                  borderColor: active ? climate.accent2 : "var(--border-1)",
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: climate.accent2 }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{climate.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
```

- [x] **Step 2: Check it still type-checks and builds**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [x] **Step 3: Commit**

```bash
git add apps/studio/src/components/ui/theme-switch.tsx
git commit -m "feat(studio): pick a climate, not a brightness"
```

---

## Task 4: Monaco themes derived from the climates

**Files:**
- Create: `apps/studio/src/theme/monaco-themes.ts`
- Test: `apps/studio/src/theme/monaco-themes.test.ts`

The return type is declared structurally rather than imported from `monaco-editor`: the app resolves two copies of that package whose types are not mutually assignable (see the comment in `components/ui/editor/file-actions.tsx:13`).

- [x] **Step 1: Write the failing test**

```ts
// apps/studio/src/theme/monaco-themes.test.ts
import { describe, it, expect } from "bun:test";
import { climateById } from "./climates";
import {
  asmThemeName,
  buildAsmTheme,
  buildSmartcTheme,
  smartcThemeName,
} from "./monaco-themes";

const nexus = climateById("nexus")!;
const dawn = climateById("dawn")!;

describe("monaco theme names", () => {
  it("names a theme after its climate", () => {
    expect(smartcThemeName("nexus")).toBe("smartc-nexus");
    expect(asmThemeName("terminal")).toBe("asm-terminal");
  });
});

describe("buildSmartcTheme", () => {
  it("paints the editor ground from the climate, not from Monaco's base", () => {
    expect(buildSmartcTheme(nexus).colors["editor.background"]).toBe("#0a0f1c");
    expect(buildSmartcTheme(dawn).colors["editor.background"]).toBe("#f7f9ff");
  });

  it("inherits from the light base in the light climate", () => {
    expect(buildSmartcTheme(dawn).base).toBe("vs");
    expect(buildSmartcTheme(nexus).base).toBe("vs-dark");
  });

  it("tints the active line with the accent, as eight-digit hex", () => {
    // Monaco takes alpha as two trailing hex digits; 0x1a is the 10% the spec asks for.
    expect(buildSmartcTheme(nexus).colors["editor.lineHighlightBackground"]).toBe("#00aaff1a");
  });

  it("colours keywords and comments from the climate", () => {
    const rules = buildSmartcTheme(nexus).rules;
    expect(rules.find((r) => r.token === "keyword")!.foreground).toBe("#5aa7ff");
    expect(rules.find((r) => r.token === "comment")!.foreground).toBe("#3d4d68");
  });
});

describe("buildAsmTheme", () => {
  it("shares the climate's ground with the SmartC theme", () => {
    expect(buildAsmTheme(nexus).colors["editor.background"]).toBe(
      buildSmartcTheme(nexus).colors["editor.background"],
    );
  });

  it("keeps the assembly token roles the ASM grammar emits", () => {
    const tokens = buildAsmTheme(nexus).rules.map((r) => r.token);
    for (const token of [
      "keyword.control",
      "keyword.stack",
      "keyword.operator",
      "keyword.api",
      "keyword.memory",
      "directive",
      "preprocessor",
      "label",
      "variable.register",
    ]) {
      expect(tokens).toContain(token);
    }
  });
});
```

- [x] **Step 2: Run the test and watch it fail**

Run: `cd apps/studio && bun test src/theme/monaco-themes.test.ts`
Expected: FAIL — `Cannot find module './monaco-themes'`

- [x] **Step 3: Write the implementation**

```ts
// apps/studio/src/theme/monaco-themes.ts
import { CLIMATES, type Climate, type ClimateId } from "./climates";

/**
 * Monaco themes generated from the climates.
 *
 * Seven call sites used to hard-code `theme === "dark" ? "vs-dark" : "light"`,
 * which is where the app visibly stopped and the editor began. Both the SmartC
 * and the assembly theme now come out of the same values as the chrome.
 *
 * The theme shape is declared here rather than imported from `monaco-editor`:
 * the app resolves two copies of that package whose types are not mutually
 * assignable.
 */

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark";
  inherit: boolean;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

/** Minimal structural view of the Monaco namespace — see the note above. */
interface MonacoLike {
  editor: {
    defineTheme(name: string, theme: MonacoThemeData): void;
  };
}

export function smartcThemeName(id: ClimateId): string {
  return `smartc-${id}`;
}

export function asmThemeName(id: ClimateId): string {
  return `asm-${id}`;
}

/** Monaco takes alpha as two trailing hex digits. */
function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}

function groundColours(climate: Climate): Record<string, string> {
  return {
    "editor.background": climate.editor.code,
    "editor.foreground": climate.text,
    "editorLineNumber.foreground": climate.editor.gutter,
    "editorLineNumber.activeForeground": climate.accent2,
    "editor.lineHighlightBackground": withAlpha(climate.accent2, "1a"),
    "editor.selectionBackground": withAlpha(climate.accent1, "40"),
    "editorCursor.foreground": climate.accent2,
    "editorGutter.background": climate.editor.code,
    "editorWidget.background": climate.editor.code,
    "editorWidget.border": climate.accent2,
    "editorHoverWidget.background": climate.editor.code,
    "editorHoverWidget.border": climate.accent2,
    "editorIndentGuide.background1": withAlpha(climate.editor.gutter, "55"),
  };
}

export function buildSmartcTheme(climate: Climate): MonacoThemeData {
  const { editor } = climate;

  return {
    base: climate.base,
    inherit: true,
    rules: [
      { token: "keyword", foreground: editor.keyword, fontStyle: "bold" },
      { token: "type", foreground: editor.type },
      { token: "number", foreground: editor.number },
      { token: "string", foreground: editor.string },
      { token: "comment", foreground: editor.comment, fontStyle: "italic" },
      { token: "identifier", foreground: climate.text },
      { token: "delimiter", foreground: editor.gutter },
      { token: "keyword.directive", foreground: editor.type, fontStyle: "bold" },
      { token: "api", foreground: editor.type, fontStyle: "bold" },
    ],
    colors: groundColours(climate),
  };
}

export function buildAsmTheme(climate: Climate): MonacoThemeData {
  const { editor } = climate;

  return {
    base: climate.base,
    inherit: true,
    rules: [
      { token: "keyword.control", foreground: editor.keyword, fontStyle: "bold" },
      { token: "keyword.stack", foreground: editor.string, fontStyle: "bold" },
      { token: "keyword.operator", foreground: editor.number, fontStyle: "bold" },
      { token: "keyword.api", foreground: editor.type, fontStyle: "bold" },
      { token: "keyword.memory", foreground: editor.type, fontStyle: "bold" },
      { token: "directive", foreground: editor.number, fontStyle: "italic" },
      { token: "preprocessor", foreground: editor.keyword, fontStyle: "bold" },
      { token: "preprocessor.param", foreground: editor.type },
      { token: "preprocessor.value", foreground: editor.comment, fontStyle: "italic" },
      { token: "comment", foreground: editor.comment, fontStyle: "italic" },
      { token: "label", foreground: climate.accent2, fontStyle: "bold" },
      { token: "number", foreground: editor.number },
      { token: "number.hex", foreground: editor.number },
      { token: "api", foreground: editor.type, fontStyle: "bold" },
      { token: "type", foreground: editor.type },
      { token: "variable.register", foreground: editor.string },
      { token: "variable", foreground: climate.text },
      { token: "variable.declaration", foreground: editor.string },
      { token: "constant", foreground: editor.keyword },
      { token: "identifier", foreground: climate.text },
    ],
    colors: groundColours(climate),
  };
}

/** Registers all eight themes. Call once, from a Monaco `beforeMount`. */
export function registerClimateThemes(monaco: MonacoLike): void {
  for (const climate of CLIMATES) {
    monaco.editor.defineTheme(smartcThemeName(climate.id), buildSmartcTheme(climate));
    monaco.editor.defineTheme(asmThemeName(climate.id), buildAsmTheme(climate));
  }
}
```

- [x] **Step 4: Run the test and watch it pass**

Run: `cd apps/studio && bun test src/theme/monaco-themes.test.ts`
Expected: PASS, 7 tests

- [x] **Step 5: Commit**

```bash
git add apps/studio/src/theme/monaco-themes.ts apps/studio/src/theme/monaco-themes.test.ts
git commit -m "feat(studio): monaco themes derived from the climates"
```

---

## Task 5: Every editor takes its theme from the climate

**Files:**
- Create: `apps/studio/src/theme/use-monaco-theme.ts`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx:315`
- Modify: `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx:119`
- Modify: `apps/studio/src/features/simulator/scenario/scenario-editor.tsx:124`
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx:280`
- Modify: `apps/studio/src/features/testbed/ui/value-panel.tsx:124`
- Modify: `apps/studio/src/features/simulator/ui/debug-view.tsx:248`
- Modify: `apps/studio/src/features/simulator/ui/asm-view.tsx:63`
- Modify: `apps/studio/src/features/asm-editor/code-editor/language-definitions/asm-language-definitions.ts` (delete the two hand-written themes)

- [x] **Step 1: Write the hook**

```ts
// apps/studio/src/theme/use-monaco-theme.ts
import { useTheme } from "next-themes";
import { DEFAULT_CLIMATE, climateById } from "./climates";
import { asmThemeName, smartcThemeName } from "./monaco-themes";

/**
 * The Monaco theme for the climate in force.
 *
 * Replaces seven copies of `theme === "dark" ? "vs-dark" : "light"`. `grammar`
 * picks between the two registered families: the assembly editor has its own
 * token roles, everything else shares the SmartC set.
 */
export function useMonacoTheme(grammar: "smartc" | "asm" = "smartc"): string {
  const { theme } = useTheme();
  const climate = climateById(theme ?? "") ?? climateById(DEFAULT_CLIMATE)!;

  return grammar === "asm" ? asmThemeName(climate.id) : smartcThemeName(climate.id);
}
```

- [x] **Step 2: Register the themes where Monaco is first configured**

In `apps/studio/src/features/smartc-editor/language/register.ts`, add to the top-level export used by `beforeMount`:

```ts
import { registerClimateThemes } from "@/theme/monaco-themes";
```

and call `registerClimateThemes(monaco);` as the first statement of `registerSmartC(monaco)`.

Do the same in `registerAsmLanguage(monaco)` in
`apps/studio/src/features/asm-editor/code-editor/language-definitions/asm-language-definitions.ts` —
then **delete** the two `monaco.editor.defineTheme("asm-light", …)` and
`monaco.editor.defineTheme("asm-dark", …)` blocks (original lines 268–400) in the
same file. They are replaced by the generated ones.

For the editors that register no language of their own (`scenario-editor.tsx`,
`test-file-editor.tsx`, `value-panel.tsx`, `debug-view.tsx`), call
`registerClimateThemes(monaco)` in their existing `beforeMount`/`onMount`.
`defineTheme` is idempotent, so registering more than once is harmless.

- [x] **Step 3: Replace the seven hard-coded strings**

In each of these files, delete the `useTheme` import and the `const { theme } = useTheme();` line **if `theme` is used for nothing else**, add `import { useMonacoTheme } from "@/theme/use-monaco-theme";`, and replace the prop:

| File | Old | New |
|---|---|---|
| `smartc-editor.tsx:315` | `theme={theme === "dark" ? "vs-dark" : "light"}` | `theme={monacoTheme}` |
| `scenario-editor.tsx:124` | same | `theme={monacoTheme}` |
| `test-file-editor.tsx:280` | same | `theme={monacoTheme}` |
| `value-panel.tsx:124` | same | `theme={monacoTheme}` |
| `debug-view.tsx:248` | same | `theme={monacoTheme}` |
| `asm-code-editor.tsx:119` | `theme={theme === "dark" ? "asm-dark" : "asm-light"}` | `theme={monacoTheme}` |
| `asm-view.tsx:63` | same | `theme={monacoTheme}` |

with, in the first five files:

```tsx
const monacoTheme = useMonacoTheme();
```

and in the last two:

```tsx
const monacoTheme = useMonacoTheme("asm");
```

- [x] **Step 4: Verify nothing still asks Monaco for a built-in theme**

Run: `cd apps/studio && grep -rn '"vs-dark"\|"asm-dark"\|"asm-light"' src --include='*.tsx' --include='*.ts'`
Expected: matches only inside `src/theme/climates.ts` (the `base` fields) and `src/theme/monaco-themes.ts`.

- [x] **Step 5: Verify build and suite**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`; suite green.

- [x] **Step 6: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): the editor takes its colours from the climate"
```

---

## Task 6: Console buttons and a panel that knows its corners

**Files:**
- Modify: `apps/studio/src/components/ui/button.tsx:11-24`
- Create: `apps/studio/src/components/ui/panel.tsx`

- [x] **Step 1: Add the two console variants**

In `apps/studio/src/components/ui/button.tsx`, add to the `variant` map (after `accent`):

```tsx
        /**
         * The console switch: transparent ground, hairline border, accent text.
         * Hover moves the border and nothing else — no fill, no growth — which
         * is what keeps a dense surface calm.
         */
        console:
          "border border-[var(--border-2)] bg-transparent text-[var(--accent-3)] hover:border-[var(--accent-2)] hover:bg-transparent",
        "console-primary":
          "border border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-1)_18%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--accent-1)_28%,transparent)]",
```

and in the same file remove `rounded-md` from the base string on line 8 and from the `sm`/`lg` size entries (lines 27–28) — `--radius: 0rem` already flattens `rounded-md`, but leaving the class in invites it back the moment someone raises the radius.

- [x] **Step 2: Write the panel primitive**

```tsx
// apps/studio/src/components/ui/panel.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two kinds of surface in Studio.
 *
 * `hairline` is the working surface: a 1px box, nothing else, because the
 * dense views cannot afford decoration. `bracketed` is for home, dialogs and
 * empty states — the places the user arrives at rather than works in. Its
 * corner brackets are the one decorative gesture the language allows, taken
 * from signum-sandbox: 14px, 2px, top-left and bottom-right only.
 */
export function Panel({
  variant = "hairline",
  className,
  children,
}: {
  variant?: "hairline" | "bracketed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative border border-[var(--border-2)]",
        variant === "bracketed" && "bg-[var(--panel)] backdrop-blur-[8px]",
        className,
      )}
    >
      {variant === "bracketed" && (
        <>
          <span className="pointer-events-none absolute -left-px -top-px h-[14px] w-[14px] border-l-2 border-t-2 border-[var(--accent-2)]" />
          <span className="pointer-events-none absolute -bottom-px -right-px h-[14px] w-[14px] border-b-2 border-r-2 border-[var(--accent-2)]" />
        </>
      )}
      {children}
    </div>
  );
}
```

- [x] **Step 3: Verify build**

Run: `cd apps/studio && bun run build`
Expected: `✅ Build completed`

- [x] **Step 4: Commit**

```bash
git add apps/studio/src/components/ui/button.tsx apps/studio/src/components/ui/panel.tsx
git commit -m "feat(studio): console buttons and a bracketed panel"
```

---

## Task 7: The surfaces that hard-code their own look

**Files:**
- Create: `apps/studio/src/components/ui/editor/editor-toolbar.tsx`
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx` (the `<section>` header)
- Modify: `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx` (same)
- Modify: `apps/studio/src/features/simulator/scenario/scenario-editor.tsx` (same)
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx` (same)
- Modify: `apps/studio/src/features/simulator/ui/debug-primitives.tsx`
- Modify: `apps/studio/src/components/ui/page.tsx:105`

- [x] **Step 1: Extract the toolbar the four editors each hard-code**

All four write `w-full flex justify-between items-center pt-1 px-2 h-[30px] bg-muted border-b-1`.

```tsx
// apps/studio/src/components/ui/editor/editor-toolbar.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The strip above every editor: diagnostics on the left, file actions on the
 * right. Four editors declared the same class string; they share it now, which
 * is also the only way the climate reaches all four at once.
 */
export function EditorToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-[30px] w-full shrink-0 items-center justify-between border-b border-[var(--border-1)] bg-[var(--bg2)] px-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs">{children}</div>
      {actions}
    </section>
  );
}
```

- [x] **Step 2: Use it in all four editors**

In each editor, replace the opening `<section className="w-full flex …">` …
`</section>` wrapper with `<EditorToolbar>`, keeping the diagnostics content as
its children. The save handler differs per file — it is the one each editor
already destructures from `useEditorFile`:

| File | `actions` prop |
|---|---|
| `smartc-editor.tsx` | `<EditorFileActions isDirty={isDirty} onSave={saveSmartCFile} onDownload={download} />` |
| `asm-code-editor.tsx` | `<EditorFileActions isDirty={isDirty} onSave={saveAsmFile} onDownload={download} />` |
| `scenario-editor.tsx` | `<EditorFileActions isDirty={isDirty} onSave={saveNow} onDownload={download} onFormat={formatDocument} />` |
| `test-file-editor.tsx` | `<EditorFileActions isDirty={isDirty} onSave={saveNow} onDownload={download} />` |

`test-file-editor.tsx` has no diagnostics in its strip — pass no children.
`asm-code-editor.tsx` keeps its "Change this file only if you know what you are
doing" note as a second child.

- [x] **Step 3: Move the warning and error indicators onto tokens plus a glyph**

In the three editors that show diagnostics, replace `text-red-600` on the
`FileWarning` icon and the message with:

```tsx
<div className="flex items-center gap-1" style={{ color: "var(--mag)" }}>
  <span aria-hidden>●</span>
  <small className="text-xs">{validationError}</small>
</div>
```

and where a warning rather than an error is shown, `var(--amber)` with `▲`.
Colour alone never carries the state.

- [x] **Step 4: Retone the debugger primitives**

In `apps/studio/src/features/simulator/ui/debug-primitives.tsx`, replace the
`Pill` class computation (lines 4–9) with:

```tsx
  const cls =
    tone === "accent"
      ? "border-[var(--accent-2)] text-[var(--accent-3)]"
      : tone === "error"
        ? "border-[var(--mag)] text-[var(--mag)]"
        : "border-[var(--border-1)] text-muted-foreground";
  return <span className={"text-[10px] px-2 py-0.5 border " + cls}>{children}</span>;
```

Note the dropped `rounded-full`: pills are boxes now, like everything else.

- [x] **Step 5: Fix the footer that never worked in the dark**

In `apps/studio/src/components/ui/page.tsx:105`, replace
`"p-4 bg-white border-t border-gray-200"` with
`"p-4 bg-[var(--bg2)] border-t border-[var(--border-1)]"`.

- [x] **Step 6: Sweep the remaining status literals**

Run: `cd apps/studio && grep -rn "text-red-600\|text-green-600\|bg-red-600\|text-yellow-\|bg-green-" src --include='*.tsx'`

Replace each hit by its token: red → `var(--mag)`, green → `var(--green)`,
yellow/amber → `var(--amber)`. Re-run the grep until it returns nothing.

Leave neutral greys (`text-zinc-*`, `text-slate-*`) alone for now — they read as
muted text and are the layout phase's problem, not the language's.

- [x] **Step 7: Verify build and suite**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`; suite green.

- [x] **Step 8: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): one toolbar, and status by token and glyph"
```

---

## Task 8: Motion

**Files:**
- Create: `apps/studio/src/motion/tokens.ts`, `tokens.test.ts`
- Create: `apps/studio/src/motion/resolve.ts`, `resolve.test.ts`
- Create: `apps/studio/src/motion/motion.css`
- Create: `apps/studio/src/motion/use-motion.ts`
- Modify: `apps/studio/src/index.css` (import `motion.css`)
- Modify: `apps/studio/src/App.tsx` (publish the tokens once)

- [x] **Step 1: Write the failing test for the tokens**

```ts
// apps/studio/src/motion/tokens.test.ts
import { describe, it, expect } from "bun:test";
import { DURATIONS, motionCssVariables } from "./tokens";

describe("motionCssVariables", () => {
  it("publishes every duration in milliseconds", () => {
    const vars = motionCssVariables();
    expect(vars["--motion-instant"]).toBe("120ms");
    expect(vars["--motion-quick"]).toBe("200ms");
    expect(vars["--motion-base"]).toBe("350ms");
    expect(vars["--motion-calm"]).toBe("550ms");
  });

  it("publishes the easings CSS can use verbatim, under kebab-case names", () => {
    const vars = motionCssVariables();
    expect(vars["--ease-out"]).toBe("cubic-bezier(.22, 1, .36, 1)");
    // The key is `inOut`; the custom property CSS reads is `--ease-in-out`.
    expect(vars["--ease-in-out"]).toBe("cubic-bezier(.4, 0, .2, 1)");
  });

  it("publishes one variable per declared duration, so the two never drift", () => {
    const vars = motionCssVariables();
    for (const name of Object.keys(DURATIONS)) {
      expect(vars[`--motion-${name}`]).toBeDefined();
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `cd apps/studio && bun test src/motion/tokens.test.ts`
Expected: FAIL — `Cannot find module './tokens'`

- [x] **Step 3: Write the tokens**

```ts
// apps/studio/src/motion/tokens.ts

/**
 * The motion vocabulary: small enough to remember, declared once.
 *
 * The numbers live here and are published to CSS as custom properties, so the
 * stylesheet and any TypeScript that animates imperatively read the same value.
 * Taken from signum-sandbox, minus its 90-second ambient drift: Studio has no
 * permanent movement.
 */

export const DURATIONS = {
  instant: 120, // icon swap, tab content crossfade
  quick: 200, // hover, press, colour change, value flash
  base: 350, // panel opens, row unfolds
  calm: 550, // a row arrives and its tint decays
} as const;

export const EASINGS = {
  out: "cubic-bezier(.22, 1, .36, 1)",
  inOut: "cubic-bezier(.4, 0, .2, 1)",
} as const;

/** Overshooting curves, standing in for the sandbox's three springs. */
export const SPRINGS = {
  snap: "cubic-bezier(.34, 1.56, .64, 1)",
  lift: "cubic-bezier(.22, 1.2, .36, 1)",
  panel: "cubic-bezier(.16, 1.1, .3, 1)",
} as const;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function motionCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [name, ms] of Object.entries(DURATIONS)) {
    vars[`--motion-${name}`] = `${ms}ms`;
  }
  // camelCase keys, kebab-case custom properties: `inOut` → `--ease-in-out`.
  for (const [name, curve] of Object.entries(EASINGS)) {
    vars[`--ease-${kebab(name)}`] = curve;
  }
  for (const [name, curve] of Object.entries(SPRINGS)) {
    vars[`--spring-${name}`] = curve;
  }

  return vars;
}

/** Call once, at startup, with `document.documentElement`. */
export function publishMotionTokens(root: HTMLElement): void {
  for (const [name, value] of Object.entries(motionCssVariables())) {
    root.style.setProperty(name, value);
  }
}
```

- [x] **Step 4: Run it and watch it pass**

Run: `cd apps/studio && bun test src/motion/tokens.test.ts`
Expected: PASS, 3 tests

- [x] **Step 5: Write the failing test for the preference**

```ts
// apps/studio/src/motion/resolve.test.ts
import { describe, it, expect } from "bun:test";
import { resolveMotion } from "./resolve";

describe("resolveMotion", () => {
  it("follows the system when nothing has been chosen", () => {
    expect(resolveMotion(null, true)).toBe("off");
    expect(resolveMotion(null, false)).toBe("on");
  });

  it("lets an explicit choice override the system — in both directions", () => {
    expect(resolveMotion("on", true)).toBe("on");
    expect(resolveMotion("off", false)).toBe("off");
  });
});
```

- [x] **Step 6: Run it and watch it fail**

Run: `cd apps/studio && bun test src/motion/resolve.test.ts`
Expected: FAIL — `Cannot find module './resolve'`

- [x] **Step 7: Write it**

```ts
// apps/studio/src/motion/resolve.ts

/** What the user chose, or null if they never said. */
export type MotionChoice = "on" | "off" | null;

/**
 * Someone who turned motion on did so knowing what their system says. The
 * override therefore works in both directions, not just towards less.
 */
export function resolveMotion(chosen: MotionChoice, prefersReduced: boolean): "on" | "off" {
  if (chosen !== null) return chosen;
  return prefersReduced ? "off" : "on";
}
```

- [x] **Step 8: Run it and watch it pass**

Run: `cd apps/studio && bun test src/motion/resolve.test.ts`
Expected: PASS, 2 tests

- [x] **Step 9: Write the switch**

```ts
// apps/studio/src/motion/use-motion.ts
import { useEffect, useState } from "react";
import { publishMotionTokens } from "./tokens";
import { resolveMotion, type MotionChoice } from "./resolve";

const STORAGE_KEY = "studio:motion";

function storedChoice(): MotionChoice {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "on" || raw === "off" ? raw : null;
}

/**
 * Publishes the motion tokens and sets `data-motion` on <html>. Mount once,
 * from the app root.
 */
export function useMotion() {
  const [choice, setChoice] = useState<MotionChoice>(() =>
    typeof localStorage === "undefined" ? null : storedChoice(),
  );

  useEffect(() => {
    publishMotionTokens(document.documentElement);
  }, []);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.dataset.motion = resolveMotion(choice, prefersReduced);
  }, [choice]);

  return {
    choose(next: MotionChoice) {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
      setChoice(next);
    },
  };
}
```

Call `useMotion();` once in `App.tsx`, inside the `App` component body.

- [x] **Step 10: Write the keyframes**

```css
/* apps/studio/src/motion/motion.css */

/*
 * Every animation here is bound to an event. Nothing runs on its own, and no
 * information lives only in the movement — turning motion off costs motion
 * and nothing else.
 */

[data-motion="off"] *,
[data-motion="off"] *::before,
[data-motion="off"] *::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}

/* A value changed. Never on first render — the caller decides that. */
@keyframes motion-flash {
  from { color: var(--green); }
  to { color: inherit; }
}
.motion-flash {
  animation: motion-flash var(--motion-quick) var(--ease-out);
}

/*
 * A row arrived: it unfolds, and its tint decays.
 *
 * `height: auto` does not interpolate, so the row is a one-cell grid and the
 * track animates from 0fr to 1fr instead — the trick signum-sandbox uses.
 */
@keyframes motion-arrive {
  from {
    grid-template-rows: 0fr;
    background: color-mix(in srgb, var(--green) 18%, transparent);
  }
  to {
    grid-template-rows: 1fr;
    background: transparent;
  }
}
.motion-arrive {
  display: grid;
  grid-template-rows: 1fr;
  animation: motion-arrive var(--motion-calm) var(--ease-out);
}
.motion-arrive > * {
  min-height: 0;
  overflow: hidden;
}

/* Something long-running is under way, and will stop on its own. */
@keyframes motion-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
.motion-pulse {
  animation: motion-pulse 1.5s var(--ease-in-out) infinite;
}

/* An error. Two pixels, once. Not a tantrum. */
@keyframes motion-nudge {
  0%, 100% { transform: translateX(0); }
  33% { transform: translateX(-2px); }
  66% { transform: translateX(2px); }
}
.motion-nudge {
  animation: motion-nudge var(--motion-quick) var(--ease-in-out);
}

/* A panel, dialog or dropdown settling into place. */
@keyframes motion-enter {
  from { opacity: 0; transform: translateY(-6px) scale(.97); }
  to { opacity: 1; transform: none; }
}
.motion-enter {
  animation: motion-enter var(--motion-base) var(--spring-panel);
}

/* Controls answer, but they answer quietly: the border moves, not the fill. */
.motion-control {
  transition:
    border-color var(--motion-quick) var(--ease-out),
    color var(--motion-quick) var(--ease-out);
}
.motion-control:active {
  transform: scale(.97);
  transition: transform var(--motion-instant) var(--spring-snap);
}
```

Add `@import "./motion/motion.css";` to the top of `apps/studio/src/index.css`,
directly after the existing `@import "../styles/globals.css";`.

- [x] **Step 11: Wire the catalogue to the three places that already know when something happened**

1. `src/features/simulator/ui/inspector-panel.tsx` — when a variable's rendered
   string differs from the previous render, add `motion-flash` to that row for
   one render. Keep a `useRef<Map<string, string>>` of the last values; a key
   absent from the map is a first sighting and must **not** flash.
2. `src/features/testbed/ui/test-results-panel.tsx` — rows appended since the
   last render get `motion-arrive`, capped at the newest 8.
3. `src/components/ui/editor/editor-toolbar.tsx` — the running indicator gets
   `motion-pulse` while a compile or test run is in flight.

- [x] **Step 12: Verify build and suite**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`; suite green, with 5 new tests.

- [x] **Step 13: Commit**

```bash
git add apps/studio/src/motion apps/studio/src/index.css apps/studio/src/App.tsx apps/studio/src/features apps/studio/src/components
git commit -m "feat(studio): a motion vocabulary bound to events"
```

---

## Task 9: Home and the empty states, turned up

**Files:**
- Create: `apps/studio/src/components/ui/grid-backdrop.tsx`
- Modify: `apps/studio/src/components/ui/layout/left-sidebar.tsx` (the wordmark)
- Modify: `apps/studio/src/features/home/hero.tsx`
- Modify: `apps/studio/src/features/home/project-grid.tsx`
- Modify: `apps/studio/src/features/home/how-it-works.tsx`

The dosage the spec sets: these are the surfaces people arrive at rather than
work in, and they get the gestures the working surface is denied.

- [x] **Step 1: Write the backdrop**

```tsx
// apps/studio/src/components/ui/grid-backdrop.tsx

/**
 * The 40px grid, at 4–6% alpha depending on the climate.
 *
 * Static. signum-sandbox drifts it over 90 seconds; Studio does not, because
 * permanent movement behind text someone reads for hours is the one thing the
 * language rules out.
 */
export function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage:
          "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
  );
}
```

- [x] **Step 2: Put the wordmark in the sidebar**

In `left-sidebar.tsx`, immediately inside `<SidebarContent>` and before the
first `<SidebarGroup>`, add:

```tsx
<div className="flex items-center gap-2 border-b border-[var(--border-1)] px-3 py-3">
  <span
    aria-hidden
    className="h-3 w-3 rotate-45 border-[1.5px] border-[var(--accent-2)]"
  />
  <span
    className="text-[12px] font-black tracking-[3px] text-[var(--text)]"
    style={{ fontFamily: "Orbitron, sans-serif" }}
  >
    STUDIO
  </span>
</div>
```

This is the **only** place Orbitron is used. Keeping it to one element is what
makes it a wordmark rather than a costume.

- [x] **Step 3: Give the hero its backdrop**

`hero.tsx:87` already opens `<section className="relative isolate overflow-hidden px-6 py-16 sm:py-24">`,
which is exactly the positioning context needed. Add `<GridBackdrop />` as its
first child.

- [x] **Step 4: Bracket the cards that sit on those surfaces**

In `project-grid.tsx` and `how-it-works.tsx`, replace shadcn's `<Card>`/`<CardContent>`
with the bracketed panel:

```tsx
<Panel variant="bracketed" className="group h-full transition-colors hover:border-[var(--accent-2)]">
  <div className="flex h-full flex-col gap-3 p-4">
    {/* the existing card body, unchanged */}
  </div>
</Panel>
```

Remove the now-unused `Card`/`CardContent` imports from both files. Leave the
`Card` component itself in place — dialogs and the learn rail still use it.

- [x] **Step 5: Verify build and suite**

Run: `cd apps/studio && bun run build && bun test`
Expected: `✅ Build completed`; suite green.

- [x] **Step 6: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): grid, brackets and a wordmark where people arrive"
```

---


---

## Deviations from the plan, as built

- **`src/components/theme-switch.tsx`**, not `components/ui/theme-switch.tsx`.
- **The font `@import` must precede `@import "tailwindcss"`.** Tailwind expands
  in place, so a font import after it lands thousands of rules deep and CSS
  rejects it.
- **Sonner needed a translation.** It knows only `light` and `dark`; it now
  reads the climate's Monaco base. Without this it received `"nexus"`.
- **Arrivals went to the emitted-transaction list, not the test rows.** Test
  rows are planned up front and change status rather than appear, so there is
  no arrival to announce. Emitted transactions genuinely grow.
- **No `GridBackdrop` component.** The hero already drew a grid; it was
  normalised to 40px and `--grid-line` instead. A second implementation would
  have had no caller.
- **The literal sweep was wider than Task 7 assumed** — `signum-*` utilities in
  five home files, `blue-500` accents across nine files, and greys that vanish
  in three of the four climates.


## Task 10: Verification in the browser

**Done — the owner ran this pass on 2026-09-18 and approved the result.** The
steps below stayed as written rather than being ticked one by one; they remain
the checklist for the next time the language is touched.

There is no DOM test environment in this repo, so this task is manual and
mandatory. Run `cd apps/studio && bun dev` and check each line, reporting what
actually happened:

- [ ] **Step 1: All four climates, on every surface**

Switch through Nexus, Dawn, Solaris, Terminal and confirm on each: the sidebar,
the home page, a SmartC file, a scenario file, a test file, the ASM editor, the
debugger with its inspector, and one dialog. Nothing keeps a colour from the
previous climate; nothing is unreadable.

- [ ] **Step 2: Monaco belongs to the app**

In every climate the code ground, gutter, active line and cursor match the
chrome. The ASM editor's own token colours follow too. No editor shows Monaco's
default blue selection.

- [ ] **Step 3: The three dark climates still carry `dark:` utilities**

Anything styled with a `dark:` utility (dropdowns, inputs, the sidebar) looks
right in Nexus, Solaris and Terminal, and switches to its light form in Dawn.
This is the redefined `@custom-variant`; if it is wrong, it will be obvious here.

- [ ] **Step 4: Radius**

Nothing is rounded except status LEDs, climate dots and the scrollbar.

- [ ] **Step 5: Hover and press**

Hovering a console button moves its border and nothing else — no fill, no
growth. Pressing dips it slightly.

- [ ] **Step 6: The event animations**

Step the debugger and watch a variable change: the value flashes green once,
and does **not** flash when the panel first opens. Run a test file: rows arrive
with a decaying tint, and a long run pulses. Provoke a compile error: two
pixels, once.

- [ ] **Step 7: Reduced motion**

With the OS set to reduce motion, everything still works and nothing moves.
Turning motion explicitly on in the app overrides that.

- [ ] **Step 8: The popout still follows**

Open the debug dashboard in its own tab and switch climate in the main window.
It follows, as it did for dark/light.

- [ ] **Step 9: The arrival surfaces**

The home page shows the grid behind the hero, its cards carry corner brackets
top-left and bottom-right, and the sidebar wordmark is in Orbitron — and
Orbitron appears nowhere else.

- [ ] **Step 10: Commit any fixes found**

```bash
git add apps/studio/src
git commit -m "fix(studio): browser pass on the design language"
```

---

## Done criteria

- Four climates switchable, persisted, covering every surface
- Monaco derives all colours from the same tokens as the chrome; no `vs-dark` left outside `src/theme/`
- `--radius: 0rem`; no rounded corners outside LEDs, dots and scrollbar
- No status colour expressed as a Tailwind palette literal
- Motion is event-bound, capped, and fully disabled by `data-motion="off"`
- `bun test` green, `bun run build` succeeds, browser pass done

## What comes next

The layout phase: the `calc(100vh − containerTop)` height measuring in four
editors and the `PageContent` flex contract, file tabs, and panel arrangement.
