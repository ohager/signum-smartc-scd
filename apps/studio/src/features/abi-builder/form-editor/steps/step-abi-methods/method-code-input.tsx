import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShuffleIcon } from "lucide-react";
import { FieldLabel } from "@/components/ui/field-label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  code: string;
  onChange: (code: string) => void;
}

export function MethodCodeInput({ code, onChange }: Props) {
  const generateRandomCode = () => {
    const code = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    onChange(code.toString(10));
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <FieldLabel
          text="Code"
          tooltip="The code/magic number is used as arguments in transactions to identify the method"
        />
        <Input
          value={code}
          type="number"
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Method code"
        />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" onClick={generateRandomCode}>
            <ShuffleIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Generate a random code</TooltipContent>
      </Tooltip>
    </div>
  );
}
