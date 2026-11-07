import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";
import { RichText } from "./rich-text";

/*
 * Opens by itself while the relay waits for the user's decision. Closing the dialog
 * any other way counts as Deny, so an agent is never left hanging on a hidden prompt.
 */
export function ApprovalDialog() {
  const { state, allow, deny } = useAssistant();
  if (state.kind !== "awaiting-approval") return null;
  const occupied = state.occupied;
  const client = state.client?.name ?? t("assistant.approval.unknownClient");

  return (
    <Dialog open onOpenChange={(open) => !open && deny()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{occupied ? t("assistant.approval.occupiedTitle") : t("assistant.approval.title")}</DialogTitle>
          <DialogDescription>
            {occupied ? t("assistant.approval.occupied") : <RichText text={t("assistant.approval.request", { client })} />}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={deny}>
            {occupied ? t("assistant.approval.cancel") : t("assistant.approval.deny")}
          </Button>
          <Button onClick={allow}>{occupied ? t("assistant.approval.takeOver") : t("assistant.approval.allow")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
