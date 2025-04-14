import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";

interface FieldLegendProps {
  text: string;
  htmlFor?: string;
  tooltip?: string;
}

export function FieldLabel({ tooltip, text, htmlFor }: FieldLegendProps) {
  return (
    <label htmlFor={htmlFor} className="flex flex-row items-center mb-1">
      {text}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon
              height={20}
              width={20}
              className="ml-1 text-gray-300 cursor-help"
            />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </label>
  );
}
