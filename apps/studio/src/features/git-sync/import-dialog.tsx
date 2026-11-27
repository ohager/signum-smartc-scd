import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
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
import { useFileSystem } from "@/hooks/use-file-system";
import { summarizeProject } from "@/features/home/project-summary";
import { GitHubProvider } from "@/lib/git-sync/github-provider";
import { GitSyncError } from "@/lib/git-sync/errors";
import { MARKER_FILE, SUPPORTED_FORMAT } from "@/lib/git-sync/marker";
import type { RepoRef } from "@/lib/git-sync/provider";
import { t } from "@/i18n/runtime";
import { gitErrorMessage } from "./git-error-message";
import { toastGitError } from "./git-error-toast";
import { importableFolders, nestedMarkerFolders } from "./marker-folders";
import { useGitSync } from "./git-sync-context";
import { parseRepo } from "./parse-repo";
import type { RepoProbe } from "./sync-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isBelow = (path: string, folder: string) => folder === "" || path.startsWith(`${folder}/`);
/** Radix Select reads "" as "no value", so the repo root travels as this sentinel. */
const ROOT = "/";
const folderLabel = (folder: string) => folder || t("project.git.import.rootFolder");

/** A folder may hold a marker only if no other marker folder lies above or below it. */
function canInitialize(probe: RepoProbe, folder: string): boolean {
  return !probe.markers.some(
    (m) => m.folder !== folder && (isBelow(m.folder, folder) || isBelow(folder, m.folder)),
  ) && !probe.markers.some((m) => m.folder === folder && m.marker);
}

export function ImportFromGitHubDialog({ open, onOpenChange }: Props) {
  const { sync, tokens, requireToken, openTokenDialog } = useGitSync();
  const fs = useFileSystem();
  const navigate = useNavigate();

  const [repoText, setRepoText] = useState("");
  const [ref, setRef] = useState<RepoRef | null>(null);
  const [branch, setBranch] = useState("");
  const [probe, setProbe] = useState<RepoProbe | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [initFolder, setInitFolder] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"lookup" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setProbe(null);
    setRef(null);
    setFolder(null);
    setInitializing(false);
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
    setProbe(result);
    setBranch(branchName);
    setFolder(importableFolders(result)[0] ?? null);
    const invalid = result.markers.find((m) => !m.marker);
    const free = result.folders.find((f) => canInitialize(result, f));
    setInitFolder(invalid?.folder ?? free ?? "");
    setInitializing(false);
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

  const finish = async (target: RepoRef, targetBranch: string, targetFolder: string) => {
    const res = await sync.importProject(target, targetBranch, targetFolder);
    toast.success(
      res.skipped.length
        ? t("common.import.doneWithSkipped", { count: res.imported, skipped: res.skipped.length })
        : t("common.import.done", { count: res.imported }),
      res.skipped.length
        ? { description: t("project.git.import.skippedNames", { names: res.skipped.join(", ") }) }
        : undefined,
    );
    onOpenChange(false);
    const main = summarizeProject(fs, res.projectId).mainFileId;
    navigate(main ? `/projects/${res.projectId}/files/${main}` : "/");
  };

  const runImport = async () => {
    if (!ref || folder === null || busy) return;
    setBusy("import");
    setError(null);
    try {
      await finish(ref, branch, folder);
    } catch (e) {
      report(e);
    } finally {
      setBusy(null);
    }
  };

  const runInitialize = async () => {
    if (!ref || !probe || busy || !confirmed) return;
    setBusy("import");
    setError(null);
    try {
      // An empty repo has no branch yet: GitHub creates the default one with the commit.
      const target = probe.branches.length === 0 ? probe.defaultBranch : branch;
      await sync.initialize(ref, probe.branches.length === 0 ? null : target, initFolder);
      await finish(ref, target, initFolder);
    } catch (e) {
      report(e);
    } finally {
      setBusy(null);
    }
  };

  const importable = probe ? importableFolders(probe) : [];
  const nestedFolders = probe ? nestedMarkerFolders(probe) : [];
  const invalidAtInit = probe?.markers.find((m) => m.folder === initFolder && !m.marker);
  const canOfferInit = probe !== null && (probe.markers.length === 0 || probe.markers.some((m) => !m.marker));
  const validMarkers = probe?.markers.filter((m) => m.marker) ?? [];
  const invalidMarkers = probe?.markers.filter((m) => !m.marker) ?? [];
  const initFolders = useMemo(
    () => (probe ? probe.folders.filter((f) => canInitialize(probe, f)) : []),
    [probe],
  );
  const repoName = ref ? `${ref.owner}/${ref.repo}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.git.import.title")}</DialogTitle>
          <DialogDescription>{t("project.git.import.description")}</DialogDescription>
        </DialogHeader>

        <SubmitOnEnter onSubmit={() => void lookup()} isEnabled={!probe}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="github-repo">{t("project.git.import.repo")}</Label>
              <div className="flex gap-2">
                <Input
                  id="github-repo"
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

        {probe && validMarkers.length > 0 && !initializing && (
          <div className="space-y-2">
            <Label>{t("project.git.import.folders")}</Label>
            <RadioGroup value={folder ?? ""} onValueChange={setFolder}>
              {validMarkers.map(({ folder: f, marker }) => {
                const stats = probe.folderStats(f);
                const unsupported = marker!.format > SUPPORTED_FORMAT;
                const disabled = !importable.includes(f);
                return (
                  <div key={f || "/"} className="flex items-start gap-2">
                    <RadioGroupItem id={`folder-${f}`} value={f} disabled={disabled} className="mt-1" />
                    <Label htmlFor={`folder-${f}`} className="flex flex-col items-start gap-0.5 font-normal">
                      <span className="font-mono text-sm">{folderLabel(f)}</span>
                      <span className="text-xs text-muted-foreground">
                        {unsupported
                          ? t("project.git.errors.format_unsupported")
                          : t("project.git.import.folderStats", stats)}
                      </span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
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
            {probe.branches.length === 0 ? t("project.git.import.emptyRepo") : t("project.git.import.noMarker")}
          </p>
        )}

        {probe && initializing && (
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
                  {initFolders.map((f) => (
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
                    branch: probe.branches.length === 0 ? probe.defaultBranch : branch,
                    marker: initFolder ? `${initFolder}/${MARKER_FILE}` : MARKER_FILE,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="init-confirm"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(v === true)}
                  />
                  <Label htmlFor="init-confirm" className="font-normal">
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
            {initializing ? (
              <>
                <Button variant="outline" onClick={() => setInitializing(false)} disabled={busy !== null}>
                  {t("project.git.import.back")}
                </Button>
                <Button
                  variant="accent"
                  onClick={() => void runInitialize()}
                  disabled={busy !== null || !confirmed || !probe.canPush || initFolders.length === 0}
                >
                  {busy === "import" ? t("project.git.import.importing") : t("project.git.import.initialize")}
                </Button>
              </>
            ) : (
              <>
                {canOfferInit && (
                  <Button variant="outline" onClick={() => setInitializing(true)} disabled={busy !== null}>
                    {t("project.git.import.initialize")}
                  </Button>
                )}
                {validMarkers.length > 0 && (
                  <Button
                    variant="accent"
                    onClick={() => void runImport()}
                    disabled={busy !== null || folder === null}
                  >
                    {busy === "import" ? t("project.git.import.importing") : t("project.git.import.import")}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
