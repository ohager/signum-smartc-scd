import { type SCDType } from "@signum-smartc-scd/core/parser";
import { useEffect } from "react";
import { Code2 } from "lucide-react";
import { SCDBuilder } from "@/features/scd-builder/scd-builder.tsx";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { useAtomValue } from "jotai";
import { scdValidationStateAtom } from "@/features/scd-builder/stores/scd-builder-atoms.ts";

export function SCDFileEditor({
  file,
  onSave,
}: {
  file: any;
  onSave: (data: SCDType) => void;
}) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const validationState = useAtomValue(scdValidationStateAtom)

  useEffect(() => {
    addAction({
      id: "generate-smartc",
      tooltip: "Generate SmartC",
      icon: <Code2 className="h-4 w-4" />,
      onClick: () => {
        // Your logic to generate SmartC code
        console.log("Generating SmartC code");
      },
      variant: "outline",
    });

    return () => {
      removeAction("generate-smartc");
    };
  }, [addAction, removeAction]);

  useEffect(() => {
    console.log("update action", validationState);
    updateAction({
      id: "generate-smartc",
      updates: { disabled: !validationState.isValid },
    });
  }, [validationState, updateAction]);


  return <SCDBuilder key={file.id} file={file} onSave={onSave}/>;
}
