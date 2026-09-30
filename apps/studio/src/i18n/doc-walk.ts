import { ownTranslation, type Messages } from "./runtime";

/**
 * Editor documentation keeps its English in code, next to the signatures,
 * include tables and register semantics it describes. Its translations live in
 * `locales/<id>/editor-docs.json`, keyed `<section>.<symbol>.<field>`, and are
 * laid over the English tables here. `en/editor-docs.json` is generated from
 * the same tables (`bun run i18n:docs`), so translators work from one file.
 */

/** Prose fields; everything else (signatures, snippets, numbers) is code. */
const TEXT_FIELDS = ["title", "group", "detail", "documentation"] as const;

type Visit = (key: string, english: string) => string;

function walkEntry(prefix: string, entry: any, visit: Visit): any {
  if (typeof entry !== "object" || entry === null) return entry;
  const out: any = { ...entry };
  for (const field of TEXT_FIELDS) {
    if (typeof entry[field] === "string" && entry[field] !== "") {
      out[field] = visit(`${prefix}.${field}`, entry[field]);
    }
  }
  if (Array.isArray(entry.params)) {
    out.params = entry.params.map((p: any) =>
      typeof p?.documentation === "string" && p.documentation !== ""
        ? { ...p, documentation: visit(`${prefix}.params.${p.name}`, p.documentation) }
        : p,
    );
  }
  if (entry.properties && typeof entry.properties === "object") {
    out.properties = walkTable(`${prefix}.properties`, entry.properties, visit);
  }
  return out;
}

function walkTable<T extends Record<string, any>>(prefix: string, table: T, visit: Visit): T {
  const out: Record<string, any> = {};
  for (const [symbol, entry] of Object.entries(table)) {
    out[symbol] = walkEntry(`${prefix}.${symbol}`, entry, visit);
  }
  return out as T;
}

/** `table` with every prose field the active locale translates replaced. */
export function localizeDocs<T extends Record<string, any>>(section: string, table: T): T {
  return walkTable(section, table, (key, english) => ownTranslation(key) ?? english);
}

/** The English prose of `table` as a messages tree, as `editor-docs.json` holds it. */
export function collectDocs(section: string, table: Record<string, any>): Messages {
  const root: Record<string, any> = {};
  walkTable(section, table, (key, english) => {
    const path = key.split(".").slice(1);
    let node = root;
    for (const part of path.slice(0, -1)) node = node[part] ??= {};
    node[path[path.length - 1]] = english;
    return english;
  });
  return root;
}
