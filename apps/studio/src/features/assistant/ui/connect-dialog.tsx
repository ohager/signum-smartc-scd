import { useRef, useState } from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";
import { assistantPortAtom } from "../state";
import { RichText } from "./rich-text";
import { SetupSteps } from "../setup/setup-steps";

/* The relay's own ports (spec §5); connecting a browser to them can never work. */
const RESERVED_PORTS = [6876, 6877];

export function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 && !RESERVED_PORTS.includes(port) ? port : null;
}

export function ConnectDialog({ close }: { close: () => void }) {
  const { connect, ready } = useAssistant();
  const [savedPort, setSavedPort] = useAtom(assistantPortAtom);
  const [raw, setRaw] = useState(String(savedPort));
  const port = parsePort(raw);
  const canSubmit = port !== null && ready;
  const portRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (port === null || !ready) return;
    setSavedPort(port);
    connect(port);
    close();
  };

  return (
    <DialogContent
      className="sm:max-w-xl"
      /* Radix would focus the first focusable element, now the setup toggle; the port is what people type into. */
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        portRef.current?.focus();
      }}
    >
      <SubmitOnEnter onSubmit={submit} isEnabled={canSubmit}>
        <DialogHeader>
          <DialogTitle>{t("assistant.connect.title")}</DialogTitle>
          <DialogDescription>{t("assistant.connect.description")}</DialogDescription>
        </DialogHeader>
        <SetupSteps target={{ port, origin: location.origin }} />
        <section className="flex flex-col gap-y-2 my-4 border-t pt-4">
          <Label htmlFor="assistant-port">{t("assistant.connect.port")}</Label>
          <Input id="assistant-port" inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} aria-invalid={port === null} ref={portRef} />
          {port === null && <p className="text-xs text-destructive">{t("assistant.connect.portInvalid")}</p>}
          <p className="text-xs text-muted-foreground">
            <RichText text={t("assistant.connect.hint")} />
          </p>
        </section>
        <DialogFooter>
          <Button onClick={submit} disabled={!canSubmit}>
            {ready ? t("assistant.connect.submit") : t("assistant.connect.preparing")}
          </Button>
        </DialogFooter>
      </SubmitOnEnter>
    </DialogContent>
  );
}
