import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,

} from "../sidebar";

import {
  SettingsIcon,
  PlusIcon,
  UploadIcon,
  CrosshairIcon,
  HouseIcon,
} from "lucide-react";
import { Button } from "../button";
import { Dialog, DialogTrigger } from "../dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { FolderNode } from "@/features/project/folder-node";
import { useEffect, useRef, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { LocaleSwitch } from "@/components/locale-switch";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { acceptedFileType } from "@/features/project/filetype-icons";
import { uniqueName } from "@/features/project/file-naming";
import { findFolderChainToFile } from "@/features/project/tree-reveal";
import { revealFileRequestAtom } from "@/stores/project-tree-atoms";
import { useSetAtom } from "jotai";
import { Link, useMatch } from "react-router";
import { toast } from "sonner";
import { WalletStatusCard } from "@/components/ui/wallet-status-card.tsx";
import { APP_VERSION, IS_PRERELEASE } from "@/lib/version";
import { t } from "@/i18n/runtime";
import { RegisterMark } from "@/components/brand/register-mark";

const footerItems = [
  {
    title: "Settings", // i18n-ignore — footer is commented out below
    url: "#",
    icon: SettingsIcon,
  },
];

export function LeftSidebar() {
  const fs = useFileSystem();

  const [projects, setProjects] = useState([
    ...fs.listFolderContents().folders,
  ]);

  useEffect(() => {
    function updateFolders() {
      setProjects([...fs.listFolderContents().folders]);
    }

    // Deliberately not "file:*": that includes file:updated, which autosave
    // now fires while you type, and rebuilding the tree on every keystroke
    // pause would collapse nothing but waste a render each time. Only the
    // events that change the shape of the tree are worth listening to.
    const structural = [
      "file:added",
      "file:deleted",
      "file:renamed",
      "file:moved",
      "folder:*",
      "fs:reloaded",
    ] as const;

    for (const event of structural) fs.addEventListener(event, updateFolders);
    return () => {
      for (const event of structural) fs.removeEventListener(event, updateFolders);
    };
  }, []);


  const [isOpen, setIsOpen] = useState(false);

  const openedFileId = useMatch("/projects/:projectId/files/:fileId")?.params.fileId;
  const isHome = !!useMatch("/");
  const setRevealRequest = useSetAtom(revealFileRequestAtom);

  const onSelectOpenedFile = () => {
    if (!openedFileId) return;
    const chain = findFolderChainToFile(fs, openedFileId);
    if (!chain.length) return;
    setRevealRequest({ fileId: openedFileId, folderIds: new Set(chain) });
  };

  const importInputRef = useRef<HTMLInputElement>(null);

  const onImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const rootNames = fs.listFolderContents().folders.map((f) => f.metadata.name);
        const base = file.name.replace(/\.zip$/i, "");
        const folderId = await fs.createFolder(fs.rootFolderId, uniqueName(base, rootNames));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folderId, bytes, acceptedFileType);
        toast.success(
          res.skipped
            ? t("common.import.doneWithSkipped", { count: res.imported, skipped: res.skipped })
            : t("common.import.done", { count: res.imported }),
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <Sidebar>
      <SidebarContent>
        {/* The only Orbitron in the app. Keeping it to one element is what
            makes it a wordmark rather than a costume. */}
        <div className="flex items-center gap-2 border-b border-[var(--border-1)] px-3 py-3">
          <RegisterMark size={12} />
          <span
            className="text-[12px] font-black tracking-[3px] text-[var(--text)]"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            {/* i18n-ignore — wordmark */}
            STUDIO
          </span>
          {IS_PRERELEASE && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="ml-auto rounded-sm border border-[var(--accent-2)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-2)] cursor-default">
                  {t("common.sidebar.alpha")}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("common.sidebar.prerelease", { version: APP_VERSION })}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isHome}>
                  <Link to="/">
                    <HouseIcon className="h-4 w-4" />
                    <span>{t("common.sidebar.home")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="w-full flex justify-between items-center">
              {t("common.sidebar.projects")}
              <div className="flex items-center gap-1">
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger>
                    <Tooltip delayDuration={1000}>
                      <TooltipTrigger>
                        <PlusIcon className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("common.sidebar.addProject")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </DialogTrigger>
                  <NewProjectDialog close={() => setIsOpen(false)} />
                </Dialog>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <UploadIcon
                      onClick={() => importInputRef.current?.click()}
                      className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("common.sidebar.importProject")}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <CrosshairIcon
                      aria-label={t("common.sidebar.selectOpenedFile")}
                      onClick={onSelectOpenedFile}
                      className={
                        "h-6 w-6 p-1 rounded-sm " +
                        (openedFileId
                          ? "hover:bg-black/5 cursor-pointer"
                          : "opacity-40 cursor-default")
                      }
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("common.sidebar.selectOpenedFile")}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              hidden
              onChange={onImportProject}
            />
            <SidebarMenu>
              {projects.length === 0 ? (
                <SidebarMenuItem className="mx-auto">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        {t("common.sidebar.createProject")}
                      </Button>
                    </DialogTrigger>
                    <NewProjectDialog close={() => setIsOpen(false)} />
                  </Dialog>
                </SidebarMenuItem>
              ) : (
                projects.map((project) => (
                  <FolderNode key={project.id} folder={project.metadata} />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <hr />
        <WalletStatusCard />
        {/*<SidebarMenu>*/}
        {/*  {footerItems.map((item) => (*/}
        {/*    <SidebarMenuItem key={item.title}>*/}
        {/*      <SidebarMenuButton asChild>*/}
        {/*        <a href={item.url}>*/}
        {/*          <item.icon />*/}
        {/*          <span>{item.title}</span>*/}
        {/*        </a>*/}
        {/*      </SidebarMenuButton>*/}
        {/*    </SidebarMenuItem>*/}
        {/*  ))}*/}
        {/*</SidebarMenu>*/}
        <hr />
        <div className="flex items-center justify-between gap-2">
          <ThemeSwitch />
          <LocaleSwitch />
        </div>
      </SidebarFooter>

    </Sidebar>
  );
}
