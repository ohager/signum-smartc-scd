# SmartC Studio — Design Language

Status: approved 2026-09-18
Phase: design language only. Layout is a separate, later phase.

## Goal

Studio currently looks like what it is: a stock shadcn/zinc theme with Monaco
dropped into the middle of it. It has no handwriting of its own and no
relationship to the rest of the Signum world. This spec replaces its visual
language — colour, form, type, motion — with one derived from `signum-sandbox`,
so that a developer who has seen one Signum tool recognises the other.

It does **not** move anything. Panel arrangement, file tabs, where the debugger
sits, how much room the inspector gets: all of that is the layout phase. Here we
swap colour, edge, typeface and timing at the places that hard-code them today.

## Verified ground truth

Read out of the current codebase, not assumed:

- Colour comes from three competing sources: shadcn's zinc palette in
  `apps/studio/styles/globals.css`, three Signum colours in
  `apps/studio/src/index.css`, and hard literals scattered through components
  (`text-red-600`, `text-green-600`, `rgb(34 197 94)`, `#5aa0ff`, `#e5484d`).
- **Seven** call sites hard-code `theme === "dark" ? "vs-dark" : "light"`:
  `smartc-editor.tsx:315`, `asm-code-editor.tsx:119`, `scenario-editor.tsx:124`,
  `test-file-editor.tsx:280`, `value-panel.tsx:124`, `debug-view.tsx:248`,
  `asm-view.tsx:63`. Two further themes (`asm-light`, `asm-dark`) are defined by
  hand in `asm-editor/code-editor/language-definitions/asm-language-definitions.ts:269,336`.
  This is the seam where the app stops and the editor begins.
- `next-themes` is already the provider, hoisted to `App.tsx` so the debug
  popout tab follows it. `ThemeSwitch` is a sun/moon toggle over `light`/`dark`.
- shadcn is configured in `components.json` as style `new-york`, base colour
  `zinc`, **`cssVariables: true`** — so its semantic variables can be re-pointed
  without touching a single component.
