import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { replaceWhitespace } from "@/lib/string";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { FileTypes } from "@/features/project/filetype-icons.tsx";
import { smartcStarter } from "./smartc-starter";
import { uniqueName } from "./file-naming";
import { t } from "@/i18n/runtime";

type ProjectType = "create" | "inspect";

interface Props {
  close: () => void;
}

export function NewProjectDialog({ close }: Props) {
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | string>(
    "create",
  );

  const fs = useFileSystem()
  const canSubmit = name.length > 3;

  const handleCreateClicked = async () => {
    if (!canSubmit) return;

    // Sibling names are unique, and the file system rejects a clash rather
    // than silently merging projects. Every other creating path in the app
    // (New Folder, ZIP import) settles this the same way.
    const takenNames = fs
      .listFolderContents()
      .folders.map((f) => f.metadata.name);
    const folderId = await fs.createFolder(
      fs.rootFolderId,
      uniqueName(name, takenNames),
    );
    const fileName = replaceWhitespace(name);

    if (projectType === "create") {
      const baseName = fileName.toLowerCase();
      await fs.addFile(
        folderId,
        `${baseName}.smart.c`,
        FileTypes.SmartC,
        smartcStarter(baseName),
      )
    }

    close();
  };

  const description = projectType === "create"
    ? t("project.newProject.createDescription")
    : t("project.newProject.inspectDescription");

  return (
    <DialogContent className="sm:max-w-[425px]">
      <SubmitOnEnter onSubmit={handleCreateClicked} isEnabled={canSubmit}>
        <DialogHeader>
          <DialogTitle>{t("project.newProject.title")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-y-2 my-4">
          <Label htmlFor="type">{t("project.newProject.type")}</Label>
          <Select name="type" value={projectType} onValueChange={setProjectType}>
            <SelectTrigger>
              <SelectValue placeholder={t("project.newProject.selectType")} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={"create"}>
                  {t("project.newProject.create")}
                </SelectItem>
                <SelectItem value={"inspect"}>
                  {t("project.newProject.inspect")}
                </SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="name">{t("project.newProject.name")}</Label>
            <Input
              id="name"
              placeholder={t("project.newProject.namePlaceholder")}
              className="col-span-3"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </section>
        <DialogFooter className="mt-4">
          <Button onClick={handleCreateClicked}>{t("common.actions.create")}</Button>
        </DialogFooter>
      </SubmitOnEnter>
    </DialogContent>
  );
}
