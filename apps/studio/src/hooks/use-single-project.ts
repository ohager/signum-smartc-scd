import {
  addFileAtom,
  deleteFileAtom,
  deleteProjectAtom,
} from "@/stores/project-atoms";
import { useSetAtom } from "jotai";

export function useSingleProject() {
  const addFile = useSetAtom(addFileAtom);
  const deleteFile = useSetAtom(deleteFileAtom);
  const deleteProject = useSetAtom(deleteProjectAtom);
  return {
    deleteProject,
    deleteFile,
    addFile,
  };
}
