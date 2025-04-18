import { useCallback, useEffect, useRef, useState } from "react";
import { JsonEditor } from "./editor";
import type { SCDType } from "@signum-smartc-scd/core/parser";
import { FileWarning, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  data: SCDType;
  onSave: (data: SCDType) => void;
  autoSave?: number;
}

export function SCDJsonEditor({ data, onSave, autoSave = 2000 }: Props) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const [jsonValue, setJsonValue] = useState(JSON.stringify(data, null, 2));
  const [isValid, setIsValid] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const save = (value: string) => {
    try {
      console.log("Saving...", value);
      const parsedJson = JSON.parse(value);
      onSave(parsedJson);
      setIsDirty(false);
    } catch (error) {
      console.error("Failed to auto-save:", error);
    }
  };

  useEffect(() => {
    if (autoSave <= 0) return;

    if (isValid && jsonValue && isDirty) {
      timer.current && clearTimeout(timer.current);

      timer.current = setTimeout(() => {
        console.log("debounce....");
        save(jsonValue);
        timer.current = null;
      }, autoSave);
    }
    return () => {
      timer.current && clearTimeout(timer.current);
    };
  }, [jsonValue, isValid, isDirty, save, autoSave]);

  const handleChange = (value: string | undefined) => {
    if (value) {
      setIsDirty(true);
      setJsonValue(value);
    }
  };

  const handleValidationChange = (isValid: boolean) => {
    console.log("Validation changed:", isValid);
    setIsValid(isValid);
  };

  return (
    <div>
      <section className="w-full flex justify-between items-center p-1">
        <div>
          {!isValid && (
            <span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileWarning className="h-4 w-4 text-yellow-100" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Invalid SCD - Check for errors
                </TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => save(jsonValue)}
                  disabled={!isValid}
                  className="disabled:cursor-none"
                >
                  <SaveIcon
                    className={isDirty ? "text-red-200" : "text-green-200"}
                  />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isDirty ? "Unsaved changes" : "All Saved"}
            </TooltipContent>
          </Tooltip>
        </div>
      </section>
      <div className="p-1 rounded">
        <JsonEditor
          value={jsonValue}
          onChange={handleChange}
          onValidationChange={handleValidationChange}
        />
      </div>
    </div>
  );
}
