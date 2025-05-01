import { useCallback, useState } from "react";
import { JsonEditor } from "./editor";
import { FileWarning, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScdFileManager } from "../hooks/use-scd-file-manager.ts";

export function SCDJsonEditor() {
  const { requestUpdateData, isValid, scdData } = useScdFileManager();
  const [jsonValue, setJsonValue] = useState(
    JSON.stringify(scdData ?? "", null, 2),
  );
  const [isDirty, setIsDirty] = useState(false);

  const save = useCallback(
    (value: string) => {
      try {
        requestUpdateData(value, () => setIsDirty(false));
      } catch (error) {
        // ignore
        console.error(error);
      }
    },
    [requestUpdateData],
  );

  const handleChange = async (value: string | undefined) => {
    if (value) {
      setJsonValue(value);
      setIsDirty(true);
      save(value);
    }
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
                    className={isDirty ? "text-red-400" : "text-green-400"}
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
        <JsonEditor value={jsonValue} onChange={handleChange} />
      </div>
    </div>
  );
}
