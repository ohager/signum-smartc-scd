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
import { MetaDataView } from "@/features/asm-editor/meta-data-view/meta-data-view.tsx";

interface Props {
  file: File;
}

export function AsmEditor({ file }: Props) {
  const [activeTab, setActiveTab] = useState("editor");
  const [isValid, setIsValid] = useState(true);
  const [machineData, setMachineData] = useState<MachineData | undefined>(
    undefined,
  );
  const handleOnSave = (isValid: boolean, machineCode?: MachineData) => {
    setIsValid(isValid);
    setMachineData(machineCode);
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
    <div className="flex-1 overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="h-full flex flex-col"
      >
        <div className="border-b px-4 bg-background">
          <TabsList>
            <TabsTrigger value="editor">ASM Editor</TabsTrigger>
            <TabsTrigger value="compiled" disabled={!isValid}>
              Assembled Output
            </TabsTrigger>
            <TabsTrigger value="deploy" disabled={!isValid}>
              Deployment
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="editor" className="flex-1 p-0 m-0 overflow-hidden">
          <AsmCodeEditor file={file} onSave={handleOnSave} />
        </TabsContent>

        <TabsContent
          value="compiled"
          className="flex-1 p-0 m-0 overflow-hidden"
        >
          {machineData && <MetaDataView machineData={machineData} />}
        </TabsContent>

        <TabsContent value="deploy" className="flex-1 p-4 m-0 overflow-auto">
          {/*<DeploymentPanel data={compiledData} />*/}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AsmEditor;
