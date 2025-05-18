import { SCD, type SCDType } from "@signum-smartc-scd/core/parser";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Code2 } from "lucide-react";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { Amount } from "@signumjs/util";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { useScdContentManager } from "./hooks/use-scd-content-manager.ts";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { type File, FileSystem } from "@/lib/file-system";
import { SmartCGenerator } from "@signum-smartc-scd/core/generator";
import { FileType } from "@/features/project/filetype-icons.tsx";

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

async function createSmartCFile(
  folderId: string,
  fileName: string,
  data: SCDType,
) {
  const fs = FileSystem.getInstance();
  const folder = fs.getFolder(folderId);
  if (!folder) {
    throw new Error("Could not find folder:" + folderId);
  }

  const scd = SCD.parse(data);
  const generator = new SmartCGenerator(scd);
  const code = generator.generateContract();
  await fs.addFile(folderId, fileName, FileType.SmartC, code);
  toast.success("Smart Contract Template successfully created!");
}

async function updateSmartCFile(fileId: string, data: SCDType) {
  const fs = FileSystem.getInstance();
  if (!fs.exists(fileId)) {
    throw new Error("Could not find file:" + fileId);
  }
  if (fs.getFileMetadata(fileId)?.type !== FileType.SmartC) {
    throw new Error("Existing File is not a SmartC file");
  }
  const scd = SCD.parse(data);
  const generator = new SmartCGenerator(scd);
  const code = generator.generateContract();
  await fs.saveFile(fileId, code);
  toast.success("Smart Contract Template successfully created!");
}

const SCDBuilder = lazy(() => import("./scd-builder"));

export function SCDFileEditor({ file }: { file: File }) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const { updateScdData, setCurrentFileId, isValid, scdData } =
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

    if (file.metadata.type !== FileType.SCD) {
      toast.error("Expected SCD file...");
    } else {
      initializeContent();
    }
  }, [file, setCurrentFileId, updateScdData]);

  const baseName = useMemo(() => {
    if (!file) return "";
    return file.metadata.name.split(".")[0];
  }, [file]);

  const generateSmartC = useCallback(async () => {
    if (!scdData) {
      return toast.error("No SCD Data");
    }

    const fileName = baseName + ".smart.c";
    if (fs.existPath(file.metadata.path + fileName)) {
      setShowConfirmation(true);
      return;
    }
    return createSmartCFile(file.metadata.folderId, fileName, scdData);
  }, [scdData, baseName, file]);

  const updateSmartC = useCallback(async () => {
    if (!scdData) {
      console.warn("No SCD Data");
      return;
    }
    const { files } = fs.listFolderContents(file.metadata.folderId);
    const fileName = baseName + ".smart.c";
    const existingFile = files.find((f) => f.metadata.name === fileName);
    if (!existingFile) {
      return toast.error("Could not find existing file");
    }
    return updateSmartCFile(existingFile?.id, scdData);
  }, [scdData, baseName, file]);

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
        onConfirm={updateSmartC}
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
