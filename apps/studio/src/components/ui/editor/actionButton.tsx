import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SaveIcon } from "lucide-react";

const buttonVariants = cva(
  "cursor-pointer rounded-xs inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive p-1",
  {
    variants: {
      variant: {
        default:
          "bg-none text-primary-foreground shadow-xs hover:bg-primary/90 dark:hover:bg-secondary",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function EditorActionButton({
  className,
  variant,
  tooltip,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    tooltip?: string;
  }) {
  const Comp = asChild ? Slot : "button";

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Comp
              data-slot="button"
              className={cn(buttonVariants({ variant, className }))}
              {...props}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { EditorActionButton, buttonVariants };
