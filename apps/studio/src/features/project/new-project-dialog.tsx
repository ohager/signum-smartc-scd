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
import { useSingleProject } from "@/hooks/use-single-project";
import { replaceWhitespace } from "@/lib/string";
import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { FieldLabel } from "@/components/ui/field-label.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";

type ProjectType = "create" | "inspect";

interface Props {
  close: () => void;
}

export function NewProjectDialog({ close }: Props) {
  const [name, setName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | string>(
    "create",
  );
  const { addProject } = useProjects();
  const { addFile } = useSingleProject();
  const canSubmit = name.length > 3;

  const handleCreateClicked = () => {
    if (!canSubmit) return;

    const projectId = addProject(name);
    const fileName = replaceWhitespace(name);

    if (projectType === "create") {
      addFile({
        projectId,
        type: "scd",
        fileName: `${fileName.toLowerCase()}.scd.json`,
      });
    }

    close();
  };

  const description = projectType === "create"
    ? "Add a new Smart Contract project to your workspace."
    : "Create a Smart Contract inspection project";

  return (
    <DialogContent className="sm:max-w-[425px]">
      <SubmitOnEnter onSubmit={handleCreateClicked} isEnabled={canSubmit}>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <section className="flex flex-col gap-y-2 my-4">
          <Label htmlFor="type">Project Type</Label>
          <Select name="type" value={projectType} onValueChange={setProjectType}>
            <SelectTrigger>
              <SelectValue placeholder="Select Project Type" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={"create"}>
                  Create new Smart Contract
                </SelectItem>
                <SelectItem value={"inspect"}>
                  Inspect Smart Contract(s)
                </SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My new project"
              className="col-span-3"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </section>
        <DialogFooter className="mt-4">
          <Button onClick={handleCreateClicked}>Create</Button>
        </DialogFooter>
      </SubmitOnEnter>
    </DialogContent>
  );
}