- Each editor's header hard-codes `w-full flex justify-between items-center pt-1
  px-2 h-[30px] bg-muted border-b-1`, four times over.
- `PageFooter` (`components/ui/page.tsx:105`) hard-codes `bg-white
  border-gray-200`, which breaks in the dark.

And from `signum-sandbox` (vendored out of `signum-node/web`, see its
`src/VENDORED.md`):

- Five themes as pure CSS-variable blocks in `src/index.css`, switched by
  `document.documentElement.dataset.theme`, persisted in localStorage.
- Radius 0 throughout; five radius declarations in the entire `src`, all of them
  round dots or the scrollbar.
- One decorative gesture: 14×14px, 2px corner brackets in the accent colour, at
  top-left and bottom-right only.
- A motion vocabulary of five durations, two beziers and three springs, declared
  once in `src/motion/tokens.ts` and pushed to CSS as custom properties.
- Its own design spec (`2026-09-14-animations-design.md`) already rules out
  scanlines, breathing glow and particles: *"they are states that mean nothing
  and they fight the legibility of text, which is the actual content."*

## Decisions

1. **Four climates, not light/dark.** Nexus, Dawn, Solaris, Terminal. Aurora is
   dropped — it is the furthest from Signum's colours and every climate costs a
   Monaco theme to maintain.
2. **Retheme shadcn, do not replace it.** Its semantic variables become aliases
   of the climate tokens. Only what the theme cannot reach gets written by hand:
   two button variants and a `Panel` primitive.
3. **Accent slots are named by role, not colour.** `--accent-1/2/3`, not the
   sandbox's `--blue/--blue2/--blue3`, which are orange in Solaris and would
   have been actively misleading here.
4. **Monaco is part of the theme.** Editor ground, gutter, active line, selection
   and syntax colours derive from the same tokens as the chrome.
5. **CSS only, no animation library.** The vocabulary lives in TypeScript and is
   published to CSS as custom properties — one number, two engines — but every
   animation is a `transition` or a `@keyframes`.
6. **No audio.** An IDE runs next to music and calls; the annoyance outweighs the
   character.
7. **No permanent motion, and no information that lives only in motion.** The
   grid backdrop is static in Studio. Turning motion off costs motion and
   nothing else.
8. **State is never carried by colour alone.** Warnings and errors always carry a
   glyph as well.

## The token layer

`styles/globals.css` is rewritten as four `[data-theme="…"]` blocks. Each
declares the Signum slots and then points shadcn's own variables at them:

```css
[data-theme="nexus"] {
  --bg: #050810;  --bg2: #080d1a;  --panel: rgba(8, 16, 40, .85);
  --border-1: rgba(0, 102, 255, .18);  --border-2: rgba(0, 170, 255, .30);
  --accent-1: #0066ff;  --accent-2: #00aaff;  --accent-3: #60c8ff;
  --green: #00ffaa;  --mag: #ff0055;  --amber: #ff9500;  --gold: #ffd700;
  --text: #d0e4ff;  --muted: #5a7090;
  --grid-line: rgba(0, 102, 255, .04);
  --card-hover: 0 8px 32px rgba(0, 102, 255, .18);

  /* shadcn keeps speaking its own language; it just points at ours. */
  --background: var(--bg);        --foreground: var(--text);
  --card: var(--panel);           --popover: var(--bg2);
  --primary: var(--accent-1);     --muted-foreground: var(--muted);
  --accent: var(--accent-2);      --destructive: var(--mag);
  --border: var(--border-1);      --input: var(--border-2);
  --ring: var(--accent-2);        --radius: 0rem;
}
```

Values per climate:

| Slot | Nexus | Dawn | Solaris | Terminal |
|---|---|---|---|---|
| `--bg` | `#050810` | `#eef2fb` | `#0d0906` | `#000a00` |
| `--bg2` | `#080d1a` | `#e2e8f8` | `#1a1204` | `#001400` |
| `--panel` | `rgba(8,16,40,.85)` | `rgba(255,255,255,.94)` | `rgba(36,20,4,.88)` | `rgba(0,20,0,.90)` |
| `--border-1` | `rgba(0,102,255,.18)` | `rgba(0,102,255,.14)` | `rgba(255,149,0,.20)` | `rgba(0,255,0,.16)` |
| `--border-2` | `rgba(0,170,255,.30)` | `rgba(0,102,255,.26)` | `rgba(255,200,0,.32)` | `rgba(0,255,0,.32)` |
| `--accent-1` | `#0066ff` | `#0055cc` | `#ff9500` | `#00cc00` |
| `--accent-2` | `#00aaff` | `#0066ff` | `#ffd700` | `#00ff00` |
| `--accent-3` | `#60c8ff` | `#3388ff` | `#ffe566` | `#66ff66` |
| `--green` | `#00ffaa` | `#00956b` | `#39d353` | `#00ff00` |
| `--mag` | `#ff0055` | `#cc0044` | `#ff3d6b` | `#ff3300` |
| `--amber` | `#ff9500` | `#c06000` | **`#ff7a00`** | `#ff8800` |
| `--text` | `#d0e4ff` | `#1a2540` | `#ffe8c0` | `#90ee90` |
| `--muted` | `#5a7090` | `#6678a0` | `#9a7040` | `#3a7a3a` |
| `--grid-line` | `rgba(0,102,255,.04)` | `rgba(0,102,255,.06)` | `rgba(255,149,0,.05)` | `rgba(0,255,0,.05)` |

Two deliberate departures from the sandbox's values:

- **Solaris's warning colour.** There, `--blue` (accent) and `--amber` (warning)
  are both `#ff9500` — the same value. A compiler warning and a primary button
  cannot be the same colour in an editor, so Solaris gets `#ff7a00`, clearly
  oranger than its gold accent. The glyph rule (below) covers the rest.
- **Dawn translates glow to shadow.** Every `0 0 Npx` glow becomes
  `0 2px 12px`. This is the sandbox's own trick and it is what keeps a neon
  system legible in daylight; it is carried over verbatim.

Switching stays with `next-themes`, reconfigured:

```tsx
<ThemeProvider
  attribute="data-theme"
  themes={["nexus", "dawn", "solaris", "terminal"]}
  defaultTheme="nexus"
  enableSystem={false}
>
```

