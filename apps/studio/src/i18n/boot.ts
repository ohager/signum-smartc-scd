import { LOCALES, STORAGE_KEY, type LocaleEntry, type LocaleId } from "./locales";
import { resetMessages, setMessages } from "./runtime";

const baseOf = (tag: string) => tag.split("-")[0].toLowerCase();

/**
 * Stored choice if still offered → first browser language that matches
 * (exactly, then by base language: pt-PT → pt-BR, zh-TW → zh-CN) → English.
 */
export function resolveLocale(
  stored: string | null,
  languages: readonly string[],
  available: readonly LocaleId[] = LOCALES.map((l) => l.id),
): LocaleId {
  const known = available.find((id) => id === stored);
  if (known) return known;
  for (const lang of languages) {
    const exact = available.find((id) => id.toLowerCase() === lang.toLowerCase());
    if (exact) return exact;
    const byBase = available.find((id) => baseOf(id) === baseOf(lang));
    if (byBase) return byBase;
  }
  return "en";
}

/** Loads `id` and makes it the page's locale. Never throws; English is the floor. */
export async function activate(
  id: LocaleId,
  entries: readonly LocaleEntry[] = LOCALES,
  root: { lang: string } = document.documentElement,
): Promise<LocaleId> {
  const entry = entries.find((e) => e.id === id);
  if (entry && id !== "en") {
    try {
      const { default: messages } = await entry.load();
      setMessages(id, messages);
      root.lang = id;
      return id;
    } catch (error) {
      console.warn(`[i18n] could not load "${id}", continuing in English`, error);
    }
  }
  resetMessages();
  root.lang = "en";
  return "en";
}

function storedLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function boot(): Promise<LocaleId> {
  return activate(resolveLocale(storedLocale(), navigator.languages ?? []));
}
