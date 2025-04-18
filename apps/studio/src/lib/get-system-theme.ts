export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"; // Default for SSR

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
