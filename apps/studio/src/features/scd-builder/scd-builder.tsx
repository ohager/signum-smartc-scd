import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { saveFileAtom } from "@/stores/project-atoms";
import type { ProjectFile } from "@/types/project";
import { SCD, type SCDType } from "@signum-smartc-abi/core/parser";
import { useSetAtom } from "jotai";
import { lazy, Suspense, useEffect, useState } from "react";
import { Amount } from "@signumjs/util";
import { toast } from "sonner";

const InitialData: SCDType = {
  activationAmount: Amount.fromSigna(0.5).getPlanck(),
  contractName: "",
  description: "",
  pragmas: {
    optimizationLevel: 3,
    verboseAssembly: false,
    maxAuxVars: 3,
    version: "2.2.1",
  },
  methods: [],
  variables: [],
  transactions: [],
  maps: [],
};

const SCDFormEditor = lazy(() => import("./form-editor"));
interface Props {
  file: ProjectFile;
  onSave: (data: SCDType) => void;
}

export const SCDBuilder = ({ file, onSave }: Props) => {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [isValidSCD, setIsValidSCD] = useState(false);
  const saveFile = useSetAtom(saveFileAtom);
  const [formData, setFormData] = useState<SCDType>(file.data ?? InitialData);

  useEffect(() => {
    try {
      SCD.parse(formData);
      setIsValidSCD(true);
    } catch (error) {
      setIsValidSCD(false);
      toast.error(`"${file.name}" is not a valid SCD file`);
      console.error(error);
    }
  }, [formData]);

  const handleOnSave = async (data: SCDType) => {
    try {
      await saveFile({ ...file, data });
      setFormData(InitialData);
      onSave(data);
    } catch (error) {}
  };

  if (!isValidSCD) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="w-full p-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "form" | "json")}>
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <Suspense fallback={<EditorLoadingState />}>
            <SCDFormEditor data={formData} onSave={handleOnSave} />
          </Suspense>
        </TabsContent>

        <TabsContent value="json">
          <Suspense fallback={<EditorLoadingState />}>
            {/* <MonacoJsonEditor value={value} onChange={onChange} /> */}
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function EditorLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner />
    </div>
  );
}
