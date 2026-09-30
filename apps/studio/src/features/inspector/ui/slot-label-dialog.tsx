import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n/runtime";
import { SlotLabelSchema, type SlotLabel } from "../model/label-map";
import { FormatSelect } from "./format-select";

export function SlotLabelDialog({
  open,
  onOpenChange,
  initial,
  enums,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SlotLabel;
  enums: string[];
  onSave: (slot: SlotLabel) => void;
  onRemove?: () => void;
}) {
  const form = useForm<SlotLabel>({ resolver: zodResolver(SlotLabelSchema), defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open, initial, form]);
  const format = form.watch("format");

  const submit = form.handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries({ ...values, origin: "manual" }).filter(([, v]) => v !== "" && v !== undefined),
    ) as SlotLabel;
    onSave(clean);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t("inspector.label.title", { index: initial.index })}</DialogTitle>
          </DialogHeader>
          <Label htmlFor="slot-name">{t("inspector.label.name")}</Label>
          <Input id="slot-name" autoFocus {...form.register("name")} />
          {form.formState.errors.name && (
            <p className="text-xs text-[var(--mag)]">{form.formState.errors.name.message}</p>
          )}
          <Label htmlFor="slot-format">{t("inspector.label.format")}</Label>
          <Controller
            control={form.control}
            name="format"
            render={({ field }) => <FormatSelect id="slot-format" value={field.value} onChange={field.onChange} />}
          />
          {format === "enum" && (
            <>
              <Label htmlFor="slot-enum">{t("inspector.label.enum")}</Label>
              <Input id="slot-enum" list="slot-enums" {...form.register("enum")} />
              <datalist id="slot-enums">
                {enums.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </>
          )}
          <Label htmlFor="slot-length">{t("inspector.label.length")}</Label>
          <Input
            id="slot-length"
            type="number"
            min={1}
            {...form.register("length", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
          />
          <Label htmlFor="slot-comment">{t("inspector.label.comment")}</Label>
          <Input id="slot-comment" {...form.register("comment")} />
          <DialogFooter className="mt-2">
            {onRemove && (
              <Button type="button" variant="ghost" onClick={() => { onRemove(); onOpenChange(false); }}>
                {t("inspector.label.remove")}
              </Button>
            )}
            <Button type="submit">{t("inspector.label.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
