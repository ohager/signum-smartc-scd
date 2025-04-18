import { addProjectAtom, projectsAtom } from "@/stores/project-atoms";
import { useAtomValue, useSetAtom } from "jotai";

export function useProjects() {
  const projects = useAtomValue(projectsAtom);
  const addProject = useSetAtom(addProjectAtom);
  return {
    projects,
    addProject,
  };
}
