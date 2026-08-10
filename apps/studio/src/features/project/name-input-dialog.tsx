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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  validate?: (name: string) => string | null;
  onSubmit: (name: string) => void;
}

export function NameInputDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = "",
  submitLabel = "Save",
  validate,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  const error = trimmed && trimmed !== initialValue ? (validate?.(trimmed) ?? null) : null;
  const canSubmit = trimmed.length > 0 && trimmed !== initialValue && !error;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <SubmitOnEnter onSubmit={submit} isEnabled={canSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-y-2 my-4">
            <Label htmlFor="name-input">{label}</Label>
            <Input id="name-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
