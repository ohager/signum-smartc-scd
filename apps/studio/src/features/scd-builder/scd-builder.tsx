import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { saveFileAtom } from "@/stores/project-atoms";
import type { ProjectFile } from "@/types/project";
import { SCD, type SCDType } from "@signum-smartc-abi/core/parser";
import { useSetAtom } from "jotai";
import { lazy, Suspense, useEffect, useState } from "react";
import { Amount } from "@signumjs/util";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { Cone } from "lucide-react";

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
const SCDCodeEditor = lazy(() => import("./code-editor"));

interface Props {
  file: ProjectFile;
  onSave: (data: SCDType) => void;
}

export const SCDBuilder = ({ file, onSave }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isValidSCD, setIsValidSCD] = useState(false);
  const saveFile = useSetAtom(saveFileAtom);
  const [scdData, setSCDData] = useState<SCDType>(file.data ?? InitialData);

  useEffect(() => {
    try {
      SCD.parse(scdData);
      setIsValidSCD(true);
    } catch (error) {
      setIsValidSCD(false);
      toast.error(`"${file.name}" is not a valid SCD file`);
      console.error(error);
    }
  }, [scdData]);

  const handleOnSave = async (data: SCDType) => {
    try {
      await saveFile({ ...file, data });
      setSCDData(data);
      onSave(data);
    } catch (error) {
      console.error("SCDBuilder Save Error:", error);
      toast.error(`Error while saving file "${file.name}"`);
    }
  };

  const handleEditModeChange = (mode: "form" | "json") => {
    setSearchParams((s) => {
      s.set("mode", mode);
      return s;
    });
  };

  if (!isValidSCD) {
    return <EditorLoadingState />;
  }

  return (
    <div className="w-full p-4">
      <Tabs
        value={searchParams.get("mode") || "form"}
        onValueChange={(v) => handleEditModeChange(v as "form" | "json")}
      >
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <Suspense fallback={<EditorLoadingState />}>
            <SCDFormEditor data={scdData} onSave={handleOnSave} />
          </Suspense>
        </TabsContent>

        <TabsContent value="json">
          <Suspense fallback={<EditorLoadingState />}>
            <SCDCodeEditor data={scdData} onSave={handleOnSave} />
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
