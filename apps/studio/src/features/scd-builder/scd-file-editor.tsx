import { SCD, type SCDType } from "@signum-smartc-scd/core/parser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { SCDBuilder } from "@/features/scd-builder/scd-builder.tsx";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { useSingleProject } from "@/hooks/use-single-project.ts";
import { toast } from "sonner";
import type { ProjectFile } from "@/types/project.ts";
import { SmartCGenerator } from "@signum-smartc-scd/core/generator";
import { useProjects } from "@/hooks/use-projects.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { useFile } from "@/hooks/use-file.ts";
import { useScdFileManager } from "@/features/scd-builder/hooks/use-scd-file-manager.ts";
import { Amount } from "@signumjs/util";

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

export enum ActionType {
  GenerateSmartC = "generate-smartc",
}

export function SCDFileEditor({ file }: { file: ProjectFile }) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const { addFile } = useSingleProject();
  const { projects } = useProjects();
  const { saveFile, getFile } = useFile();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { updateData, scdData, isValid, setCurrentFileId } = useScdFileManager();

  useEffect(() => {
    if (file.type !== "scd") {
      toast.error("Expected SCD file...");
      // see whatelse to do
    } else {
      setCurrentFileId({fileId: file.id, projectId: file.projectId});
      updateData(
        file.data ?? InitialData,
      );
    }
  }, [file]);

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === file.projectId);
  }, [projects]);

  const createSmartCFile = useCallback(
    async (fileName: string, overwrite = false) => {
      try {
        const scd = SCD.parse(scdData!);
        const generator = new SmartCGenerator(scd);
        const code = generator.generateContract();

        if (overwrite) {
          const existingFile = currentProject?.files.find(
            (f) => f.name === fileName,
          );
          if (!existingFile) {
            throw new Error("Could not find file: " + fileName);
          }
          existingFile.data = code;
          await saveFile(existingFile);
          toast.success("Smart Contract Template successfully re-generated!");
        } else {
          addFile({
            projectId: file.projectId,
            fileName,
            type: "contract",
            data: code,
          });
          toast.success("Smart Contract Template successfully created!");
        }
      } catch (e) {
        console.error(e);
        toast.error("Could not generate SmartC file:" + e.message);
      }
    },
    [addFile, file, getFile, scdData, currentProject],
  );

  const generateSmartC = useCallback(async () => {
    if (!currentProject) {
      console.error("Invalid project id", file.projectId);
      toast.error("Invalid Project");
      return;
    }
    const fileName = currentProject.name + ".smart.c";

    if (currentProject.files.find((f) => f.name === fileName)) {
      setShowConfirmation(true);
      return;
    }

    return createSmartCFile(fileName);
  }, [file.name, file.projectId, currentProject]);

  useEffect(() => {
    addAction({
      id: ActionType.GenerateSmartC,
      tooltip: "Generate SmartC",
      icon: <Code2 className="h-4 w-4" />,
      onClick: generateSmartC,
      variant: "outline",
    });

    return () => {
      removeAction(ActionType.GenerateSmartC);
    };
  }, [addAction, removeAction, generateSmartC]);

  useEffect(() => {
    updateAction({
      id: "generate-smartc",
      updates: { disabled: !isValid },
    });
  }, [isValid, updateAction]);

  return (
    <>
      <SCDBuilder />;
      <ConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        onConfirm={() =>
          createSmartCFile(currentProject!.name + ".smart.c", true)
        }
        title="File already exists"
        description="Are you sure you want to re-generate the file. All previous code will be overwritten"
        confirmText="Re-Generate"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
