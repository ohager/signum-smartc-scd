import { flushPendingSaves } from "@/lib/pending-saves";
import { STORAGE_KEY, type LocaleId } from "./locales";

interface Deps {
  storage?: Pick<Storage, "setItem">;
  reload?: () => void;
  flush?: () => Promise<void>;
}

/** The locale is fixed per page load, so changing it means loading the page again. */
export async function switchLocale(id: LocaleId, deps: Deps = {}): Promise<void> {
  const {
    storage = localStorage,
    reload = () => location.reload(),
    flush = flushPendingSaves,
  } = deps;
  try {
    await flush();
  } catch (error) {
    console.error("[i18n] flushing pending saves failed", error);
  }
  try {
    storage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.warn("[i18n] could not store the locale", error);
  }
  reload();
}
