import { useCallback, useEffect, useRef, useState } from "react";
import { JsonEditor } from "./json-editor.tsx";
import { FileWarning, SaveIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScdContentManager } from "../hooks/use-scd-content-manager.ts";
import { EditorActionButton } from "@/components/ui/editor/actionButton.tsx";
import {toast}  from "sonner"
import scdSchema from "@signum-smartc-scd/core/scd-schema.json";


export function SCDJsonEditor() {
  const { requestUpdateScdData, scdData, updateScdData } = useScdContentManager();
  const [jsonStrValue, setJsonStrValue] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)"); // Initial height

  useEffect(() => {
    if(scdData){
      console.log("SCD Data", scdData);
      setJsonStrValue(JSON.stringify(scdData, null, 2))
      setIsDirty(false);
    }
  }, [scdData]);

  useEffect(() => {
    const calculateEditorHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        const headerHeight = 30;
        const newHeight = `calc(100vh - ${containerTop + headerHeight}px)`;
        setEditorHeight(newHeight);
      }
    };

    calculateEditorHeight();
    window.addEventListener("resize", calculateEditorHeight);
    return () => window.removeEventListener("resize", calculateEditorHeight);
  }, []);

  const immediateSave = useCallback(async () => {
      if (validationError) {
        toast.warning(`Cannot save file! Invalid SCD: ${validationError ?? "Unknown error"}`);
        return;
      }
      try {
        await updateScdData(jsonStrValue);
        toast.success("File saved");
      } catch (e) {
        console.error("File Saving error", e);
        toast.error("Error saving file");
      }
  },[validationError, jsonStrValue, updateScdData] )

  useEffect(() => {
    // before you ask: WTF?
    // using events to decouple from JSON-Editor component, avoiding prop-drill down and dead loop rendering...
    window.addEventListener("json-editor:save", immediateSave);
    return () => {
      window.removeEventListener("json-editor:save", immediateSave);
    };
  }, [immediateSave]);

  const handleChange = async (value: string | undefined) => {
    if (value) {
      setJsonStrValue(value);
      setIsDirty(true);
      requestUpdateScdData(value, () => setIsDirty(false));
    }
  };

  const isValid = !validationError;

  return (
    <div ref={containerRef}>
      <section className="w-full flex justify-between items-center h-[30px] bg-muted">
        <div>
          {!isValid && (
            <span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                  <FileWarning className="h-4 w-4 text-red-600" />
                  <small className="text-xs text-red-600 ">{validationError}</small>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Invalid SCD
                </TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <EditorActionButton
            tooltip={isDirty ? "Unsaved changes" : "All Saved"}
            onClick={immediateSave}
            disabled={!isValid}
          >
            <SaveIcon className={isDirty ? "text-red-600" : "text-green-600"} />
          </EditorActionButton>
        </div>
      </section>
      <JsonEditor
        value={jsonStrValue}
        schema={{
            uri: "https://signum.network/scd/schema.json",
            fileMatch: ["*"],
            schema: scdSchema,
        }}
        onChange={handleChange}
        onValidationChange={setValidationError}
        height={editorHeight}
      />
    </div>
  );
}
