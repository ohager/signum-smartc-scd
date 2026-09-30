import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n/runtime";
import { FixedMapGroupSchema, PatternMapGroupSchema, isFixedGroup, type MapGroup } from "../model/label-map";
import { FormatSelect } from "./format-select";

export function MapGroupDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MapGroup;
  onSave: (group: MapGroup) => void;
}) {
  const fixed = isFixedGroup(initial);
  const form = useForm<MapGroup>({
    resolver: zodResolver(fixed ? FixedMapGroupSchema : PatternMapGroupSchema) as never,
    defaultValues: initial,
  });
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open, initial, form]);

  const submit = form.handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries({ ...values, origin: "manual" }).filter(([, v]) => v !== "" && v !== undefined),
    ) as MapGroup;
    onSave(clean);
    onOpenChange(false);
  });

  const formatField = (name: "key1Format" | "key2Format" | "valueFormat", label: string, allowEmpty = true) => (
    <>
      <Label>{label}</Label>
      <Controller
        control={form.control}
        name={name as never}
        render={({ field }) => (
          <FormatSelect value={field.value as never} onChange={field.onChange} allowEmpty={allowEmpty} />
        )}
      />
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>
              {fixed ? t("inspector.group.titleFixed", { key1: initial.key1 }) : t("inspector.group.titlePattern")}
            </DialogTitle>
          </DialogHeader>
          <Label htmlFor="group-name">{t("inspector.group.name")}</Label>
          <Input id="group-name" autoFocus {...form.register("name")} />
          {!fixed && formatField("key1Format", t("inspector.group.key1Format"), false)}
          {formatField("key2Format", t("inspector.group.key2Format"))}
          {formatField("valueFormat", t("inspector.group.valueFormat"))}
          <Label htmlFor="group-enum">{t("inspector.group.enum")}</Label>
          <Input id="group-enum" {...form.register("enum")} />
          <Label htmlFor="group-comment">{t("inspector.group.comment")}</Label>
          <Input id="group-comment" {...form.register("comment")} />
          <DialogFooter className="mt-2">
            <Button type="submit">{t("inspector.group.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
