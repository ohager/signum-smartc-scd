# File & Project Management (Project Explorer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the sidebar into a recursive project explorer: create files (SmartC/Scenario) and subfolders at any depth, rename/delete folders + files, move files by drag & drop, highlight the active file, and remove the dead legacy store.

**Architecture:** Add `FileSystem.renameFile` + a `file:renamed` event. A pure `file-naming.ts` handles extensions/dedup. Two reusable dialogs (`NewFileDialog`, `NameInputDialog`) drive creation/rename. A recursive `FolderNode` (replacing `ProjectSidebarItem`) renders folders → subfolders + `FileSidebarItem`s, acts as a drop target, and hosts the context menu. `FileSidebarItem` becomes a drag source with a wired rename + active highlight.

**Tech Stack:** Bun + `bun:test`, React 19, react-router (`useMatch`), Tailwind (shadcn), HTML5 drag & drop.

**Working directory:** `apps/studio` (paths relative to it). Branch: `development`.

**Gates:**
- Logic: `bun test src/features/project`
- Transpile: `bun run build`
- Targeted typecheck: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/project|components/ui/layout|lib/file-system"` — expected **empty** (the known monaco errors live under `features/simulator`, not these paths).

---

## File Structure

**New:** `features/project/file-naming.ts` (+ test), `features/project/name-input-dialog.tsx`, `features/project/new-file-dialog.tsx`, `features/project/folder-node.tsx`.
**Modify:** `lib/file-system/file-system-types.ts`, `lib/file-system/file-system.ts`, `features/project/file-sidebar-item.tsx`, `components/ui/layout/left-sidebar.tsx`.
**Delete (Task 7):** `features/project/project-sidebar-item.tsx`, `stores/project-atoms.ts`.

---

### Task 1: Pure file-naming helpers

**Files:**
- Create: `src/features/project/file-naming.ts`
- Test: `src/features/project/file-naming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/project/file-naming.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { withExtension, uniqueName } from "./file-naming";

describe("withExtension", () => {
  it("adds the extension when missing", () => {
    expect(withExtension("foo", ".smart.c")).toBe("foo.smart.c");
  });
  it("is idempotent when already present", () => {
    expect(withExtension("foo.smart.c", ".smart.c")).toBe("foo.smart.c");
  });
});

describe("uniqueName", () => {
  it("returns the name unchanged when there is no collision", () => {
    expect(uniqueName("foo", [], "")).toBe("foo");
  });
  it("appends -2 on collision (no extension)", () => {
    expect(uniqueName("foo", ["foo"], "")).toBe("foo-2");
  });
  it("inserts -N before the extension", () => {
    expect(uniqueName("a.smart.c", ["a.smart.c"], ".smart.c")).toBe("a-2.smart.c");
    expect(uniqueName("a.smart.c", ["a.smart.c", "a-2.smart.c"], ".smart.c")).toBe("a-3.smart.c");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/project/file-naming.test.ts`
Expected: FAIL ("Cannot find module './file-naming'").

- [ ] **Step 3: Implement**

Create `src/features/project/file-naming.ts`:

```ts
/** Ensure `name` ends with exactly one `ext` (idempotent). */
export function withExtension(name: string, ext: string): string {
  const base = name.endsWith(ext) ? name.slice(0, -ext.length) : name;
  return base + ext;
}

/**
 * Return a name not present in `existing`, appending -2, -3, … before the optional
 * extension. `name` may already include `ext`.
 */
export function uniqueName(name: string, existing: Iterable<string>, ext = ""): string {
  const set = new Set(existing);
  const base = ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
  let candidate = base + ext;
  for (let n = 2; set.has(candidate); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/project/file-naming.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project/file-naming.ts apps/studio/src/features/project/file-naming.test.ts
git commit -m "feat(studio): pure file-naming helpers (withExtension, uniqueName)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: FileSystem.renameFile + file:renamed event

**Files:**
- Modify: `src/lib/file-system/file-system-types.ts`
- Modify: `src/lib/file-system/file-system.ts`

- [ ] **Step 1: Add the event type**

In `src/lib/file-system/file-system-types.ts`, add `"file:renamed"` to the union:

```ts
export type FileSystemEventType =
  | "file:*"
  | "file:added"
  | "file:deleted"
  | "file:updated"
  | "file:renamed"
  | "file:moved"
  | "folder:*"
  | "folder:created"
  | "folder:deleted"
  | "folder:renamed";
