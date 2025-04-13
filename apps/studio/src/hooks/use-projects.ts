import {
  addFileAtom,
  addProjectAtom,
  deleteFileAtom,
  deleteProjectAtom,
  getFileAtom,
  projectsAtom,
} from "@/stores/projectAtoms";
import { useAtomValue, useSetAtom } from "jotai";

export function useProjects() {
  const projects = useAtomValue(projectsAtom);
  const addProject = useSetAtom(addProjectAtom);
  const addFile = useSetAtom(addFileAtom);
  const deleteFile = useSetAtom(deleteFileAtom);
  const deleteProject = useSetAtom(deleteProjectAtom);
  const getFile = useAtomValue(getFileAtom);
  return {
    projects,
    addProject,
    deleteProject,
    deleteFile,
    addFile,
    getFile,
  };
}
