# Signum Smart Contract Studio

## Development

> This project was created using `bun init` in bun v1.2.9. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## Languages

Studio speaks English, Deutsch, Português (Brasil), Français, Español, Italiano,
Українська, Русский and 简体中文. The language is chosen in the sidebar footer;
switching reloads the page.

Studio's text lives in `src/i18n/locales/<locale>/<namespace>.json`; English is
the source and the fallback. Code calls `t("namespace.key")`, or `<T>` for
sentences with elements in them. Terms follow `src/i18n/GLOSSARY.md`.

**Changing English UI text:** edit `locales/en/*.json`, then `bun run i18n:types`.

**Changing editor documentation:** its English lives next to the signatures in
`features/*/language-definitions/`; after editing it, run `bun run i18n:docs` to
regenerate `locales/en/editor-docs.json`. Other locales translate that file.

**Adding a language:**
1. Copy `src/i18n/locales/en` to `src/i18n/locales/<id>` and translate the JSON
   files. Keep every key, `{placeholder}`, `<tag>` and `` `code` `` as it is.
2. `bun test src/i18n` — fails on broken placeholders, tags or code spans.
3. `bun run i18n:report` — shows how complete each language is;
   `bun run i18n:report --missing <id>` lists what is left.
4. Add `{ id, nativeLabel, load: () => import("./locales/<id>") }` to
   `LOCALES` in `src/i18n/locales.ts`.

**Finding untranslated text:** `bun run i18n:scan src`.

Compiler, assembler and test-runner messages are not translated.

## ShadCN components


This project uses [ShadCDN](https://ui.shadcn.com/) as component "library." If needed you should use

```bash
bunx --bun shadcn@latest add <component-name>
```

to install base components to the project.