```

- [ ] **Step 2: Add the `renameFile` method**

In `src/lib/file-system/file-system.ts`, add this method right after `saveFile` (before `deleteFile`):

```ts
  /**
   * Renames a file (name + path). The file `type` is preserved.
   *
   * @param {string} fileId - The identifier of the file to rename.
   * @param {string} newName - The new file name.
   * @return {Promise<void>}
   * @throws {Error} If the file does not exist.
   */
  async renameFile(fileId: string, newName: string): Promise<void> {
    const meta = this.metadata.files[fileId];
    if (!meta) {
      throw new Error(`File not found: ${fileId}`);
    }

    const folderId = this.getFolderIdOfFile(fileId);
    const folderPath = folderId ? this.metadata.folders[folderId].path : "";

    meta.name = newName;
    meta.path = `${folderPath === "/" ? "" : folderPath}/${newName}`;
    meta.lastModified = Date.now();
    this.saveMetadata();

    this.emitEvent({
      type: "file:renamed",
      id: fileId,
      metadata: meta
    });
  }
```

- [ ] **Step 3: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "lib/file-system"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/lib/file-system/file-system-types.ts apps/studio/src/lib/file-system/file-system.ts
git commit -m "feat(studio): FileSystem.renameFile + file:renamed event

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reusable dialogs (NameInputDialog + NewFileDialog)

**Files:**
- Create: `src/features/project/name-input-dialog.tsx`
- Create: `src/features/project/new-file-dialog.tsx`

- [ ] **Step 1: Create NameInputDialog**

Create `src/features/project/name-input-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  validate?: (name: string) => string | null;
  onSubmit: (name: string) => void;
}

