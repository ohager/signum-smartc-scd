import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { type File } from "@/lib/file-system";
import { useEffect, useState } from "react";
import AsmCodeEditor from "./code-editor/asm-code-editor.tsx";
import type { MachineData } from "./machine-data.ts";
import { tryAssemble } from "@/features/asm-editor/lib/try-assemble.ts";
import { MetaDataView } from "./meta-data-view";

interface Props {
  file: File;
}

/**
 * The assembly file, with its numbers beside it.
 *
 * The `.asm` is the one context in which the assembly itself is the subject,
 * so it keeps its technical detail — contract size, registers, pages. What it
 * loses is the tab bar: deployment is its own destination now, and "Assembled
 * Output" is a side panel rather than a view behind the code, so the numbers
 * are readable *while* the assembly is.
 */
export function AsmEditor({ file }: Props) {
  const [machineData, setMachineData] = useState<MachineData | undefined>(
    undefined,
  );
  const handleOnSave = (_isValid: boolean, machineCode?: MachineData) => {
    setMachineData(machineCode);
  };

  useEffect(() => {
    try {
      setMachineData(undefined);
      setMachineData(tryAssemble(file.content as string));
    } catch (e) {
      setMachineData(undefined);
    }
  }, [file]);

  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize={60} minSize={30}>
        <AsmCodeEditor file={file} onSave={handleOnSave} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={40} minSize={24}>
        <div className="h-full min-h-0 border-l border-[var(--border-1)]">
          {machineData ? (
            <MetaDataView machineData={machineData} />
          ) : (
            <p className="p-3 text-xs text-[var(--dim)]">
              Assemble the file to see its pages, memory and bytes.
            </p>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export default AsmEditor;
