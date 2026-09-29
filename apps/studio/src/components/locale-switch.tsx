import { Check, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES } from "@/i18n/locales";
import { activeLocale } from "@/i18n/runtime";
import { switchLocale } from "@/i18n/switch";

/**
 * Each language in its own name. Hidden until there is a second one to choose:
 * a picker with one entry is a question with one answer.
 */
export function LocaleSwitch() {
  if (LOCALES.length < 2) return null;
  const current = activeLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={LOCALES.find((l) => l.id === current)?.nativeLabel}
          className="motion-control flex h-5 cursor-pointer items-center gap-1 border border-[var(--border-1)] px-1.5 text-[10px] font-semibold uppercase tracking-wider hover:border-[var(--accent-2)]"
        >
          <Languages className="h-3 w-3" aria-hidden />
          {current}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale.id}
            lang={locale.id}
            onSelect={() => {
              if (locale.id !== current) void switchLocale(locale.id);
            }}
          >
            <Check
              className={locale.id === current ? "h-3 w-3" : "h-3 w-3 invisible"}
              aria-hidden
            />
            {locale.nativeLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
