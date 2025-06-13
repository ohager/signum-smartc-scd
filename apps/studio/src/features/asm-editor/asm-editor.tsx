import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { type File } from "@/lib/file-system";
import { useEffect, useState } from "react";
import AsmCodeEditor from "./code-editor/asm-code-editor.tsx";
import type { MachineData } from "./machine-data.ts";
import { tryAssemble } from "@/features/asm-editor/lib/try-assemble.ts";
import { MetaDataView } from "./meta-data-view";
import { DeploymentView } from "./deployment-view";
import { useSearchParams } from "react-router";

type ViewType = "editor" | "metadata" | "deployment";

interface Props {
  file: File;
}

export function AsmEditor({ file }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isValid, setIsValid] = useState(true);
  const [machineData, setMachineData] = useState<MachineData | undefined>(
    undefined,
  );
  const handleOnSave = (isValid: boolean, machineCode?: MachineData) => {
    setIsValid(isValid);
    setMachineData(machineCode);
  };

  const handleViewChange = (view: ViewType) => {
    setSearchParams((s) => {
      s.set("v", view);
      return s;
    });
  };

  useEffect(() => {
    try {
      setMachineData(undefined);
      setMachineData(tryAssemble(file.content as string));
      setIsValid(true);
    } catch (e) {
      setIsValid(false);
    }
  }, [file]);

  return (
      <Tabs
        value={searchParams.get("v") || "editor"}
        onValueChange={(v) => handleViewChange(v as ViewType)}
        className="h-full flex flex-col"
      >
          <TabsList>
            <TabsTrigger value="editor">ASM Editor</TabsTrigger>
            <TabsTrigger value="metadata" disabled={!isValid}>
              Assembled Output
            </TabsTrigger>
            <TabsTrigger value="deploy" disabled={!isValid}>
              Deployment
            </TabsTrigger>
          </TabsList>

        <TabsContent value="editor" className="flex-1 p-0 m-0 overflow-hidden">
          <AsmCodeEditor file={file} onSave={handleOnSave} />
        </TabsContent>

        <TabsContent
          value="metadata"
          className="flex-1 p-0 m-0 overflow-hidden"
        >
          {machineData && <MetaDataView machineData={machineData} />}
        </TabsContent>

        <TabsContent value="deploy" className="flex-1 p-4 m-0 overflow-auto">
          {machineData && <DeploymentView data={machineData} />}
        </TabsContent>
      </Tabs>
  )
}

export default AsmEditor;
