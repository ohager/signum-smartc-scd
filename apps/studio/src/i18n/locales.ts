import type { Messages } from "./runtime";
import en from "./locales/en";

export type LocaleId =
  | "en"
  | "de"
  | "pt-BR"
  | "fr"
  | "es"
  | "it"
  | "uk"
  | "ru"
  | "zh-CN";

export interface LocaleEntry {
  id: LocaleId;
  /** The language's name in itself — what its speakers look for. */
  nativeLabel: string;
  load: () => Promise<{ default: Messages }>;
}

/**
 * The locales a user can choose. A locale is added here in the commit that
 * completes its translation, never before: the picker offers exactly this list.
 */
export const LOCALES: LocaleEntry[] = [
  { id: "en", nativeLabel: "English", load: async () => ({ default: en }) },
  { id: "de", nativeLabel: "Deutsch", load: () => import("./locales/de") },
  { id: "ru", nativeLabel: "Русский", load: () => import("./locales/ru") },
  { id: "uk", nativeLabel: "Українська", load: () => import("./locales/uk") },
  { id: "zh-CN", nativeLabel: "简体中文", load: () => import("./locales/zh-CN") },
];

export const STORAGE_KEY = "studio.locale";
