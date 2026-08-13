import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileTypes } from "./filetype-icons";
import { replaceWhitespace } from "@/lib/string";
import { withExtension, uniqueName } from "./file-naming";
import { smartcStarter } from "./smartc-starter";
import {
  serializeScenario,
  defaultScenario,
} from "@/features/simulator/scenario/scenario-io";

const EXT: Record<string, string> = {
  [FileTypes.SmartC]: ".smart.c",
  [FileTypes.Scenario]: ".scenario.json",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onCreate: (name: string, type: FileTypes, content: string) => void;
}

export function NewFileDialog({
  open,
  onOpenChange,
  existingNames,
  onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FileTypes>(FileTypes.SmartC);
  useEffect(() => {
    if (open) {
      setName("");
      setType(FileTypes.SmartC);
    }
  }, [open]);

  const base = replaceWhitespace(name.trim());
  const canSubmit = base.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const ext = EXT[type];
    const finalName = uniqueName(withExtension(base, ext), existingNames, ext);
    const content =
      type === FileTypes.Scenario
        ? serializeScenario(defaultScenario())
        : smartcStarter(finalName.slice(0, -ext.length));
    onCreate(finalName, type, content);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <SubmitOnEnter onSubmit={submit} isEnabled={canSubmit}>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-y-2 my-4">
            <Label htmlFor="new-file-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FileTypes)}>
              <SelectTrigger id="new-file-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FileTypes.SmartC}>
                  SmartC contract (.smart.c)
                </SelectItem>
                <SelectItem value={FileTypes.Scenario}>
                  Scenario (.scenario.json)
                </SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="new-file-name">Name</Label>
            <Input
              id="new-file-name"
              autoFocus
              placeholder="my-contract"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!canSubmit}>
              Create
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
