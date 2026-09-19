import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { climateById, DEFAULT_CLIMATE } from "@/theme/climates";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  // Sonner only knows light and dark. The climate knows which it is, by way of
  // the Monaco base it inherits from.
  const climate = climateById(theme ?? "") ?? climateById(DEFAULT_CLIMATE)!;

  return (
    <Sonner
      theme={climate.base === "vs" ? "light" : "dark"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
