import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { GitHubProvider } from "@/lib/git-sync/github-provider";
import { GitSyncError } from "@/lib/git-sync/errors";
import { MARKER_FILE, SUPPORTED_FORMAT } from "@/lib/git-sync/marker";
import type { RepoRef } from "@/lib/git-sync/provider";
import { t } from "@/i18n/runtime";
import { gitErrorMessage } from "./git-error-message";
import { toastGitError } from "./git-error-toast";
import { canInitialize, importableFolders, nestedMarkerFolders } from "./marker-folders";
import { useGitSync } from "./git-sync-context";
import { parseRepo } from "./parse-repo";
import type { PreparedPull, RepoProbe } from "./sync-service";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The link needs conflicts resolved before it is complete. */
  onConflicts: (prepared: PreparedPull) => void;
}

/** Radix Select reads "" as "no value", so the repo root travels as this sentinel. */
const ROOT = "/";
const folderLabel = (folder: string) => folder || t("project.git.import.rootFolder");

export function LinkDialog({ projectId, open, onOpenChange, onConflicts }: Props) {
  const { sync, tokens, requireToken, openTokenDialog } = useGitSync();

  const [repoText, setRepoText] = useState("");
  const [ref, setRef] = useState<RepoRef | null>(null);
  const [branch, setBranch] = useState("");
  const [probe, setProbe] = useState<RepoProbe | null>(null);
  const [mode, setMode] = useState<"existing" | "init">("existing");
  const [folder, setFolder] = useState<string | null>(null);
  const [initFolder, setInitFolder] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"lookup" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setProbe(null);
    setRef(null);
    setFolder(null);
    setConfirmed(false);
    setError(null);
    setBusy(null);
  }, [open]);

  /** Token problems get a toast with a "Change token" action; everything else shows inline. */
  const report = (e: unknown) => {
    if (e instanceof GitSyncError && (e.code === "auth" || e.code === "forbidden")) toastGitError(e, openTokenDialog);
    else setError(gitErrorMessage(e));
  };

  const runProbe = async (target: RepoRef, branchName: string) => {
    const result = await sync.probe(target, branchName);
    const first = importableFolders(result)[0] ?? null;
    const invalid = result.markers.find((m) => !m.marker);
    const free = result.folders.find((f) => canInitialize(result, f));
    setProbe(result);
    setBranch(branchName);
    setFolder(first);
    setMode(first !== null ? "existing" : "init");
    setInitFolder(invalid?.folder ?? free ?? "");
    setConfirmed(false);
  };

  const lookup = async () => {
    if (busy) return;
    const parsed = parseRepo(repoText);
    if (!parsed) {
      setError(t("project.git.import.repoInvalid"));
      return;
    }
    if (!(await requireToken())) return;
    setBusy("lookup");
    setError(null);
    setProbe(null);
    try {
      const token = tokens.get();
      if (!token) throw new GitSyncError("no_token", "No GitHub token.");
      const { defaultBranch } = await new GitHubProvider(token).getRepo(parsed);
      setRef(parsed);
      await runProbe(parsed, defaultBranch);
    } catch (e) {
      report(e);
    } finally {
      setBusy(null);
    }
  };

  const changeBranch = async (name: string) => {
    if (!ref) return;
    setBusy("lookup");
    setError(null);
    try {
      await runProbe(ref, name);
    } catch (e) {
      report(e);
    } finally {
      setBusy(null);
    }
  };

  const emptyRepo = probe?.branches.length === 0;
  const targetFolder = mode === "existing" ? folder : initFolder;
  const canLink =
    probe !== null &&
    targetFolder !== null &&
    (mode === "existing" || (probe.canPush && confirmed && initFolders(probe).length > 0));

  const runLink = async () => {
    if (!ref || !probe || targetFolder === null || busy || !canLink) return;
    setBusy("link");
    setError(null);
    try {
      const prepared = await sync.linkProject(projectId, ref, emptyRepo ? null : branch, targetFolder);
      onOpenChange(false);
      if (prepared) onConflicts(prepared);
      else toast.success(t("project.git.link.linked", { repo: `${ref.owner}/${ref.repo}` }));
    } catch (e) {
      report(e);
    } finally {
      setBusy(null);
    }
  };

  const importable = probe ? importableFolders(probe) : [];
  const nestedFolders = probe ? nestedMarkerFolders(probe) : [];
  const validMarkers = probe?.markers.filter((m) => m.marker) ?? [];
  const invalidMarkers = probe?.markers.filter((m) => !m.marker) ?? [];
  const invalidAtInit = probe?.markers.find((m) => m.folder === initFolder && !m.marker);
  const initChoices = useMemo(() => (probe ? initFolders(probe) : []), [probe]);
  const repoName = ref ? `${ref.owner}/${ref.repo}` : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.git.link.title")}</DialogTitle>
          <DialogDescription>{t("project.git.link.description")}</DialogDescription>
        </DialogHeader>

        <SubmitOnEnter onSubmit={() => void lookup()} isEnabled={!probe}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="link-repo">{t("project.git.import.repo")}</Label>
              <div className="flex gap-2">
                <Input
                  id="link-repo"
                  value={repoText}
                  placeholder={t("project.git.import.repoPlaceholder")}
                  spellCheck={false}
                  onChange={(e) => {
                    setRepoText(e.target.value);
                    setProbe(null);
                    setError(null);
                  }}
                />
                <Button variant="outline" onClick={() => void lookup()} disabled={busy !== null || !repoText.trim()}>
                  {busy === "lookup" && !probe ? t("project.git.import.loading") : t("project.git.import.load")}
                </Button>
              </div>
            </div>

            {probe && probe.branches.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("project.git.import.branch")}</Label>
                <Select value={branch} onValueChange={(v) => void changeBranch(v)} disabled={busy !== null}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {probe.branches.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </SubmitOnEnter>

        {probe && (
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "existing" | "init")}>
            {validMarkers.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="mode-existing" value="existing" disabled={importable.length === 0} />
                  <Label htmlFor="mode-existing">{t("project.git.link.existingFolder")}</Label>
                </div>
                {mode === "existing" && (
                  <RadioGroup value={folder ?? ""} onValueChange={setFolder} className="pl-6">
                    {validMarkers.map(({ folder: f, marker }) => {
                      const unsupported = marker!.format > SUPPORTED_FORMAT;
                      return (
                        <div key={f || "/"} className="flex items-start gap-2">
                          <RadioGroupItem
                            id={`link-folder-${f}`}
                            value={f}
                            disabled={!importable.includes(f)}
                            className="mt-1"
                          />
                          <Label htmlFor={`link-folder-${f}`} className="flex flex-col items-start gap-0.5 font-normal">
                            <span className="font-mono text-sm">{folderLabel(f)}</span>
                            <span className="text-xs text-muted-foreground">
                              {unsupported
                                ? t("project.git.errors.format_unsupported")
                                : t("project.git.import.folderStats", probe.folderStats(f))}
                            </span>
                          </Label>
                        </div>
                      );
                    })}
                  </RadioGroup>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <RadioGroupItem id="mode-init" value="init" disabled={initChoices.length === 0} />
              <Label htmlFor="mode-init">{t("project.git.link.newFolder")}</Label>
            </div>
          </RadioGroup>
        )}

        {probe && nestedFolders.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("project.git.import.nested", { paths: nestedFolders.map(folderLabel).join(", ") })}
          </p>
        )}

        {probe && invalidMarkers.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {invalidMarkers.map((m) => (
              <li key={m.folder || "/"}>
                <span className="font-mono">{folderLabel(m.folder)}</span>
                {" — "}
                {t("project.git.import.invalidMarker", { reason: m.error ?? "" })}
              </li>
            ))}
          </ul>
        )}

        {probe && validMarkers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {emptyRepo ? t("project.git.import.emptyRepo") : t("project.git.import.noMarker")}
          </p>
        )}

        {probe && mode === "init" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("project.git.import.initFolder")}</Label>
              <Select
                value={initFolder === "" ? ROOT : initFolder}
                onValueChange={(v) => {
                  setInitFolder(v === ROOT ? "" : v);
                  setConfirmed(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {initChoices.map((f) => (
                    <SelectItem key={f || ROOT} value={f === "" ? ROOT : f}>
                      {folderLabel(f)} · {t("project.git.import.folderStats", probe.folderStats(f))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {probe.canPush ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {t(invalidAtInit ? "project.git.import.initConfirmOverwrite" : "project.git.import.initConfirm", {
                    repo: repoName,
                    branch: emptyRepo ? probe.defaultBranch : branch,
                    marker: initFolder ? `${initFolder}/${MARKER_FILE}` : MARKER_FILE,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="link-init-confirm"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor="link-init-confirm" className="font-normal">
                    {t("project.git.import.initConfirmLabel")}
                  </Label>
                </div>
              </div>
            ) : (
              <p role="alert" className="text-sm text-destructive">
                {t("project.git.import.cannotPush")}
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => void openTokenDialog()}
        >
          {t("project.git.token.open")}
        </button>

        {probe && (
          <DialogFooter>
            <Button variant="accent" onClick={() => void runLink()} disabled={busy !== null || !canLink}>
              {busy === "link" ? t("project.git.link.linking") : t("project.git.link.link")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const initFolders = (probe: RepoProbe) => probe.folders.filter((f) => canInitialize(probe, f));
