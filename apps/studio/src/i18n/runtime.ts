import en from "./locales/en";
import { isPluralNode } from "./flatten";
import type { LocaleId } from "./locales";

/**
 * The locale is fixed for the lifetime of the page: `boot.ts` sets it once,
 * before `App` is imported. That is why `t()` is a plain function and not a
 * hook — Monaco providers, toasts and module-level docs can all call it.
 */

export type Messages = { readonly [key: string]: string | Messages };
export type Params = Record<string, string | number>;

let locale: LocaleId = "en";
let messages: Messages = en;

export function setMessages(id: LocaleId, next: Messages): void {
  locale = id;
  messages = next;
}

export function resetMessages(): void {
  setMessages("en", en);
}

export function activeLocale(): LocaleId {
  return locale;
}

function lookup(tree: Messages, key: string): string | Messages | undefined {
  let node: string | Messages | undefined = tree;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return node;
}

function select(
  node: string | Messages | undefined,
  params: Params | undefined,
  forLocale: string,
): string | undefined {
  if (typeof node === "string") return node;
  if (!isPluralNode(node)) return undefined;
  const count = params?.count;
  if (typeof count !== "number") return node.other;
  const category = new Intl.PluralRules(forLocale).select(count);
  return node[category] ?? node.other;
}

/** The template for `key` — active locale first, then English. */
export function rawMessage(key: string, params?: Params): string | undefined {
  return (
    select(lookup(messages, key), params, locale) ??
    select(lookup(en, key), params, "en")
  );
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Untyped core of `t()`. Missing everywhere → the key itself. */
export function translate(key: string, params?: Params): string {
  const template = rawMessage(key, params);
  return template === undefined ? key : interpolate(template, params);
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}
