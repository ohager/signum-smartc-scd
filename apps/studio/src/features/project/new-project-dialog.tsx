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
import { useProjects } from "@/hooks/use-projects";
import { replaceWhitespace } from "@/lib/string";
import { useState } from "react";

interface Props {
  close: () => void;
}

export function NewProjectDialog({ close }: Props) {
  const [name, setName] = useState("");
  const { addProject, addFile } = useProjects();
  const canSubmit = name.length > 3;

  const handleCreateClicked = () => {
    if (!canSubmit) return;

    const projectId = addProject(name);
    const fileName = replaceWhitespace(name);

    addFile({
      projectId,
      type: "scd",
      fileName: `${fileName.toLowerCase()}.scd.json`,
    });

    close();
    // addFile({
    //   projectId,
    //   type: "contract",
    //   fileName: `${fileName}.smart.c`,
    // });
    // addFile({
    //   projectId,
    //   type: "test",
    //   fileName: `${fileName}.test.ts`,
    // });
    // addFile({
    //   projectId,
    //   type: "doc",
    //   fileName: `${fileName}.md`,
    // });
  };

  return (
    <DialogContent className="sm:max-w-[425px]">
      <SubmitOnEnter onSubmit={handleCreateClicked} isEnabled={canSubmit}>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Add a new SmartContract project to your workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="My new project"
            className="col-span-3"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={handleCreateClicked}>Create</Button>
        </DialogFooter>
      </SubmitOnEnter>
    </DialogContent>
  );
}
