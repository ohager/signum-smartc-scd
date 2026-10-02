import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { t } from "@/i18n/runtime";

export function CodeLabelDialog({
  open,
  onOpenChange,
  address,
  initial,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: number;
  initial: string;
  onSave: (name: string) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <SubmitOnEnter onSubmit={save} isEnabled={canSave}>
          <DialogHeader>
            <DialogTitle>{t("inspector.codeLabel.title", { address: `0x${address.toString(16).padStart(4, "0")}` })}</DialogTitle>
          </DialogHeader>
          <div className="my-3 flex flex-col gap-2">
            <Label htmlFor="code-label-name">{t("inspector.codeLabel.name")}</Label>
            <Input id="code-label-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            {onRemove && (
              <Button variant="ghost" onClick={() => { onRemove(); onOpenChange(false); }}>
                {t("inspector.codeLabel.remove")}
              </Button>
            )}
            <Button onClick={save} disabled={!canSave}>
              {t("inspector.codeLabel.save")}
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
