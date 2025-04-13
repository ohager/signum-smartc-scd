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
import { useProjects } from "@/hooks/use-projects";
import { replaceWhitespace } from "@/lib/string";
import { useState } from "react";

export function NewProjectDialog() {
  const [name, setName] = useState("");
  const { addProject, addFile } = useProjects();

  const handleCreateClicked = () => {
    const projectId = addProject(name);
    const fileName = replaceWhitespace(name);

    addFile({
      projectId,
      type: "abi",
      fileName: `${fileName}.abi.json`,
    });

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
      <DialogFooter>
        <Button onClick={handleCreateClicked} disabled={name.length < 3}>
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