`enableSystem` stays off: four climates do not map onto a binary OS preference,
and the choice is aesthetic rather than ambient. `ThemeSwitch` becomes a climate
picker — four dots in the climates' own accent colours, the active one ringed.

`src/index.css`'s three loose `--color-signum-*` entries and its hard-coded
`rgb()` literals for the test glyphs, inline values and the debug current line
are replaced by token references.

## Monaco

`src/theme/monaco-themes.ts` derives one `monaco.editor.defineTheme` definition
per climate from the same values, mapping at minimum:

| Monaco key | Token |
|---|---|
| `editor.background` | `--code` (below) |
| `editor.foreground` | `--text` |
| `editorLineNumber.foreground` | `--gutter` (below) |
| `editor.lineHighlightBackground` | `--accent-2` at 10 % |
| `editor.selectionBackground` | `--accent-1` at 25 % |
| `editorCursor.foreground` | `--accent-2` |
| keyword / type / number / comment | the syntax set below |

Two further slots per climate, and the syntax set. These are the values from the
approved mockups, not placeholders:

| Slot | Nexus | Dawn | Solaris | Terminal |
|---|---|---|---|---|
| `--code` (editor ground) | `#0a0f1c` | `#f7f9ff` | `#120c05` | `#001200` |
| `--gutter` | `#2e3c55` | `#a8b6d4` | `#5c4520` | `#2a5a2a` |
| keyword | `#5aa7ff` | `#0b3d91` | `#ffb84d` | `#66ff66` |
| type | `#60c8ff` | `#0055cc` | `#ffe566` | `#00cc00` |
| number / literal | `#ffd700` | `#b87000` | `#39d353` | `#ffcc00` |
| comment | `#3d4d68` | `#94a3b8` | `#5c4520` | `#2a5a2a` |
| string | `--green` | `--green` | `--green` | `--green` |

`useMonacoTheme()` returns the right name for the active climate and replaces all
seven `theme === "dark" ? …` expressions. The two hand-written ASM themes are
generated from the same source instead of maintained separately — the ASM editor
then reads `useMonacoTheme("asm")`.

The code ground is deliberately *not* `--bg`: the working surface reads better
when the code sits a step apart from the chrome around it (this is the "Werkbank"
option chosen over "Konsole" during the brainstorm).

## Form

- **Radius 0.** Exceptions are round by nature: status LEDs, climate dots,
  scrollbar thumb (3px).
- **1px hairlines.** 2px appears exactly twice: corner brackets, and the left
  edge of an expanded detail row.
- **Three border alphas as the state axis.** Resting `--border-1` (~18 %),
  container `--border-2` (~30 %), active/focused full `--accent-2`. **Hover
  changes the border colour only** — no background, no size. This replaces
  shadcn's `hover:bg-accent` in the console variants.
- **Type.** Exo 2 for body, JetBrains Mono for anything data-shaped (file names,
  addresses, values, registers, code), Orbitron for the wordmark and nothing
  else. Base 14px/1.6; the working scale is 12–13px with 11px labels. Tracking
  runs inverse to size: 1px, 2px, 3px. Terminal switches the whole surface to
  JetBrains Mono.
- **Two kinds of panel.** A bare hairline box for the dense working surface, and
  a `Panel` primitive with 14×14px corner brackets and `backdrop-blur(8px)` for
  home, dialogs and empty states.
- **Buttons.** Two new variants in the existing `button.tsx`: `console`
  (transparent, 1px `--border-2`, `--accent-3` text) and `console-primary`
  (`--accent-2` border, tinted ground). The four editor headers that hard-code
  `bg-muted border-b-1` use them.
- **Spacing** stays on Tailwind's 4px base, in practice 8 / 12 / 24px.
- **Status is glyph plus colour, never colour alone:** ▲ warning, ● error,
  ✓ success.

## Motion

`src/motion/tokens.ts` declares the vocabulary and writes it to
`document.documentElement` as custom properties, so CSS and TypeScript can never
drift apart:

```ts
export const DURATIONS = { instant: 120, quick: 200, base: 350, calm: 550 };
export const EASINGS = {
  out:   "cubic-bezier(.22, 1, .36, 1)",
  inOut: "cubic-bezier(.4, 0, .2, 1)",
};
```

The sandbox's three springs become three overshooting beziers, published
alongside the rest:

```ts
export const SPRINGS = {
  snap:  "cubic-bezier(.34, 1.56, .64, 1)",   // a control answering a press
  lift:  "cubic-bezier(.22, 1.2, .36, 1)",    // a card rising under the pointer
  panel: "cubic-bezier(.16, 1.1, .3, 1)",     // a panel or overlay settling
};
```

The catalogue. Every entry is bound to an event; nothing runs on its own:

| Occasion | Movement |
|---|---|
| Hover a control | `border-color` → accent, `quick` |
| Press | `scale(.97)`, `instant` |
| Panel, dialog, dropdown opens | `opacity 0→1`, `y −6→0`, `scale .97→1`, `base` |
| Inspector tab changes | content crossfade `instant`, marker slides `base` |
| A value changes (Variables, Ledger, test counts) | brief green flash, `quick` — **only on a real change, never on first render** |
| A row arrives (Emitted Txs, test results) | `grid-template-rows: 0fr→1fr` plus a decaying green tint, `calm`, **capped at 8 rows** |
| Tests or compile running | calm pulse `opacity .4↔.8`, 1.5s, ends with the run |
| Error | `x: 0, −2, 2, 0` — two pixels, once |
| Breakpoint hit / step | line highlight follows with `quick`, no flash |

`data-motion="on"|"off"` on `<html>` gates all of it. It is seeded from
`prefers-reduced-motion` and overridable by an explicit choice **in both
directions**. Off means transitions collapse to `0ms`; nothing disappears.

## Where the character is allowed

| Surface | Treatment |
|---|---|
| Sidebar, headers, panels, dialogs, tabs | full handwriting |
| Code surface | quiet. Climate-derived Monaco theme, and only these accents: breakpoint dot, test play triangle, gutter in `--muted`, active debug line with a 2px accent edge, inline values in dimmed italic, and **hover tooltips styled as bracketed panels** — the one place inside the editor that looks like the console |
| State changes | the catalogue above |
| Home, empty workspace, onboarding, error pages | turned up: grid backdrop, bracketed panels, Orbitron wordmark |

## File structure

```
apps/studio/
  styles/globals.css                    ← rewritten: four [data-theme] blocks
  src/index.css                         ← literals replaced by token references
  src/theme/
    climates.ts                         ← the four climates as data (names, labels, dots)
    monaco-themes.ts                    ← defineTheme per climate, incl. ASM
    use-monaco-theme.ts                 ← replaces seven hard-coded strings
  src/motion/
    tokens.ts                           ← durations, easings, publish to CSS
    motion.css                          ← keyframes: flash, arrive, pulse, nudge
    use-motion.ts                       ← data-motion switch + preference resolution
  src/components/ui/
    button.tsx                          ← + console, console-primary variants
    panel.tsx                           ← new: hairline box / bracketed variant
    theme-switch.tsx                    ← becomes the climate picker
```

## Order of work

Four cuts, each independently shippable:

1. **Token layer.** After this the whole app is in the new climate without a
   single component having been touched.
2. **Monaco.** The editor stops being a foreign body.
3. **Form.** Button variants, `Panel`, the four editor headers, the debugger and
   testbed panels, the literals in `index.css`, and `PageFooter`'s hard-coded
   white.
4. **Motion.** Tokens, catalogue, switch.

## Testing

Pure logic gets `bun test`: climate data, the token→Monaco-theme derivation, and
the motion preference resolution (explicit choice beats OS in both directions).
There is no DOM test environment in this repo, so the visual result is verified
in the browser, per the convention in the existing plans: all four climates on
every surface, `prefers-reduced-motion` honoured, and the debug popout tab
following the climate.

## Out of scope

File tabs, panel arrangement, the `calc(100vh − containerTop)` height
measuring and the `PageContent` flex contract — all layout, all a later phase.
Also out: audio, the Aurora climate, the drifting grid, glow on text or large
areas, scanlines, grain, gradient borders.
