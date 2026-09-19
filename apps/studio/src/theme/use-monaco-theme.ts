import { useTheme } from "next-themes";
import { DEFAULT_CLIMATE, climateById } from "./climates";
import { asmThemeName, smartcThemeName } from "./monaco-themes";

/**
 * The Monaco theme for the climate in force.
 *
 * Replaces seven copies of `theme === "dark" ? "vs-dark" : "light"`, which is
 * where the app visibly stopped and the editor began. `grammar` picks between
 * the two registered families: the assembly editor has its own token roles,
 * everything else shares the SmartC set.
 */
export function useMonacoTheme(grammar: "smartc" | "asm" = "smartc"): string {
  const { theme } = useTheme();
  const climate = climateById(theme ?? "") ?? climateById(DEFAULT_CLIMATE)!;

  return grammar === "asm" ? asmThemeName(climate.id) : smartcThemeName(climate.id);
}
