import { useTheme } from "next-themes";
import { DEFAULT_CLIMATE, climateById } from "./climates";
import { asmThemeName, jsonThemeName, smartcThemeName } from "./monaco-themes";

/**
 * The Monaco theme for the climate in force.
 *
 * Replaces seven copies of `theme === "dark" ? "vs-dark" : "light"`, which is
 * where the app visibly stopped and the editor began. `grammar` picks between
 * the registered families: assembly and JSON each emit token roles the SmartC
 * set does not cover, and everything else shares that set.
 */
export function useMonacoTheme(
  grammar: "smartc" | "asm" | "json" = "smartc",
): string {
  const { theme } = useTheme();
  const climate = climateById(theme ?? "") ?? climateById(DEFAULT_CLIMATE)!;

  if (grammar === "asm") return asmThemeName(climate.id);
  if (grammar === "json") return jsonThemeName(climate.id);
  return smartcThemeName(climate.id);
}
