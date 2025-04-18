import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative h-6 w-16 rounded-full transition-colors hover:bg-transparent"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <div
        className={`absolute h-5 w-5 rounded-full transition-all duration-200 ${
          theme === "dark" ? "left-10 bg-slate-700" : "left-0.5 bg-slate-400"
        }`}
      />
      <SunIcon
        className={`absolute left-1 h-4 w-4 transition-all ${
          theme === "dark" ? "text-slate-400" : "text-yellow-100"
        }`}
      />
      <MoonIcon
        className={`absolute right-1 h-4 w-4 transition-all ${
          theme === "dark" ? "text-white" : "text-slate-400"
        }`}
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
