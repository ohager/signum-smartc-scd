import { readdirSync } from "fs";
import path from "path";
import { flattenMessages } from "./flatten";
import type { Messages } from "./runtime";

export interface LocaleProblems {
  extra: string[];
  placeholders: string[];
  tags: string[];
  code: string[];
  plural: string[];
  missing: string[];
}

type Leaf = string | Record<string, string>;

const texts = (leaf: Leaf) => (typeof leaf === "string" ? [leaf] : Object.values(leaf));
const sortedMatches = (leaf: Leaf, re: RegExp) =>
  [...new Set(texts(leaf).flatMap((s) => [...s.matchAll(re)].map((m) => m[1] ?? m[0])))].sort();
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const PLACEHOLDER = /\{(\w+)\}/g;
const TAG = /<(\w+)>/g;
/** Fenced blocks first, so their content is not also read as inline spans. */
const CODE = /(```[\s\S]*?```|`[^`\n]+`)/g;
const CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

/**
 * What is wrong with `target` measured against `source` (English). Everything
 * but `missing` is an error; missing keys fall back to English at runtime.
 */
/**
 * The plural categories a locale really uses for everyday counts. French,
 * Spanish, Italian and Portuguese have a "many" that only applies from a
 * million up, so it is not demanded; Russian's "many" (5 файлов) is.
 */
export function requiredCategories(localeId: string): string[] {
  const rules = new Intl.PluralRules(localeId);
  const used = new Set<string>(["other"]);
  for (let n = 0; n <= 200; n++) used.add(rules.select(n));
  return [...used].sort();
}

export function compareLocale(source: Messages, target: Messages, localeId?: string): LocaleProblems {
  const src = flattenMessages(source);
  const dst = flattenMessages(target);
  const p: LocaleProblems = { extra: [], placeholders: [], tags: [], code: [], plural: [], missing: [] };
  for (const key of src.keys()) if (!dst.has(key)) p.missing.push(key);

  // A plural that lost `other` no longer flattens as a leaf: `a.files.one`.
  // Report it once, as a plural problem, not as extra + missing keys.
  for (const key of [...dst.keys()]) {
    const dot = key.lastIndexOf(".");
    const parent = key.slice(0, dot);
    if (CATEGORIES.includes(key.slice(dot + 1)) && typeof src.get(parent) === "object") {
      if (!p.plural.includes(parent)) p.plural.push(parent);
      dst.delete(key);
      p.missing = p.missing.filter((k) => k !== parent);
    }
  }

  for (const [key, leaf] of dst) {
    const ref = src.get(key);
    if (ref === undefined) {
      p.extra.push(key);
      continue;
    }
    if (typeof ref !== typeof leaf) {
      p.plural.push(key);
      continue;
    }
    if (localeId && typeof leaf !== "string" && requiredCategories(localeId).some((c) => !(c in leaf))) {
      p.plural.push(key);
    }
    if (!same(sortedMatches(ref, PLACEHOLDER), sortedMatches(leaf, PLACEHOLDER))) p.placeholders.push(key);
    if (!same(sortedMatches(ref, TAG), sortedMatches(leaf, TAG))) p.tags.push(key);
    if (!same(sortedMatches(ref, CODE), sortedMatches(leaf, CODE))) p.code.push(key);
  }
  return p;
}

const LOCALES_DIR = path.join(import.meta.dir, "locales");

/** Every locale folder on disk — also those not yet offered in `LOCALES`. */
export async function loadLocaleDirs(): Promise<Map<string, Messages>> {
  const out = new Map<string, Messages>();
  for (const entry of readdirSync(LOCALES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const mod = await import(path.join(LOCALES_DIR, entry.name, "index.ts"));
    out.set(entry.name, mod.default as Messages);
  }
  return out;
}
