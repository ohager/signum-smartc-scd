import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { GitHubProvider } from "@/lib/git-sync/github-provider";
import type { TokenStore } from "@/lib/git-sync/token-store";
import { t } from "@/i18n/runtime";
import { gitErrorMessage } from "./git-error-message";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: TokenStore;
}

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export function GitHubTokenDialog({ open, onOpenChange, tokens }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [stored, setStored] = useState(() => tokens.get() !== null);

  useEffect(() => {
    if (!open) return;
    setToken("");
    setError(null);
    setLogin(null);
    setStored(tokens.get() !== null);
  }, [open, tokens]);

  const save = async () => {
    const value = token.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await new GitHubProvider(value).getUser();
      tokens.set(value);
      setStored(true);
      setLogin(user.login);
      setToken("");
    } catch (e) {
      setError(gitErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    tokens.clear();
    setStored(false);
    setLogin(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.git.token.title")}</DialogTitle>
          <DialogDescription>{t("project.git.token.description")}</DialogDescription>
        </DialogHeader>
        <SubmitOnEnter onSubmit={() => void save()}>
          <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <a
              href={NEW_TOKEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {t("project.git.token.createLink")}
            </a>
            {". "}
            {t("project.git.token.scope")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="github-token">{t("project.git.token.label")}</Label>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              placeholder={t("project.git.token.placeholder")}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          {login && <p className="text-sm">{t("project.git.token.signedIn", { login })}</p>}
          {!login && stored && <p className="text-sm text-muted-foreground">{t("project.git.token.stored")}</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          </div>
        </SubmitOnEnter>
        <DialogFooter>
          {stored && (
            <Button variant="outline" onClick={forget} disabled={busy}>
              {t("project.git.token.forget")}
            </Button>
          )}
          {login ? (
            <Button variant="accent" onClick={() => onOpenChange(false)}>
              {t("project.git.token.done")}
            </Button>
          ) : (
            <Button variant="accent" onClick={() => void save()} disabled={busy || !token.trim()}>
              {busy ? t("project.git.token.validating") : t("project.git.token.save")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
