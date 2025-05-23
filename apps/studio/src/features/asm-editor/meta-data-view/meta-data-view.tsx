import { CodeIcon, CopyIcon, InfoIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { BytecodeVisualizer } from "./bytecode-visualizer.tsx";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { ContractMetadata } from "./contract-meta-data.tsx";

interface Props {
  machineData: MachineData
}

export function MetaDataView({machineData}:Props) {
  return (
    <div className="grid grid-cols-2 h-full">
      <div className="border-r overflow-auto">
        <div className="p-4">
          <h3 className="text-lg font-medium mb-4 flex items-center">
            <CodeIcon className="h-5 w-5 mr-2 text-green-500" />
            Assembly Results
            <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Success
            </Badge>
          </h3>
          {machineData && <ContractMetadata data={machineData} />}
        </div>
      </div>

      <div className="overflow-auto">
        <div className="p-4">
          <h3 className="text-lg font-medium mb-4">
            ByteCode Visualization
          </h3>
          {machineData && <BytecodeVisualizer data={machineData} />}
        </div>
      </div>
    </div>
  )
}
