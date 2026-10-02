import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n/runtime";
import { parseDorMap, type DorMap } from "../disasm/dor-map";

export function DorImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (dor: DorMap) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const run = () => {
    const r = parseDorMap(text);
    if (!r.ok) {
      setError(t("inspector.labels.dorInvalid", { message: r.errors[0]!.message }));
      return;
    }
    onImport(r.value);
    setText("");
    setError("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.labels.dorTitle")}</DialogTitle>
          <DialogDescription>{t("inspector.labels.dorHint")}</DialogDescription>
        </DialogHeader>
        <Textarea rows={10} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        {error && <p className="text-sm text-[var(--mag)]">{error}</p>}
        <DialogFooter>
          <Button onClick={run} disabled={!text.trim()}>
            {t("inspector.labels.dorImport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
