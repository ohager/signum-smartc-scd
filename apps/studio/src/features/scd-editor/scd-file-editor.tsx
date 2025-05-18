import { SCD, type SCDType } from "@signum-smartc-scd/core/parser";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { Amount } from "@signumjs/util";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { useScdContentManager } from "./hooks/use-scd-content-manager.ts";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";

const InitialData: SCDType = {
  activationAmount: Amount.fromSigna(0.5).getPlanck(),
  contractName: "",
  description: "",
  pragmas: {
    optimizationLevel: 3,
    verboseAssembly: false,
    maxAuxVars: 3,
    version: "2.3.0",
  },
  methods: [],
  variables: [],
  transactions: [],
  maps: [],
};

enum ActionType {
  GenerateSmartC = "generate-smartc",
}

const SCDBuilder = lazy(() => import("./scd-builder"));

export function SCDFileEditor({ file }: { file: File }) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { updateScdData, setCurrentFileId, isValid } =
    useScdContentManager();

  useEffect(() => {
    async function initializeContent() {
      try {
        const content = file.content ?? InitialData;
        await fs.saveFile(file.metadata.id, content);
        await updateScdData(content);
        setCurrentFileId(file.metadata.id);
      } catch (e) {
        toast.error(e.message);
      }
    }

    if (file.metadata.type !== "scd") {
      toast.error("Expected SCD file...");
    } else {
      initializeContent();
    }
  }, [file, setCurrentFileId, updateScdData]);

  const baseName = useMemo(() => {
    if(!file) return "";
    return file.metadata.name.split(".")[0];
  }, [file]);

  const createSmartCFile = useCallback(
    async (fileId: string, overwrite = false) => {
      // try {
      //   const scd = SCD.parse(scdData!);
      //   const generator = new SmartCGenerator(scd);
      //   const code = generator.generateContract();
      //
      //   if (overwrite) {
      //     if (!fs.exists(fileId)) {
      //       throw new Error("Could not find file: " + fileId);
      //     }
      //     existingFile.data = code;
      //     await saveFile(existingFile);
      //     toast.success("Smart Contract Template successfully re-generated!");
      //   } else {
      //     addFile({
      //       projectId: file.projectId,
      //       fileName: fileId,
      //       type: "contract",
      //       data: code,
      //     });
      //     toast.success("Smart Contract Template successfully created!");
      //   }
      // } catch (e) {
      //   console.error(e);
      //   toast.error("Could not generate SmartC file:" + e.message);
      // }
    },
    [],
    // [addFile, file, getFile, scdData, currentProject],
  );

  const generateSmartC = useCallback(
    async () => {
      const fileName = baseName + ".smart.c";
      if(fs.existPath(file.metadata.path + fileName)){
        setShowConfirmation(true);
        return
      }
      return createSmartCFile(fileName);
    },
    [baseName, file],
  );

  useEffect(() => {
    addAction({
      id: ActionType.GenerateSmartC,
      tooltip: "Generate SmartC Code from Description File",
      label: "Generate SmartC",
      icon: <Code2 className="h-4 w-4" />,
      onClick: generateSmartC,
      variant: "accent",
    });

    return () => {
      removeAction(ActionType.GenerateSmartC);
    };
  }, [addAction, removeAction, generateSmartC]);

  useEffect(() => {
    updateAction({
      id: ActionType.GenerateSmartC,
      updates: { disabled: !isValid },
    });
  }, [isValid, updateAction]);

  return (
    <>
      <Suspense fallback={<Loader />}>
        <SCDBuilder />
      </Suspense>
      <ConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        onConfirm={() => {
          // createSmartCFile(currentProject!.name + ".smart.c", true);
        }}
        title="File already exists"
        description="Are you sure you want to re-generate the file. All previous code will be overwritten"
        confirmText="Re-Generate"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner />
    </div>
  );
}