export function NameInputDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = "",
  submitLabel = "Save",
  validate,
  onSubmit,
}: Props) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  const error = trimmed && trimmed !== initialValue ? (validate?.(trimmed) ?? null) : null;
  const canSubmit = trimmed.length > 0 && trimmed !== initialValue && !error;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <SubmitOnEnter onSubmit={submit} isEnabled={canSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-y-2 my-4">
            <Label htmlFor="name-input">{label}</Label>
            <Input id="name-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create NewFileDialog**

Create `src/features/project/new-file-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileTypes } from "./filetype-icons";
import { replaceWhitespace } from "@/lib/string";
import { withExtension, uniqueName } from "./file-naming";
import { serializeScenario, defaultScenario } from "@/features/simulator/scenario/scenario-io";

const SMARTC_STARTER = "// New Signum SmartC contract — start coding here.\n";
const EXT: Record<string, string> = {
  [FileTypes.SmartC]: ".smart.c",
  [FileTypes.Scenario]: ".scenario.json",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onCreate: (name: string, type: FileTypes, content: string) => void;
}

export function NewFileDialog({ open, onOpenChange, existingNames, onCreate }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FileTypes>(FileTypes.SmartC);
  useEffect(() => {
    if (open) {
      setName("");
      setType(FileTypes.SmartC);
    }
  }, [open]);

  const base = replaceWhitespace(name.trim());
  const canSubmit = base.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const ext = EXT[type];
    const finalName = uniqueName(withExtension(base, ext), existingNames, ext);
    const content = type === FileTypes.Scenario ? serializeScenario(defaultScenario()) : SMARTC_STARTER;
    onCreate(finalName, type, content);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <SubmitOnEnter onSubmit={submit} isEnabled={canSubmit}>
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-y-2 my-4">
            <Label htmlFor="new-file-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FileTypes)}>
              <SelectTrigger id="new-file-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FileTypes.SmartC}>SmartC contract (.smart.c)</SelectItem>
                <SelectItem value={FileTypes.Scenario}>Scenario (.scenario.json)</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="new-file-name">Name</Label>
            <Input
              id="new-file-name"
              autoFocus
              placeholder="my-contract"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!canSubmit}>
              Create
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/project"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/project/name-input-dialog.tsx apps/studio/src/features/project/new-file-dialog.tsx
git commit -m "feat(studio): reusable NameInputDialog + NewFileDialog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: FileSidebarItem — drag source, rename, active highlight

**Files:**
- Modify: `src/features/project/file-sidebar-item.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/features/project/file-sidebar-item.tsx`:

```tsx
import { getFileTypeIcon } from "./filetype-icons";
import {
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVerticalIcon } from "lucide-react";
import { useMatch, useNavigate } from "react-router";
import type { FileMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { NameInputDialog } from "./name-input-dialog";
import { useState } from "react";
import { toast } from "sonner";

/** MIME key used when dragging a file onto a folder to move it. */
export const FILE_DND_MIME = "application/x-smartc-fileid";

interface Props {
  file: FileMetadata;
  projectId: string; // parent folder id (for navigation + sibling lookup)
}

export function FileSidebarItem({ file, projectId }: Props) {
  const fs = useFileSystem();
  const FileIcon = getFileTypeIcon(file.type);
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const isActive = !!useMatch(`/projects/${projectId}/files/${file.id}`);
  const siblingNames = new Set(
    fs
      .listFolderContents(projectId)
      .files.map((f) => f.metadata.name)
      .filter((n) => n !== file.name),
  );

  return (
    <SidebarMenuSubItem>
      <div
        className="relative flex items-center cursor-pointer"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(FILE_DND_MIME, file.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <SidebarMenuSubButton
          onClick={() => navigate(`/projects/${projectId}/files/${file.id}`)}
          isActive={isActive}
          className="flex-1"
        >
          <FileIcon className="h-4 w-4" />
          <span>{file.name}</span>
        </SidebarMenuSubButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction className="opacity-0 group-hover/menu-sub-item:opacity-100">
              <MoreVerticalIcon className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            <DropdownMenuItem onClick={() => setShowRename(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDelete(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NameInputDialog
        open={showRename}
        onOpenChange={setShowRename}
        title="Rename File"
        label="File name"
        initialValue={file.name}
        submitLabel="Rename"
        validate={(n) => (siblingNames.has(n) ? "A file with this name already exists" : null)}
        onSubmit={async (n) => {
          try {
            await fs.renameFile(file.id, n);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <ConfirmationDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => fs.deleteFile(file.id)}
        title="Delete File"
        description="Are you sure you want to delete this file? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </SidebarMenuSubItem>
  );
}
```

- [ ] **Step 2: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds. (`ProjectSidebarItem` still renders `<FileSidebarItem file projectId />` — signature unchanged, still compiles.)
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/project"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/project/file-sidebar-item.tsx
git commit -m "feat(studio): file rows — drag source, wired rename, active highlight

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Recursive FolderNode

**Files:**
- Create: `src/features/project/folder-node.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/project/folder-node.tsx`:

```tsx
import { useState } from "react";
import type { DragEvent } from "react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  FilePlus2,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "lucide-react";
import type { FolderMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useNavigate } from "react-router";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { NameInputDialog } from "./name-input-dialog";
import { NewFileDialog } from "./new-file-dialog";
import { FileSidebarItem, FILE_DND_MIME } from "./file-sidebar-item";
import { uniqueName } from "./file-naming";
import { toast } from "sonner";

export function FolderNode({ folder }: { folder: FolderMetadata }) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { folders, files } = fs.listFolderContents(folder.id);
  const fileNames = files.map((f) => f.metadata.name);
  const folderNames = folders.map((f) => f.metadata.name);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const fileId = e.dataTransfer.getData(FILE_DND_MIME);
    if (!fileId) return;
    try {
      await fs.moveFile(fileId, folder.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        <div
          className={"relative flex items-center rounded-sm " + (dropActive ? "bg-blue-500/20" : "")}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(FILE_DND_MIME)) {
              e.preventDefault();
              setDropActive(true);
            }
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={onDrop}
        >
          <SidebarMenuButton onClick={() => setExpanded(!expanded)} className="flex-1 cursor-pointer">
            {expanded ? (
              <>
                <ChevronDownIcon />
                <FolderOpenIcon />
              </>
            ) : (
              <>
                <ChevronRightIcon />
                <FolderIcon />
              </>
            )}
            <span>{folder.name}</span>
          </SidebarMenuButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction className="opacity-0 group-hover/menu-item:opacity-100 cursor-pointer">
                <MoreVerticalIcon className="h-8 w-8" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem onClick={() => setShowNewFile(true)}>
                <FilePlus2 className="h-4 w-4" />
                Add File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewFolder(true)}>
                <FolderPlusIcon className="h-4 w-4" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowRename(true)}>
                <EditIcon className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <TrashIcon className="h-4 w-4" color="red" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {expanded && (folders.length > 0 || files.length > 0) && (
          <SidebarMenuSub>
            {folders.map((f) => (
              <FolderNode key={f.id} folder={f.metadata} />
            ))}
            {files.map((f) => (
              <FileSidebarItem key={f.id} file={f.metadata} projectId={folder.id} />
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>

      <NewFileDialog
        open={showNewFile}
        onOpenChange={setShowNewFile}
        existingNames={fileNames}
        onCreate={async (name, type, content) => {
          try {
            const id = await fs.addFile(folder.id, name, type, content);
            setExpanded(true);
            navigate(`/projects/${folder.id}/files/${id}`);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <NameInputDialog
        open={showNewFolder}
        onOpenChange={setShowNewFolder}
        title="New Folder"
        label="Folder name"
        submitLabel="Create"
        onSubmit={async (n) => {
          try {
            await fs.createFolder(folder.path, uniqueName(n, folderNames));
            setExpanded(true);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <NameInputDialog
        open={showRename}
        onOpenChange={setShowRename}
        title="Rename Folder"
        label="Folder name"
        initialValue={folder.name}
        submitLabel="Rename"
        validate={(n) => (folderNames.includes(n) ? "A folder with this name already exists" : null)}
        onSubmit={async (n) => {
          try {
            await fs.renameFolder(folder.id, n);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <ConfirmationDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => fs.deleteFolder(folder.id)}
        title="Delete Folder"
        description="Delete this folder and all its contents? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
```

- [ ] **Step 2: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds (FolderNode is not imported yet — it just compiles).
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/project"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/project/folder-node.tsx
git commit -m "feat(studio): recursive FolderNode (nested folders, CRUD menu, drop target)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire FolderNode into the sidebar

**Files:**
- Modify: `src/components/ui/layout/left-sidebar.tsx`

- [ ] **Step 1: Swap ProjectSidebarItem → FolderNode**

In `src/components/ui/layout/left-sidebar.tsx`, change the import:

```tsx
import { ProjectSidebarItem } from "@/features/project/project-sidebar-item";
```

to:

```tsx
import { FolderNode } from "@/features/project/folder-node";
```

and the render (the `projects.map(...)` inside the non-empty branch):

```tsx
                projects.map((project) => (
                  <ProjectSidebarItem
                    key={project.id}
                    project={project.metadata}
                  />
                ))
```

to:

```tsx
                projects.map((project) => (
                  <FolderNode key={project.id} folder={project.metadata} />
                ))
```

- [ ] **Step 2: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/ui/layout|features/project"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/components/ui/layout/left-sidebar.tsx
git commit -m "feat(studio): render the recursive FolderNode tree in the sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Remove the dead ProjectSidebarItem + legacy store

**Files:**
- Delete: `src/features/project/project-sidebar-item.tsx`
- Delete: `src/stores/project-atoms.ts`

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "project-sidebar-item\|stores/project-atoms" src --include="*.ts" --include="*.tsx"`
Expected: no matches (both are now unused — `left-sidebar` uses `FolderNode`, and `project-atoms` was only imported by `project-sidebar-item`).

- [ ] **Step 2: Delete**

```bash
git rm apps/studio/src/features/project/project-sidebar-item.tsx apps/studio/src/stores/project-atoms.ts
```

- [ ] **Step 3: Build + typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/project|stores/project-atoms"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(studio): remove dead ProjectSidebarItem + legacy project-atoms store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Tests + build**

Run: `bun test src/features/project`
Expected: PASS.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 2: Manual browser verification**

`bun run dev`:
- Expand a project. Use the folder ⋮ menu → **Add File** → pick SmartC / Scenario, name it → the file is created, the folder expands, and the editor opens it.
- **New Folder** → a subfolder appears; add files inside it (nesting works to multiple levels).
- **Rename** a folder and a file (⋮ → Rename); the tree updates; renaming to an existing sibling name is blocked with a message.
- **Delete** a folder (confirm) → it and its contents disappear from the tree (fixed: uses `fs.deleteFolder`).
- **Drag** a file onto another folder → it moves there (drop target highlights on hover); the tree refreshes.
- The currently open file is highlighted in the tree.

Then hand off via **superpowers:finishing-a-development-branch**.

---

## Self-Review

**Spec coverage:**
- §3 `renameFile` + `file:renamed` → Task 2. ✓
- §3 pure `file-naming` (`withExtension`/`uniqueName`) → Task 1. ✓
- §3 recursive `FolderNode` (nested folders, Add File/New Folder/Rename/Delete, drop target) → Task 5. ✓
- §3 `FileSidebarItem` drag source + rename + active highlight (`useMatch`) → Task 4. ✓
- §3 `NewFileDialog` (type select) + `NameInputDialog` → Task 3. ✓
- §3 sidebar renders the tree → Task 6. ✓
- §2 Delete folder fixed to `fs.deleteFolder` → Task 5 (ConfirmationDialog `onConfirm`). ✓
- §2 move files via drag & drop (`fs.moveFile`) → Task 4 (source) + Task 5 (target). ✓
- §2 remove legacy `project-atoms` → Task 7. ✓
- §6 `file-naming` unit tests → Task 1. ✓

**Placeholder scan:** none.

**Type consistency:** `withExtension`/`uniqueName` (Task 1) are consumed by `NewFileDialog` (Task 3) and `FolderNode` New Folder (Task 5). `FILE_DND_MIME` is exported by `FileSidebarItem` (Task 4) and imported by `FolderNode` (Task 5). `fs.renameFile` (Task 2) is called in `FileSidebarItem` (Task 4). `NameInputDialog` props `{open,onOpenChange,title,label,initialValue?,submitLabel?,validate?,onSubmit}` (Task 3) match all call sites (Tasks 4, 5). `NewFileDialog` props `{open,onOpenChange,existingNames,onCreate}` (Task 3) match the `FolderNode` call site (Task 5). `FileSidebarItem` keeps its `{file, projectId}` signature (Task 4), so the transitional `ProjectSidebarItem` caller still compiles until it is deleted (Task 7). `FolderNode({folder})` (Task 5) matches the sidebar call site (Task 6).
```
