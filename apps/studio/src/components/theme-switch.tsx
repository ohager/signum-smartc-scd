import { useTheme } from "next-themes";
import { CLIMATES } from "@/theme/climates";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Four climates, four dots, each in its own accent. The active one is ringed.
 *
 * A toggle would have been wrong here: these are not two states of one thing,
 * they are four different rooms.
 */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Colour climate"
    >
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
                className="motion-control flex h-5 w-5 cursor-pointer items-center justify-center border hover:border-[var(--accent-2)]"
                style={{
                  borderColor: active ? climate.accent2 : "var(--border-1)",
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: climate.accent2,
                    opacity: active ? 1 : 0.55,
                  }}
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
